// Ezial — adaptateur Wave « Checkout » (encaissement uniquement).
//
// Source : documentation officielle Wave Checkout API (docs.wave.com/checkout).
//
//   Création   : POST /v1/checkout/sessions
//   Lecture    : GET  /v1/checkout/sessions/:id
//   Recherche  : GET  /v1/checkout/sessions/search?client_reference=…   → {"result":[session,…]}
//   Expiration : POST /v1/checkout/sessions/:id/expire   (200 corps vide ; 404 ; 403 ; 409 déjà terminée/expirée)
//   Auth       : « Authorization: Bearer {clé API} » (wave_sn_prod_… ou wave_sn_test_…)
//   Signature  : OPTIONNELLE des requêtes : si un secret de signature (wave_sn_AKS_…) est configuré,
//                CHAQUE requête doit porter « Wave-Signature: t={secondes},v1={hex} »,
//                hex = HMAC-SHA256(clé = secret, message = String(t) + corps brut) ; corps vide pour un GET.
//                Wave refuse un horodatage vieux de plus de 5 minutes ou à plus de 30 s dans le futur.
//
// VÉRIFIÉ dans la documentation : tout ce qui précède, plus l'absence d'en-tête d'idempotence à la
// création (d'où la recherche par client_reference AVANT toute création, voir createCheckout).
//
// HYPOTHÈSES (non vérifiées intégralement, signalées « HYPOTHÈSE » plus bas) : le format exact des
// WEBHOOKS (type « checkout.session.completed », données dans `data`, en-tête « Wave-Signature »,
// plusieurs v1 possibles pendant une rotation de secret, identifiant d'événement éventuel). Le
// secret de signature des webhooks est DIFFÉRENT du secret de signature des requêtes.
//
// Règles de sécurité :
//   * les secrets viennent uniquement des variables d'environnement de la fonction Edge (ou du coffre) ;
//   * le contenu d'un webhook ne suffit JAMAIS : le statut et le montant sont toujours redemandés
//     à l'API (GET de la session) avant toute écriture ;
//   * aucun secret ni numéro de téléphone n'apparaît dans une erreur ou un journal ;
//   * l'adresse de paiement renvoyée doit être en https sur wave.com (ou un sous-domaine) ;
//   * aucune API de reversement vendeur n'est utilisée.
//
// TypeScript pur : WebCrypto (`crypto.subtle`) et `fetch` injectable (aucun appel réseau en test).
import type {
  AdapterStatus,
  CheckoutRequest,
  CheckoutResult,
  CollectionAdapter,
  PaymentStatus,
  PaymentStatusResult,
  PaymentsEnvironment,
  WebhookVerification,
} from './core.ts';
import type { FetchLike } from './orange-money.ts';
import { safeEqual } from './orange-money.ts';

export const WAVE_BASE_URL = 'https://api.wave.com';

/** Noms des variables d'environnement (valeurs à saisir dans Supabase → Edge Functions → Secrets, ou dans le coffre). */
export const WAVE_ENV = {
  apiKey: 'WAVE_COLLECTION_API_KEY',
  signingSecret: 'WAVE_COLLECTION_SIGNING_SECRET',
  webhookSecret: 'WAVE_WEBHOOK_SECRET',
} as const;

const KEY_PREFIX: Record<PaymentsEnvironment, string> = {
  production: 'wave_sn_prod_',
  sandbox: 'wave_sn_test_',
};

const REQUEST_TIMEOUT_MS = 15000;
const SESSION_DEFAULT_LIFETIME_MS = 30 * 60 * 1000; // durée de vie par défaut d'une session Wave (non configurable)
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;         // horodatage trop ancien
const MAX_SIGNATURE_FUTURE_MS = 30 * 1000;          // horodatage trop dans le futur
const SESSION_ID = /^cos-[A-Za-z0-9]+$/;

/** Session Wave Checkout, réduite aux champs utiles (valeurs telles que renvoyées par Wave). */
export interface WaveSession {
  id: string;
  amount: string | null;
  currency: string | null;
  checkoutStatus: string | null;
  paymentStatus: string | null;
  clientReference: string | null;
  transactionId: string | null;
  launchUrl: string | null;
  whenExpires: string | null;
}

export type FindResult =
  | { ok: true; sessions: WaveSession[] }
  | { ok: false; error: string; retryable: boolean };

export type ExpireResult = { outcome: 'expired' | 'already_closed' | 'not_found' | 'error'; retryable?: boolean };

