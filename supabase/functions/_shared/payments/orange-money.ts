// Ezial — adaptateur Orange Money « QR CODE – OM » (encaissement uniquement).
//
// Source : documentation officielle Orange Sonatel « Orange Money API » v1.1.0
// (page developer.orange-sonatel.com/dev/docs/orange-money), résumée dans
// docs/orange-money/specification-qr-code-om.md. L'offre « OM Pay »
// (/v1/onlinePayment…) est une AUTRE offre : elle n'est pas utilisée ici.
//
//   Jeton      : POST /oauth/v1/token (client credentials, formulaire)
//   QR         : POST /api/eWallet/v4/qrcode
//   Vérif.     : GET  /api/eWallet/v1/transactions?reference=…&type=MERCHANT_PAYMENT
//   Callback   : enregistré via POST /api/notification/v1/merchantcallback
//                (Orange renvoie la clé en « Authorization: Basic {apiKey} »)
//
// Règles de sécurité :
//   * les secrets viennent uniquement des variables d'environnement de la
//     fonction Edge (jamais du site, jamais du dépôt) ;
//   * le contenu d'un callback ne suffit JAMAIS : le statut et le montant sont
//     toujours redemandés à l'API (recherche par référence) ;
//   * aucun numéro de téléphone de client n'est conservé ni journalisé ;
//   * aucune API de reversement vendeur n'est utilisée.
//
// TypeScript pur : `fetch` est injectable pour les tests (aucun appel réseau en test).
import type {
  AdapterStatus,
  CheckoutData,
  CheckoutRequest,
  CheckoutResult,
  CollectionAdapter,
  PaymentStatus,
  PaymentStatusResult,
  PaymentsEnvironment,
  WebhookVerification,
} from './core.ts';

export const ORANGE_BASE_URLS: Record<PaymentsEnvironment, string> = {
  sandbox: 'https://api.sandbox.orange-sonatel.com',
  production: 'https://api.orange-sonatel.com',
};

/** Noms des variables d'environnement (valeurs à saisir dans Supabase → Edge Functions → Secrets). */
export const ORANGE_ENV = {
  clientId: 'ORANGE_MONEY_CLIENT_ID',
  clientSecret: 'ORANGE_MONEY_CLIENT_SECRET',
  merchantCode: 'ORANGE_MONEY_MERCHANT_CODE',
  merchantName: 'ORANGE_MONEY_MERCHANT_NAME',
  callbackApiKey: 'ORANGE_MONEY_CALLBACK_API_KEY',
  apiKey: 'ORANGE_MONEY_API_KEY',
  callbackUrl: 'ORANGE_MONEY_CALLBACK_URL',
} as const;

export interface FetchResponseLike {
  status: number;
  text(): Promise<string>;
}
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<FetchResponseLike>;

const QR_VALIDITY_MIN = 60;
const QR_VALIDITY_MAX = 86400;          // maximum accepté par Orange
const DEFAULT_QR_VALIDITY = 1800;       // 30 minutes
const REQUEST_TIMEOUT_MS = 15000;
const TOKEN_REFRESH_MARGIN_MS = 60000;
const SEARCH_PAGE_SIZE = 500;
const SEARCH_MAX_PAGES = 5;

/** Statut Orange → statut Ezial. */
export function mapOrangeStatus(status: unknown): PaymentStatus {
  switch (String(status ?? '').toUpperCase()) {
    case 'SUCCESS': return 'confirmed';
    case 'FAILED':
    case 'REJECTED': return 'failed';
    case 'CANCELLED': return 'cancelled';
    case 'PENDING':
    case 'ACCEPTED':
    case 'INITIATED':
    case 'PRE_INITIATED': return 'pending';
    default: return 'unknown';
  }
}

/** Nom du marchand envoyé à Orange : ASCII court (un nom accentué ou trop long a provoqué des erreurs 500 chez d'autres intégrateurs). */
export function sanitizeMerchantName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 .-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

/** Comparaison à durée constante. */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function maskDigits(text: string): string {
  return text.replace(/\d{7,}/g, (m) => m.slice(0, 3) + '•••' + m.slice(-2));
}

