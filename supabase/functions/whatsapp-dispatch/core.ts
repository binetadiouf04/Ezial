// Ezial — cœur du service d'envoi des notifications WhatsApp.
//
// TypeScript pur : aucune API propre à Deno ou à Node, aucun import npm.
// Le même fichier tourne dans l'Edge Function (Deno) et dans les tests
// (`node --test supabase/functions/whatsapp-dispatch/core.test.ts`).
//
// Garantie « aucun envoi réel » : tant qu'aucun fournisseur officiel n'est
// configuré (secret WHATSAPP_PROVIDER), le fournisseur est DisabledProvider,
// dont isReady() renvoie false. dispatchBatch() s'arrête alors AVANT de
// réserver la moindre notification : elles restent « en attente » puis
// passent « expirées » via la tâche whatsapp_maintenance().
//
// Aucun fournisseur réel n'est implémenté ici : il sera ajouté quand la
// personne aura choisi un fournisseur officiel (voir docs/whatsapp-notifications.md).

export type Kind =
  | 'buyer_order_confirmed'
  | 'buyer_out_for_delivery'
  | 'seller_new_order'
  | 'seller_order_reminder';

export const KINDS: readonly Kind[] = [
  'buyer_order_confirmed',
  'buyer_out_for_delivery',
  'seller_new_order',
  'seller_order_reminder',
];

export function isKind(value: unknown): value is Kind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}

/** Identifiants des modèles (templates) approuvés chez le fournisseur, par type. */
export type TemplateIds = Record<Kind, string | null>;

/**
 * Message prêt à être remis à un fournisseur.
 *
 * `params` = variables du modèle, dans cet ordre :
 * - buyer_order_confirmed  : [firstName, orderNumber, itemsText, total, delivery]
 *     itemsText : articles sur une seule ligne, séparés par « ; »
 *                 (ex. « 2 × Tissu wax ; 1,5 × Bazin ») — les variables de
 *                 modèle WhatsApp n'acceptent généralement pas de retour à la ligne ;
 *     total     : montant formaté sans l'unité (ex. « 25 000 »), le modèle
 *                 porte « FCFA » ;
 *     firstName : chaîne vide si le prénom est inconnu.
 * - buyer_out_for_delivery : [firstName, orderNumber]
 * - seller_new_order       : [orderNumber, link]
 * - seller_order_reminder  : [orderNumber, link]
 *
 * `text` = texte complet en français, pour les fournisseurs qui acceptent
 * du texte libre (dans la fenêtre de conversation autorisée).
 */
export interface WhatsAppMessage {
  to: string;
  kind: Kind;
  templateId: string | null;
  params: string[];
  text: string;
}

export type SendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; retryable: boolean; error: string };

export interface WhatsAppProvider {
  name: string;
  isReady(): { ready: boolean; reason?: string };
  send(msg: WhatsAppMessage): Promise<SendResult>;
}

// ---------------------------------------------------------------------------
// Fournisseurs
// ---------------------------------------------------------------------------

export const NO_PROVIDER_REASON = 'Aucun fournisseur WhatsApp configuré.';

/** Fournisseur par défaut : n'envoie jamais rien. */
export class DisabledProvider implements WhatsAppProvider {
  name = 'aucun';
  reason: string;

  constructor(reason: string = NO_PROVIDER_REASON) {
    this.reason = reason;
  }

  isReady(): { ready: boolean; reason?: string } {
    return { ready: false, reason: this.reason };
  }

  send(): Promise<SendResult> {
    // Ne doit jamais être appelé : dispatchBatch s'arrête avant si !ready.
    return Promise.resolve({
      ok: false,
      retryable: true,
      error: `Envoi refusé : ${this.reason}`,
    });
  }
}

export type TestProviderMode = 'success' | 'temporary_failure' | 'permanent_failure' | 'exception';

/**
 * Fournisseur de test : enregistre les messages en mémoire, aucun appel
 * réseau. Sert aux tests automatiques et aux essais avec WHATSAPP_PROVIDER=test.
 */
export class TestProvider implements WhatsAppProvider {
  name = 'test';
  mode: TestProviderMode;
  sent: WhatsAppMessage[] = [];
  private counter = 0;

  constructor(mode: TestProviderMode = 'success') {
    this.mode = mode;
  }

  isReady(): { ready: boolean; reason?: string } {
    return { ready: true };
  }