// ── Utilitaires ───────────────────────────────────────────────────────────

const HEX = /^[0-9a-f]+$/i;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** HMAC-SHA256 en hexadécimal (WebCrypto). */
async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

function isWaveLaunchUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password) return false;
    return u.hostname === 'wave.com' || u.hostname.endsWith('.wave.com');
  } catch {
    return false;
  }
}

function isHttpsUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https:\/\/[^\s]+$/.test(value);
}

/** Entier strictement positif écrit en chiffres (XOF n'a pas de décimales), sinon null. */
function parseXofAmount(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d{0,14}$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Lecture prudente d'une session Wave ; null si l'identifiant n'a pas la forme « cos-… ». */
function parseSession(raw: unknown): WaveSession | null {
  const r = asRecord(raw);
  if (!r || typeof r.id !== 'string' || !SESSION_ID.test(r.id)) return null;
  return {
    id: r.id,
    amount: str(r.amount),
    currency: str(r.currency),
    checkoutStatus: str(r.checkout_status),
    paymentStatus: str(r.payment_status),
    clientReference: str(r.client_reference),
    transactionId: str(r.transaction_id),
    launchUrl: str(r.wave_launch_url),
    whenExpires: str(r.when_expires),
  };
}

/**
 * Statut Ezial d'une session Wave (sans contrôle du montant, voir getPaymentStatus) :
 *   complete + succeeded           → confirmed
 *   expired  (et pas succeeded)    → expired
 *   open                           → pending, MÊME si payment_status = cancelled / processing :
 *                                    le client peut réessayer dans la même session, seule l'expiration la clôt ;
 *   autre                          → unknown.
 */
export function mapWaveSession(s: Pick<WaveSession, 'checkoutStatus' | 'paymentStatus'>): PaymentStatus {
  if (s.checkoutStatus === 'complete' && s.paymentStatus === 'succeeded') return 'confirmed';
  if (s.checkoutStatus === 'expired' && s.paymentStatus !== 'succeeded') return 'expired';
  if (s.checkoutStatus === 'open') return 'pending';
  return 'unknown';
}

/** Retire tout ce qui pourrait ressembler à un secret ou à un numéro dans un texte d'erreur. */
function scrub(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) if (s) out = out.split(s).join('•••');
  return out
    .replace(/wave_sn_[A-Za-z0-9_]+/g, '•••')
    .replace(/\d{7,}/g, (m) => m.slice(0, 3) + '•••' + m.slice(-2))
    .slice(0, 200);
}

type CallResult =
  | { kind: 'response'; status: number; body: unknown; code: string | null; message: string }
  | { kind: 'network'; error: string };

interface WaveConfig {
  apiKey: string;
  signingSecret: string | null;
  webhookSecret: string;
}

export class WaveCollection implements CollectionAdapter {
  provider = 'wave' as const;
  environment: PaymentsEnvironment;
  private config: WaveConfig | null;
  private problem: string | null;
  private fetchImpl: FetchLike;
  private now: () => number;

  constructor(environment: PaymentsEnvironment, env: Record<string, string | undefined> = {}, fetchImpl?: FetchLike, now: () => number = Date.now) {
    this.environment = environment;
    this.fetchImpl = fetchImpl ?? ((url, init) => fetch(url, init));
    this.now = now;
    const get = (k: string) => (env[k] ?? '').trim();
    const apiKey = get(WAVE_ENV.apiKey);
    const webhookSecret = get(WAVE_ENV.webhookSecret);
    const signingSecret = get(WAVE_ENV.signingSecret);

    const missing: string[] = [];
    if (!apiKey) missing.push(WAVE_ENV.apiKey);
    if (!webhookSecret) missing.push(WAVE_ENV.webhookSecret);
    let problem: string | null = null;
    if (missing.length > 0) {
      problem = `Wave : configuration incomplète (${missing.join(', ')}).`;
    } else if (!apiKey.startsWith(KEY_PREFIX[environment])) {
      // Sécurité : jamais une clé de production en mode test, ni une clé de test en production.
      // Seule la NATURE de la clé est indiquée, jamais sa valeur.
      const wanted = environment === 'production' ? 'de production (wave_sn_prod_…)' : 'de test (wave_sn_test_…)';
      const actual = apiKey.startsWith(KEY_PREFIX.production) ? 'de production'
        : apiKey.startsWith(KEY_PREFIX.sandbox) ? 'de test' : 'dans un format inconnu';
      problem = `Wave : ${WAVE_ENV.apiKey} ne correspond pas au mode ${environment === 'production' ? 'production' : 'test (sandbox)'} `
        + `(clé ${actual} fournie, clé ${wanted} exigée).`;
    }
    this.problem = problem;
    this.config = problem ? null : { apiKey, signingSecret: signingSecret || null, webhookSecret };
  }