function isHttps(value: unknown): value is string {
  return typeof value === 'string' && /^https:\/\/[^\s]+$/.test(value);
}

interface OrangeTransaction {
  reference?: string;
  status?: string;
  transactionId?: string;
  type?: string;
  amount?: { value?: number; unit?: string };
}

/** Lecture prudente d'une liste de transactions renvoyée par la recherche. */
function asTransactions(body: unknown): OrangeTransaction[] {
  if (Array.isArray(body)) return body as OrangeTransaction[];
  if (body && typeof body === 'object') {
    for (const key of ['content', 'data', 'transactions']) {
      const v = (body as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v as OrangeTransaction[];
    }
  }
  return [];
}

/**
 * Résume les transactions Orange d'une référence en un statut Ezial :
 * un paiement réussi l'emporte ; sinon une transaction en cours ; sinon un échec ;
 * aucune transaction : « not_found » (la base ne conclut qu'après la fin de validité du QR).
 */
export function summarizeTransactions(list: OrangeTransaction[]): PaymentStatusResult {
  const merchant = list.filter((t) => !t.type || String(t.type).toUpperCase() === 'MERCHANT_PAYMENT');
  if (merchant.length === 0) return { status: 'not_found', amount: null, providerTransactionId: null };
  const successes = merchant.filter((t) => mapOrangeStatus(t.status) === 'confirmed');
  if (successes.length > 0) {
    const s = successes[0];
    const value = s.amount?.value;
    const amount = String(s.amount?.unit ?? '').toUpperCase() === 'XOF' && Number.isInteger(value) ? (value as number) : null;
    return { status: 'confirmed', amount, providerTransactionId: s.transactionId ?? null, successCount: successes.length };
  }
  if (merchant.some((t) => mapOrangeStatus(t.status) === 'pending' || mapOrangeStatus(t.status) === 'unknown')) {
    return { status: 'pending', amount: null, providerTransactionId: merchant[0].transactionId ?? null };
  }
  const last = merchant[merchant.length - 1];
  return { status: mapOrangeStatus(last.status), amount: null, providerTransactionId: last.transactionId ?? null };
}

interface OrangeConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  merchantCode: string;
  merchantName: string;
  callbackApiKey: string;
  apiKey: string | null;
  callbackUrl: string | null;
}

type CallResult =
  | { kind: 'response'; status: number; body: unknown; code: string | null; detail: string }
  | { kind: 'network'; error: string };

export class OrangeMoneyCollection implements CollectionAdapter {
  provider = 'orange_money' as const;
  environment: PaymentsEnvironment;
  private config: OrangeConfig | null;
  private missing: string[];
  private fetchImpl: FetchLike;
  private now: () => number;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(environment: PaymentsEnvironment, env: Record<string, string | undefined> = {}, fetchImpl?: FetchLike, now: () => number = Date.now) {
    this.environment = environment;
    this.fetchImpl = fetchImpl ?? ((url, init) => fetch(url, init));
    this.now = now;
    const get = (k: string) => (env[k] ?? '').trim();
    const missing: string[] = [];
    const clientId = get(ORANGE_ENV.clientId);
    const clientSecret = get(ORANGE_ENV.clientSecret);
    const merchantCode = get(ORANGE_ENV.merchantCode);
    const merchantName = sanitizeMerchantName(get(ORANGE_ENV.merchantName) || 'Ezial');
    const callbackApiKey = get(ORANGE_ENV.callbackApiKey);
    const callbackUrl = get(ORANGE_ENV.callbackUrl);
    if (!clientId) missing.push(ORANGE_ENV.clientId);
    if (!clientSecret) missing.push(ORANGE_ENV.clientSecret);
    if (!/^\d{6}$/.test(merchantCode)) missing.push(`${ORANGE_ENV.merchantCode} (6 chiffres)`);
    if (!merchantName) missing.push(ORANGE_ENV.merchantName);
    if (callbackApiKey.length < 24) missing.push(`${ORANGE_ENV.callbackApiKey} (24 caractères minimum)`);
    if (callbackUrl && !isHttps(callbackUrl)) missing.push(`${ORANGE_ENV.callbackUrl} (adresse https)`);
    this.missing = missing;
    this.config = missing.length > 0 ? null : {
      baseUrl: ORANGE_BASE_URLS[environment], clientId, clientSecret, merchantCode, merchantName, callbackApiKey,
      apiKey: get(ORANGE_ENV.apiKey) || null, callbackUrl: callbackUrl || null,
    };
  }