  send(msg: WhatsAppMessage): Promise<SendResult> {
    if (this.mode === 'exception') {
      return Promise.reject(new Error('Erreur simulée du fournisseur de test.'));
    }
    if (this.mode === 'temporary_failure') {
      return Promise.resolve({ ok: false, retryable: true, error: 'Indisponibilité temporaire simulée.' });
    }
    if (this.mode === 'permanent_failure') {
      return Promise.resolve({ ok: false, retryable: false, error: 'Numéro invalide (échec définitif simulé).' });
    }
    this.sent.push(msg);
    this.counter += 1;
    return Promise.resolve({ ok: true, providerMessageId: `test-${this.counter}` });
  }
}

const TEST_MODES: Record<string, TestProviderMode> = {
  '': 'success',
  success: 'success',
  succes: 'success',
  temporary_failure: 'temporary_failure',
  echec_temporaire: 'temporary_failure',
  permanent_failure: 'permanent_failure',
  echec_definitif: 'permanent_failure',
};

/**
 * WHATSAPP_PROVIDER :
 * - absent, vide ou « aucun » → DisabledProvider (rien n'est envoyé) ;
 * - « test »                  → TestProvider (rien n'est envoyé, résultats simulés ;
 *                               WHATSAPP_TEST_MODE facultatif : succes | echec_temporaire | echec_definitif) ;
 * - toute autre valeur        → DisabledProvider : l'adaptateur n'existe pas encore.
 *
 * Pour brancher un vrai fournisseur officiel : implémenter WhatsAppProvider
 * (ici ou dans un nouveau fichier) et ajouter son nom ci-dessous.
 */
export function createProviderFromEnv(env: Record<string, string | undefined>): WhatsAppProvider {
  const name = (env.WHATSAPP_PROVIDER ?? '').trim();
  const key = name.toLowerCase();
  if (key === '' || key === 'aucun') return new DisabledProvider();
  if (key === 'test') {
    const mode = TEST_MODES[(env.WHATSAPP_TEST_MODE ?? '').trim().toLowerCase()];
    return new TestProvider(mode ?? 'success');
  }
  return new DisabledProvider(`Fournisseur « ${name} » non pris en charge : son adaptateur doit être ajouté.`);
}

export function templateIdsFromEnv(env: Record<string, string | undefined>): TemplateIds {
  const read = (k: string): string | null => {
    const v = (env[k] ?? '').trim();
    return v === '' ? null : v;
  };
  return {
    buyer_order_confirmed: read('WHATSAPP_TEMPLATE_BUYER_ORDER_CONFIRMED'),
    buyer_out_for_delivery: read('WHATSAPP_TEMPLATE_BUYER_OUT_FOR_DELIVERY'),
    seller_new_order: read('WHATSAPP_TEMPLATE_SELLER_NEW_ORDER'),
    seller_order_reminder: read('WHATSAPP_TEMPLATE_SELLER_ORDER_REMINDER'),
  };
}

// ---------------------------------------------------------------------------
// Mise en forme
// ---------------------------------------------------------------------------

/** Groupe les milliers avec une espace ordinaire (sûr dans les modèles). */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Montant entier en FCFA : 25000 → « 25 000 ». */
export function formatFcfa(value: unknown): string {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) throw new Error('Montant total invalide.');
  const sign = n < 0 ? '-' : '';
  return sign + groupThousands(String(Math.abs(n)));
}

/** Quantité (éventuellement décimale : mètre, kg) : 1.5 → « 1,5 », 2.0 → « 2 ». */
export function formatQuantity(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '');
  const sign = n < 0 ? '-' : '';
  const [intPart, fracPart] = Math.abs(n).toFixed(3).split('.');
  const frac = (fracPart ?? '').replace(/0+$/, '');
  return sign + groupThousands(intPart) + (frac ? ',' + frac : '');
}

/** Masque un numéro pour les journaux : « +22177•••67 » (même format que la base). */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '(aucun)';
  if (phone.length <= 8) return '•••';
  return phone.slice(0, 6) + '•••' + phone.slice(-2);
}

/** Retire tout numéro de téléphone complet d'un texte d'erreur avant journalisation/stockage. */
export function redactPhones(text: string): string {
  return text.replace(/\+?\d[\d \-.]{6,}\d/g, (m) => {
    const digits = m.replace(/[^\d+]/g, '');
    return digits.replace(/\D/g, '').length >= 9 ? maskPhone(digits) : m;
  });
}

const E164 = /^\+[1-9]\d{7,14}$/;

export function isValidRecipient(to: unknown): to is string {
  return typeof to === 'string' && E164.test(to);
}