  status(): AdapterStatus {
    if (!this.config) return { configured: false, ready: false, reason: this.problem ?? 'Wave non configuré.' };
    return { configured: true, ready: true };
  }

  private secrets(): string[] {
    return this.config ? [this.config.apiKey, this.config.signingSecret ?? '', this.config.webhookSecret] : [];
  }

  // ── Requêtes ────────────────────────────────────────────────────────────
  /** Appel authentifié (et signé si un secret de signature est configuré). Ne lève jamais d'exception. */
  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<CallResult> {
    const cfg = this.config as WaveConfig;
    const rawBody = body === undefined ? '' : JSON.stringify(body);
    const headers: Record<string, string> = { Authorization: `Bearer ${cfg.apiKey}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
    try {
      if (cfg.signingSecret) {
        const t = Math.floor(this.now() / 1000);
        headers['Wave-Signature'] = `t=${t},v1=${await hmacHex(cfg.signingSecret, String(t) + rawBody)}`;
      }
      const res = await this.fetchImpl(WAVE_BASE_URL + path, { method, headers, body: body === undefined ? undefined : rawBody, signal: controller?.signal });
      const text = await res.text();
      let parsed: unknown = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
      const p = asRecord(parsed) ?? {};
      const code = typeof p.code === 'string' || typeof p.code === 'number' ? String(p.code).slice(0, 60) : null;
      const message = typeof p.message === 'string' ? scrub(p.message, this.secrets()).slice(0, 120) : '';
      return { kind: 'response', status: res.status, body: parsed, code, message };
    } catch (err) {
      return { kind: 'network', error: scrub(err instanceof Error ? err.message : String(err), this.secrets()) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private static retryable(status: number): boolean {
    return status === 429 || status >= 500;
  }

  /** Texte d'erreur d'une réponse Wave : statut + code (jamais d'identifiant secret). */
  private static describe(r: Extract<CallResult, { kind: 'response' }>): string {
    return `HTTP ${r.status}${r.code ? `, code ${r.code}` : ''}${r.message ? ` : ${r.message}` : ''}`;
  }

  // ── Recherche par client_reference ──────────────────────────────────────
  /** Sessions Wave créées pour cette référence cliente (notre identifiant de transaction). */
  async findByClientReference(clientReference: string): Promise<FindResult> {
    if (!this.config) return { ok: false, error: this.status().reason ?? 'Wave non configuré.', retryable: false };
    const r = await this.call('GET', `/v1/checkout/sessions/search?client_reference=${encodeURIComponent(clientReference)}`);
    if (r.kind === 'network') return { ok: false, error: `réseau : ${r.error}`, retryable: true };
    if (r.status !== 200) return { ok: false, error: `recherche refusée (${WaveCollection.describe(r)})`, retryable: WaveCollection.retryable(r.status) };
    const body = r.body;
    const list = Array.isArray(body) ? body : (asRecord(body)?.result);
    if (!Array.isArray(list)) return { ok: false, error: 'réponse de recherche Wave illisible', retryable: true };
    const sessions = list.map(parseSession).filter((s): s is WaveSession => s !== null && s.clientReference === clientReference);
    return { ok: true, sessions };
  }

  // ── Création de la session ──────────────────────────────────────────────
  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    if (!this.config) return { ok: false, retryable: false, error: this.status().reason ?? 'Wave non configuré.' };
    if (!Number.isInteger(req.amount) || req.amount <= 0) return { ok: false, retryable: false, error: 'Montant invalide.' };
    if (!req.transactionId || req.transactionId.length > 255) return { ok: false, retryable: false, error: 'Référence de transaction invalide.' };
    if (!isHttpsUrl(req.returnUrl) || !isHttpsUrl(req.cancelUrl)) return { ok: false, retryable: false, error: 'Adresses de retour et d’annulation https requises.' };
    const amount = String(req.amount);

    // 1. Wave n'a PAS d'en-tête d'idempotence : on cherche d'abord une session déjà créée pour cette
    //    transaction (réponse perdue lors d'un essai précédent, nouvel essai du client…).
    const found = await this.findByClientReference(req.transactionId);
    if (!found.ok) return { ok: false, retryable: found.retryable, error: found.error };

    if (found.sessions.some((s) => s.checkoutStatus === 'complete' && s.paymentStatus === 'succeeded')) {
      // Déjà payée : ne rien recréer ; le rapprochement (GET de la session) la confirmera.
      return { ok: false, retryable: false, error: 'Une session Wave de cette transaction est déjà payée ; la vérification la confirmera.' };
    }

    const nowMs = this.now();
    const open = found.sessions.filter((s) => s.checkoutStatus === 'open');
    const expiry = (s: WaveSession): number | null => {
      const t = s.whenExpires ? Date.parse(s.whenExpires) : NaN;
      return Number.isNaN(t) ? null : t;
    };
    const reusable = open.find((s) => {
      const t = expiry(s);
      return parseXofAmount(s.amount) === req.amount && (s.currency === null || s.currency === 'XOF') && (t === null || t > nowMs);
    });
    if (reusable) {
      if (!isWaveLaunchUrl(reusable.launchUrl)) {
        return { ok: false, retryable: false, error: 'Session Wave existante avec une adresse de paiement invalide.' };
      }
      const t = expiry(reusable);
      return {
        ok: true,
        providerReference: reusable.id,
        checkoutUrl: reusable.launchUrl,
        expiresAt: new Date(t ?? nowMs + SESSION_DEFAULT_LIFETIME_MS).toISOString(),
      };
    }
    // Sessions ouvertes devenues inutilisables (montant différent) : fermeture au mieux, pour qu'elles ne soient pas payées.
    for (const s of open) {
      const t = expiry(s);
      if ((t === null || t > nowMs) && parseXofAmount(s.amount) !== req.amount) await this.expireSession(s.id);
    }

    // 2. Création. La durée de validité (30 min) est fixée par Wave : validitySeconds n'est pas utilisable.
    const r = await this.call('POST', '/v1/checkout/sessions', {
      amount,                               // CHAÎNE : XOF n'a pas de décimales
      currency: 'XOF',
      client_reference: req.transactionId,  // permet de retrouver la session par la recherche
      success_url: req.returnUrl,
      error_url: req.cancelUrl,
    });
    // Erreur réseau / 429 / 5xx : la session a pu être créée, mais le prochain essai la retrouvera par la recherche.
    if (r.kind === 'network') return { ok: false, retryable: true, error: `réseau : ${r.error}` };
    if (r.status !== 200 && r.status !== 201) {
      return { ok: false, retryable: WaveCollection.retryable(r.status), error: `session refusée (${WaveCollection.describe(r)})` };
    }
    const s = parseSession(r.body);
    if (!s) return { ok: false, retryable: false, error: 'Réponse Wave invalide (identifiant de session inattendu).' };
    if (!isWaveLaunchUrl(s.launchUrl)) return { ok: false, retryable: false, error: 'Réponse Wave invalide (adresse de paiement non conforme).' };
    if ((s.clientReference !== null && s.clientReference !== req.transactionId) || (s.amount !== null && parseXofAmount(s.amount) !== req.amount)) {
      return { ok: false, retryable: false, error: 'Réponse Wave invalide (référence ou montant différents de la demande).' };
    }
    const t = expiry(s);
    return {
      ok: true,
      providerReference: s.id,
      checkoutUrl: s.launchUrl,
      expiresAt: new Date(t ?? this.now() + SESSION_DEFAULT_LIFETIME_MS).toISOString(),
    };
  }

  // ── Expiration ──────────────────────────────────────────────────────────
  /**
   * Ferme une session encore ouverte. 409 = « déjà terminée ou expirée » : elle a pu être PAYÉE,
   * l'appelant doit donc revérifier son statut (getPaymentStatus) avant de conclure.
   */
  async expireSession(sessionId: string): Promise<ExpireResult> {
    if (!this.config || !SESSION_ID.test(sessionId)) return { outcome: 'error', retryable: false };
    const r = await this.call('POST', `/v1/checkout/sessions/${sessionId}/expire`);
    if (r.kind === 'network') return { outcome: 'error', retryable: true };
    if (r.status === 200) return { outcome: 'expired' };
    if (r.status === 409) return { outcome: 'already_closed' };
    if (r.status === 404) return { outcome: 'not_found' };
    return { outcome: 'error', retryable: WaveCollection.retryable(r.status) };
  }

  // ── Webhook ─────────────────────────────────────────────────────────────
  /**
   * HYPOTHÈSE (format non vérifié intégralement) : en-tête « Wave-Signature: t={s},v1={hex}[,v1={hex}] »,
   * HMAC-SHA256 de String(t) + corps brut avec le secret des WEBHOOKS ; plusieurs v1 possibles pendant
   * une rotation de secret (un seul suffit) ; horodatage refusé au-delà de 5 min ou à plus de 30 s dans
   * le futur. La signature est contrôlée AVANT toute lecture du contenu.
   * HYPOTHÈSE : type « checkout.session.completed », session dans `data` (sinon session au premier
   * niveau) ; identifiant d'événement : `id` s'il est présent à côté de `data`, sinon « {session}:{type} ».
   * Le contenu n'est de toute façon jamais cru : le statut et le montant sont redemandés à l'API.
   */
  async verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookVerification> {
    if (!this.config) return { valid: false };
    const header = headers['wave-signature'];
    if (typeof header !== 'string' || header.length > 1000) return { valid: false };

    let timestamp: string | null = null;
    const signatures: string[] = [];
    for (const part of header.split(',')) {
      const i = part.indexOf('=');
      if (i < 0) return { valid: false };
      const k = part.slice(0, i).trim();
      const v = part.slice(i + 1).trim();
      if (k === 't') {
        if (timestamp !== null) return { valid: false };
        timestamp = v;
      } else if (k === 'v1') {
        signatures.push(v);
      }
    }
    if (timestamp === null || !/^\d{1,12}$/.test(timestamp) || signatures.length === 0) return { valid: false };
    const tMs = Number(timestamp) * 1000;
    const nowMs = this.now();
    if (nowMs - tMs > MAX_SIGNATURE_AGE_MS || tMs - nowMs > MAX_SIGNATURE_FUTURE_MS) return { valid: false };

    const expected = await hmacHex(this.config.webhookSecret, timestamp + rawBody);
    let ok = false;
    for (const sig of signatures) {
      if (HEX.test(sig) && safeEqual(sig.toLowerCase(), expected)) ok = true; // pas de sortie anticipée
    }
    if (!ok) return { valid: false };

    // Signature authentique : lecture tolérante du contenu.
    let body: Record<string, unknown> | null;
    try { body = asRecord(JSON.parse(rawBody)); } catch { return { valid: false }; }
    if (!body) return { valid: false };
    const data = asRecord(body.data);
    const session = parseSession(data ?? body);
    if (!session) return { valid: false };
    const type = (typeof body.type === 'string' && body.type ? body.type : 'checkout.session.completed').slice(0, 60);
    const wrappedId = data && typeof body.id === 'string' && body.id.length > 0 && body.id.length <= 128 ? body.id : null;
    return {
      valid: true,
      event: {
        eventId: wrappedId ?? `${session.id}:${type}`,
        type,
        providerReference: session.id,
        status: mapWaveSession(session),
        amount: parseXofAmount(session.amount),
      },
    };
  }

  // ── Vérification (source de vérité) ─────────────────────────────────────
  async getPaymentStatus(reference: string): Promise<PaymentStatusResult> {
    if (!this.config) return { error: this.status().reason ?? 'Wave non configuré.', retryable: false };
    if (typeof reference !== 'string' || !SESSION_ID.test(reference)) return { error: 'Référence de session Wave invalide.', retryable: false };
    const r = await this.call('GET', `/v1/checkout/sessions/${reference}`);
    if (r.kind === 'network') return { error: `réseau : ${r.error}`, retryable: true };
    // 404 : volontairement une erreur (jamais « not_found », qui peut clore la tentative côté base).
    if (r.status !== 200) return { error: `lecture refusée (${WaveCollection.describe(r)})`, retryable: WaveCollection.retryable(r.status) };
    const s = parseSession(r.body);
    if (!s || s.id !== reference) return { error: 'Réponse Wave illisible (session inattendue).', retryable: true };

    let status = mapWaveSession(s);
    let amount: number | null = null;
    if (status === 'confirmed') {
      amount = s.currency === 'XOF' ? parseXofAmount(s.amount) : null;
      // Montant ou devise incohérents : jamais de confirmation sur une donnée douteuse.
      if (amount === null) status = 'unknown';
    }
    return { status, amount, providerTransactionId: s.transactionId, clientReference: s.clientReference };
  }
}