  status(): AdapterStatus {
    if (!this.config) {
      return { configured: false, ready: false, reason: `Orange Money : configuration incomplète (${this.missing.join(', ')}).` };
    }
    return { configured: true, ready: true };
  }

  // ── Requêtes ────────────────────────────────────────────────────────────
  private async raw(method: string, path: string, headers: Record<string, string>, body?: string): Promise<CallResult> {
    const cfg = this.config as OrangeConfig;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
    try {
      const res = await this.fetchImpl(cfg.baseUrl + path, { method, headers, body, signal: controller?.signal });
      const text = await res.text();
      let parsed: unknown = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
      const p = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed as Record<string, unknown> : {};
      const code = p.code !== undefined && p.code !== null ? String(p.code) : null;
      const detail = maskDigits(String(p.detail ?? p.title ?? '')).slice(0, 200);
      return { kind: 'response', status: res.status, body: parsed, code, detail };
    } catch (err) {
      return { kind: 'network', error: maskDigits(err instanceof Error ? err.message : String(err)).slice(0, 200) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async getToken(force = false): Promise<string | { error: string; retryable: boolean }> {
    const cfg = this.config as OrangeConfig;
    if (!force && this.token && this.token.expiresAt - TOKEN_REFRESH_MARGIN_MS > this.now()) return this.token.value;
    const form = new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'client_credentials' }).toString();
    const r = await this.raw('POST', '/oauth/v1/token', { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, form);
    if (r.kind === 'network') return { error: `jeton : ${r.error}`, retryable: true };
    const b = (r.body ?? {}) as Record<string, unknown>;
    if (r.status !== 200 || typeof b.access_token !== 'string' || !b.access_token) {
      return { error: `jeton refusé (HTTP ${r.status}${r.code ? `, code ${r.code}` : ''})`, retryable: r.status === 429 || r.status >= 500 };
    }
    const ttl = Number(b.expires_in);
    this.token = { value: b.access_token, expiresAt: this.now() + (Number.isFinite(ttl) && ttl > 0 ? ttl * 1000 : 300000) };
    return this.token.value;
  }

  /** Appel authentifié ; un 401 renouvelle le jeton et réessaie une seule fois. */
  private async authed(method: string, path: string, extra: Record<string, string> = {}, body?: unknown): Promise<CallResult | { kind: 'token'; error: string; retryable: boolean }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.getToken(attempt > 0);
      if (typeof token !== 'string') return { kind: 'token', ...token };
      const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json', ...extra };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const r = await this.raw(method, path, headers, body === undefined ? undefined : JSON.stringify(body));
      if (r.kind === 'response' && r.status === 401 && attempt === 0) { this.token = null; continue; }
      return r;
    }
    return { kind: 'token', error: 'jeton refusé', retryable: false };
  }

  // ── Création du QR ──────────────────────────────────────────────────────
  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    if (!this.config) return { ok: false, retryable: false, error: this.status().reason ?? 'Orange Money non configuré.' };
    if (!Number.isInteger(req.amount) || req.amount <= 0) return { ok: false, retryable: false, error: 'Montant invalide.' };
    const validity = Math.min(QR_VALIDITY_MAX, Math.max(QR_VALIDITY_MIN, Math.floor(req.validitySeconds ?? DEFAULT_QR_VALIDITY)));
    const extra: Record<string, string> = {};
    if (this.config.callbackUrl) extra['X-Callback-Url'] = this.config.callbackUrl;
    if (this.config.apiKey) extra['X-Api-Key'] = this.config.apiKey;
    const payload: Record<string, unknown> = {
      code: this.config.merchantCode,
      name: this.config.merchantName,
      amount: { value: req.amount, unit: 'XOF' },
      validity,
      reference: req.transactionId,                 // permet de retrouver le paiement par la recherche
      metadata: { orderNumber: req.orderNumber.slice(0, 64) },
    };
    if (isHttps(req.returnUrl)) payload.callbackSuccessUrl = req.returnUrl;
    if (isHttps(req.cancelUrl)) payload.callbackCancelUrl = req.cancelUrl;