function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function requireStr(params: Record<string, unknown>, key: string): string {
  const v = str(params[key]);
  if (v === '') throw new Error(`Paramètre manquant : ${key}.`);
  return v;
}

interface Item { name: string; quantity: string }

function readItems(value: unknown): Item[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    return { name: str(it.name) || 'Article', quantity: formatQuantity(it.quantity) };
  });
}

/**
 * Compose le message (texte complet + variables de modèle) à partir des
 * paramètres renvoyés par whatsapp_message_context. Lève une erreur si un
 * paramètre indispensable manque.
 */
export function renderMessage(
  kind: Kind,
  params: Record<string, unknown>,
  templateIds: TemplateIds,
  to = '',
): WhatsAppMessage {
  const templateId = templateIds[kind] ?? null;

  switch (kind) {
    case 'buyer_order_confirmed': {
      const firstName = str(params.firstName);
      const orderNumber = requireStr(params, 'orderNumber');
      const items = readItems(params.items);
      if (params.totalFcfa === null || params.totalFcfa === undefined || params.totalFcfa === '') {
        throw new Error('Paramètre manquant : totalFcfa.');
      }
      const total = formatFcfa(params.totalFcfa);
      const delivery = requireStr(params, 'delivery');
      const lines = items.map((i) => `- ${i.quantity} × ${i.name}`);
      const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
      const text =
        `${greeting}\n\n` +
        `Merci pour votre commande sur Ezial !\n\n` +
        `Votre commande n°${orderNumber} a bien été confirmée.\n\n` +
        `Récapitulatif :\n${lines.join('\n')}\n\n` +
        `Total : ${total} FCFA\n\n` +
        `Livraison : ${delivery}\n\n` +
        `Merci de votre confiance.\n` +
        `Ezial — ezial.net`;
      const itemsText = items.map((i) => `${i.quantity} × ${i.name}`).join(' ; ');
      return { to, kind, templateId, params: [firstName, orderNumber, itemsText, total, delivery], text };
    }
    case 'buyer_out_for_delivery': {
      const firstName = str(params.firstName);
      const orderNumber = requireStr(params, 'orderNumber');
      const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
      const text =
        `${greeting}\n\n` +
        `Votre commande Ezial n°${orderNumber} est en route !\n\n` +
        `Votre livreur est en chemin vers votre adresse de livraison.\n\n` +
        `Merci de rester disponible pour la réception.\n\n` +
        `Ezial — ezial.net`;
      return { to, kind, templateId, params: [firstName, orderNumber], text };
    }
    case 'seller_new_order': {
      // Vendeur : uniquement le numéro et le lien — aucune donnée de l'acheteur.
      const orderNumber = requireStr(params, 'orderNumber');
      const link = requireStr(params, 'link');
      const text =
        `Bonjour,\n\n` +
        `Vous avez une nouvelle commande sur Ezial.\n\n` +
        `Commande n°${orderNumber}\n\n` +
        `Consulter la commande :\n${link}`;
      return { to, kind, templateId, params: [orderNumber, link], text };
    }
    case 'seller_order_reminder': {
      const orderNumber = requireStr(params, 'orderNumber');
      const link = requireStr(params, 'link');
      const text =
        `Bonjour,\n\n` +
        `Votre commande Ezial n°${orderNumber} est toujours en attente de prise en charge.\n\n` +
        `Consulter la commande :\n${link}`;
      return { to, kind, templateId, params: [orderNumber, link], text };
    }
    default: {
      const never: never = kind;
      throw new Error(`Type de notification inconnu : ${String(never)}.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Traitement d'un lot
// ---------------------------------------------------------------------------

export type Outcome = 'sent' | 'retry' | 'failed' | 'skipped';

/** Ligne réservée par whatsapp_claim_batch (seuls les champs utiles). */
export interface ClaimedJob {
  id: string;
  kind: string;
  attempts?: number;
  recipient_masked?: string | null;
}

/** Réponse de whatsapp_message_context. */
export interface MessageContext {
  relevant: boolean;
  reason?: string;
  kind?: string;
  to?: string | null;
  params?: Record<string, unknown>;
}

/** Accès base de données (RPC service_role) — simulé en mémoire dans les tests. */
export interface DispatchDb {
  claimBatch(limit: number): Promise<ClaimedJob[]>;
  messageContext(id: string): Promise<MessageContext>;
  complete(
    id: string,
    outcome: Outcome,
    provider: string | null,
    providerMessageId: string | null,
    error: string | null,
  ): Promise<unknown>;
  recordDispatch(provider: string, ready: boolean, error: string | null): Promise<unknown>;
}

export interface DispatchOptions {
  /** Nombre maximum de notifications réservées par passage (défaut 20, max 100 côté base). */
  limit?: number;
  /** Journal ; ne reçoit jamais de numéro complet ni de texte de message. */
  log?: (line: string) => void;
}

export interface DispatchSummary {
  provider: string;
  ready: boolean;
  reason?: string;
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
  error?: string;
}

function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return redactPhones(raw).slice(0, 500);
}

export async function dispatchBatch(
  db: DispatchDb,
  provider: WhatsAppProvider,
  templateIds: TemplateIds,
  opts: DispatchOptions = {},
): Promise<DispatchSummary> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const summary: DispatchSummary = {
    provider: provider.name,
    ready: false,
    claimed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    skipped: 0,
  };

  const readiness = provider.isReady();
  if (!readiness.ready) {
    // Aucun fournisseur prêt : on ne réserve RIEN. Les notifications restent
    // en attente puis expirent. C'est la garantie « aucun envoi réel ».
    summary.reason = readiness.reason ?? NO_PROVIDER_REASON;
    await db.recordDispatch(provider.name, false, summary.reason);
    log(`[whatsapp] fournisseur « ${provider.name} » non prêt : ${summary.reason}`);
    return summary;
  }
  summary.ready = true;

  let jobs: ClaimedJob[];
  try {
    jobs = await db.claimBatch(opts.limit ?? 20);
  } catch (err) {
    summary.error = `Réservation impossible : ${errorMessage(err)}`;
    await db.recordDispatch(provider.name, true, summary.error);
    log(`[whatsapp] ${summary.error}`);
    return summary;
  }
  summary.claimed = jobs.length;

  let lastError: string | null = null;

  const finish = async (job: ClaimedJob, outcome: Outcome, masked: string, providerMessageId: string | null, error: string | null) => {
    if (outcome === 'sent') summary.sent += 1;
    else if (outcome === 'retry') summary.retried += 1;
    else if (outcome === 'failed') summary.failed += 1;
    else summary.skipped += 1;
    if (error && outcome !== 'skipped') lastError = error;
    log(`[whatsapp] ${job.id} ${job.kind} → ${masked} : ${outcome}${error ? ` (${error})` : ''}`);
    try {
      await db.complete(job.id, outcome, provider.name, providerMessageId, error);
    } catch (err) {
      // La notification reste « sending » ; whatsapp_maintenance la remet en
      // attente à l'expiration du verrou (5 min).
      lastError = `whatsapp_complete(${job.id}) : ${errorMessage(err)}`;
      log(`[whatsapp] ${lastError}`);
    }
  };

  for (const job of jobs) {
    let masked = job.recipient_masked ?? '(inconnu)';
    let outcome: Outcome;
    let providerMessageId: string | null = null;
    let error: string | null = null;

    try {
      const ctx = await db.messageContext(job.id);
      if (!ctx || ctx.relevant !== true) {
        await finish(job, 'skipped', masked, null, ctx?.reason ?? 'no_longer_relevant');
        continue;
      }
      if (!isValidRecipient(ctx.to)) {
        await finish(job, 'failed', masked, null, 'Numéro du destinataire absent ou invalide.');
        continue;
      }
      masked = maskPhone(ctx.to);
      const kind = ctx.kind ?? job.kind;
      if (!isKind(kind)) {
        await finish(job, 'failed', masked, null, `Type de notification inconnu : ${kind}.`);
        continue;
      }

      let msg: WhatsAppMessage;
      try {
        msg = renderMessage(kind, ctx.params ?? {}, templateIds, ctx.to);
      } catch (err) {
        // Données incomplètes : réessayer ne changerait rien.
        await finish(job, 'failed', masked, null, `Message impossible à composer : ${errorMessage(err)}`);
        continue;
      }

      const result = await provider.send(msg);
      if (result.ok) {
        outcome = 'sent';
        providerMessageId = result.providerMessageId;
      } else {
        outcome = result.retryable ? 'retry' : 'failed';
        error = redactPhones(result.error).slice(0, 500);
      }
    } catch (err) {
      outcome = 'retry';
      error = errorMessage(err);
    }

    await finish(job, outcome, masked, providerMessageId, error);
  }

  await db.recordDispatch(provider.name, true, lastError);
  return summary;
}