    const r = await this.authed('POST', '/api/eWallet/v4/qrcode', extra, payload);
    if (r.kind === 'token') return { ok: false, retryable: r.retryable, error: r.error };
    // Erreur réseau ou serveur : le QR n'a jamais été montré au client, une nouvelle demande est sans risque.
    if (r.kind === 'network') return { ok: false, retryable: true, error: `réseau : ${r.error}` };
    if (r.status !== 200 && r.status !== 201) {
      const retryable = r.status === 429 || r.status >= 500;
      return { ok: false, retryable, error: `QR refusé (HTTP ${r.status}${r.code ? `, code ${r.code}` : ''}${r.detail ? ` : ${r.detail}` : ''})` };
    }
    const b = (r.body ?? {}) as Record<string, unknown>;
    const links = (b.deepLinks && typeof b.deepLinks === 'object') ? b.deepLinks as Record<string, unknown> : {};
    const maxit = isHttps(links.MAXIT) ? links.MAXIT : null;
    const om = isHttps(links.OM) ? links.OM : null;
    const deepLink = isHttps(b.deepLink) ? b.deepLink : (maxit ?? om);
    const qrCode = typeof b.qrCode === 'string' && /^[A-Za-z0-9+/=\s]+$/.test(b.qrCode) && b.qrCode.length <= 400000 ? b.qrCode.replace(/\s/g, '') : null;
    if (!qrCode && !deepLink) return { ok: false, retryable: true, error: 'Réponse Orange Money incomplète (ni QR ni lien).' };
    const validFor = (b.validFor && typeof b.validFor === 'object') ? b.validFor as Record<string, unknown> : {};
    const end = typeof validFor.endDateTime === 'string' && !Number.isNaN(Date.parse(validFor.endDateTime))
      ? new Date(validFor.endDateTime).toISOString()
      : new Date(this.now() + validity * 1000).toISOString();
    const checkoutData: CheckoutData = {
      kind: 'orange_money_qr',
      qrCode,
      deepLink,
      deepLinks: { maxit, om },
      shortLink: isHttps(b.shortLink) ? b.shortLink : null,
      qrId: typeof b.qrId === 'string' ? b.qrId.slice(0, 64) : null,
      validUntil: end,
    };
    return { ok: true, providerReference: req.transactionId, checkoutUrl: null, checkoutData, expiresAt: end };
  }

  // ── Callback ────────────────────────────────────────────────────────────
  /**
   * Authentification : « Authorization: Basic {apiKey} » (clé enregistrée avec le callback),
   * comparée à durée constante. L'en-tête X-Sonatel-Signature n'est pas vérifié : son algorithme
   * n'est pas décrit dans la documentation reçue (demande en cours auprès d'Orange). Ce n'est pas
   * bloquant pour la sécurité : le contenu d'un callback n'est jamais cru, le statut et le montant
   * sont toujours redemandés à l'API Orange avant toute écriture.
   */
  async verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookVerification> {
    if (!this.config) return { valid: false };
    const auth = (headers['authorization'] ?? '').trim();
    if (!safeEqual(auth, `Basic ${this.config.callbackApiKey}`)) return { valid: false };
    let body: Record<string, unknown>;
    try {
      const parsed = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { valid: false };
      body = parsed as Record<string, unknown>;
    } catch {
      return { valid: false };
    }
    const reference = typeof body.reference === 'string' ? body.reference.trim() : '';
    const transactionId = typeof body.transactionId === 'string' ? body.transactionId.trim() : '';
    if (!reference || !transactionId || reference.length > 100 || transactionId.length > 64) return { valid: false };
    const amount = body.amount && typeof body.amount === 'object' ? (body.amount as Record<string, unknown>).value : null;
    const status = String(body.status ?? 'UNKNOWN').toUpperCase().slice(0, 20);
    return {
      valid: true,
      event: {
        eventId: `${transactionId}:${status}`,
        type: String(body.type ?? 'MERCHANT_PAYMENT').slice(0, 40),
        providerReference: reference,
        status: mapOrangeStatus(status),
        amount: Number.isInteger(amount) ? (amount as number) : null,
      },
    };
  }

  // ── Vérification (source de vérité) ─────────────────────────────────────
  async getPaymentStatus(reference: string): Promise<PaymentStatusResult> {
    if (!this.config) return { error: this.status().reason ?? 'Orange Money non configuré.', retryable: false };
    const q = new URLSearchParams({ reference, type: 'MERCHANT_PAYMENT', size: '50' }).toString();
    const r = await this.authed('GET', `/api/eWallet/v1/transactions?${q}`);
    if (r.kind === 'token') return { error: r.error, retryable: r.retryable };
    if (r.kind === 'network') return { error: `réseau : ${r.error}`, retryable: true };
    if (r.status !== 200) return { error: `recherche refusée (HTTP ${r.status}${r.code ? `, code ${r.code}` : ''})`, retryable: r.status === 429 || r.status >= 500 };
    return summarizeTransactions(asTransactions(r.body).filter((t) => t.reference === reference));
  }

  /**
   * Vérification groupée : UNE recherche (paginée) des paiements marchands depuis `sinceIso`,
   * pour rester sous la limite de 60 requêtes/minute. Si la recherche n'a pas pu tout parcourir,
   * les références absentes restent « unknown » (jamais « not_found » : on ne conclut pas sans preuve).
   */
  async getPaymentStatuses(references: string[], sinceIso: string): Promise<Map<string, PaymentStatusResult> | { error: string; retryable: boolean }> {
    if (!this.config) return { error: this.status().reason ?? 'Orange Money non configuré.', retryable: false };
    const wanted = new Set(references);
    const found = new Map<string, OrangeTransaction[]>();
    let complete = false;
    for (let page = 0; page < SEARCH_MAX_PAGES; page++) {
      const q = new URLSearchParams({ type: 'MERCHANT_PAYMENT', fromDateTime: sinceIso, size: String(SEARCH_PAGE_SIZE), page: String(page) }).toString();
      const r = await this.authed('GET', `/api/eWallet/v1/transactions?${q}`);
      if (r.kind === 'token') return { error: r.error, retryable: r.retryable };
      if (r.kind === 'network') return { error: `réseau : ${r.error}`, retryable: true };
      if (r.status !== 200) return { error: `recherche refusée (HTTP ${r.status}${r.code ? `, code ${r.code}` : ''})`, retryable: r.status === 429 || r.status >= 500 };
      const list = asTransactions(r.body);
      for (const t of list) {
        if (t.reference && wanted.has(t.reference)) found.set(t.reference, [...(found.get(t.reference) ?? []), t]);
      }
      if (list.length < SEARCH_PAGE_SIZE) { complete = true; break; }
    }
    const out = new Map<string, PaymentStatusResult>();
    for (const ref of references) {
      const list = found.get(ref);
      if (list) out.set(ref, summarizeTransactions(list));
      else out.set(ref, complete ? { status: 'not_found', amount: null, providerTransactionId: null } : { status: 'unknown', amount: null, providerTransactionId: null });
    }
    return out;
  }

  /** Enregistrement (une fois) du callback marchand, avec la clé renvoyée par Orange en « Basic ». */
  async registerCallback(callbackUrl: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!this.config) return { ok: false, error: this.status().reason ?? 'Orange Money non configuré.' };
    if (!isHttps(callbackUrl)) return { ok: false, error: 'Adresse de callback https requise.' };
    const r = await this.authed('POST', '/api/notification/v1/merchantcallback', {}, {
      code: this.config.merchantCode, name: this.config.merchantName, callbackUrl, apiKey: this.config.callbackApiKey,
    });
    if (r.kind === 'token' || r.kind === 'network') return { ok: false, error: r.error };
    if (r.status !== 200 && r.status !== 201) return { ok: false, error: `enregistrement refusé (HTTP ${r.status}${r.code ? `, code ${r.code}` : ''})` };
    return { ok: true };
  }
}
