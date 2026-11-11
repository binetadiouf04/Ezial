// Ezial — cœur des paiements Wave / Orange Money (encaissements et
// décaissements vendeurs).
//
// TypeScript pur : aucune API propre à Deno ou à Node, aucun import. Le même
// fichier tourne dans les Edge Functions (payment-initiate, payment-webhook,
// payouts-dispatch) et dans les tests
// (`node --test supabase/functions/_shared/payments/core.test.ts`).
//
// ÉTAT ACTUEL : RIEN N'EST OPÉRATIONNEL. Les quatre adaptateurs (Wave
// encaissement, Wave décaissement, Orange Money encaissement, Orange Money
// décaissement) sont des implémentations « non configurées » : leur status()
// renvoie ready = false et aucune opération ne fait quoi que ce soit. Les
// fonctions d'orchestration s'arrêtent AVANT toute écriture en base quand
// l'adaptateur n'est pas prêt.
//
// Aucun adaptateur de test n'est accessible depuis la configuration (env) :
// les faux adaptateurs existent uniquement dans core.test.ts, si bien
// qu'aucune simulation ne peut tourner en production.
//
// Aucun détail des API Wave ou Orange Money (adresses, authentification,
// signatures, champs, statuts) n'est supposé ici : chaque adaptateur réel
// sera écrit à réception de la documentation officielle du fournisseur.

// ---------------------------------------------------------------------------
// Types communs
// ---------------------------------------------------------------------------

export type Provider = 'wave' | 'orange_money';
export type Capability = 'collection' | 'disbursement';
export type PaymentsEnvironment = 'sandbox' | 'production';

export const PROVIDERS: readonly Provider[] = ['wave', 'orange_money'];

export function isProvider(value: unknown): value is Provider {
  return typeof value === 'string' && (PROVIDERS as readonly string[]).includes(value);
}

export const PROVIDER_LABELS: Record<Provider, string> = {
  wave: 'Wave',
  orange_money: 'Orange Money',
};

export interface AdapterStatus {
  configured: boolean;
  ready: boolean;
  reason?: string;
}

/** Statut d'un paiement, traduit depuis le vocabulaire du fournisseur par l'adaptateur. */
export type PaymentStatus = 'confirmed' | 'failed' | 'cancelled' | 'expired' | 'pending' | 'unknown';

// ---------------------------------------------------------------------------
// Encaissement (le client paie sa commande)
// ---------------------------------------------------------------------------

export interface CheckoutRequest {
  transactionId: string;
  idempotencyKey: string;
  /** Montant en FCFA, entier, recalculé côté serveur (jamais fourni par le navigateur). */
  amount: number;
  currency: 'XOF';
  orderNumber: string;
  returnUrl: string;
  cancelUrl: string;
}

export type CheckoutResult =
  | { ok: true; providerReference: string; checkoutUrl: string; expiresAt: string | null }
  | { ok: false; retryable: boolean; error: string };

export interface WebhookEvent {
  eventId: string;
  type: string;
  providerReference: string;
  status: PaymentStatus;
  amount: number | null;
}

export interface WebhookVerification {
  valid: boolean;
  event?: WebhookEvent;
}

export type PaymentStatusResult =
  | { status: PaymentStatus; amount: number | null }
  | { error: string; retryable: boolean };

export interface CollectionAdapter {
  provider: Provider;
  status(): AdapterStatus;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  /** Vérifie la signature AVANT toute lecture du contenu. */
  verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookVerification>;
  /** Statut réel interrogé auprès de l'API du fournisseur (seule source de vérité). */
  getPaymentStatus(providerReference: string): Promise<PaymentStatusResult>;
}

// ---------------------------------------------------------------------------
// Décaissement (Ezial verse la part du vendeur)
// ---------------------------------------------------------------------------

export type BalanceResult = { ok: true; available: number | null } | { ok: false; error: string };

export interface PayoutRequest {
  payoutId: string;
  idempotencyKey: string;
  amount: number;
  currency: 'XOF';
  recipientPhone: string;
}

/**
 * - accepted : demande acceptée par le fournisseur — ce N'EST PAS un succès,
 *   le rapprochement confirmera ;
 * - rejected : refus définitif, rien n'a été envoyé ;
 * - uncertain : réseau / délai dépassé / réponse illisible — l'argent a pu
 *   partir : DOIT être rapproché, jamais renvoyé ;
 * - retryable_before_send : erreur certaine avant tout envoi.
 */
export type PayoutResult =
  | { outcome: 'accepted'; providerReference: string }
  | { outcome: 'rejected'; error: string }
  | { outcome: 'uncertain'; error: string }
  | { outcome: 'retryable_before_send'; error: string };

export type PayoutStatusResult =
  | { status: 'succeeded' | 'failed' | 'pending' | 'not_found'; providerReference?: string }
  | { error: string };

export interface DisbursementAdapter {
  provider: Provider;
  status(): AdapterStatus;
  getBalance(): Promise<BalanceResult>;
  sendPayout(req: PayoutRequest): Promise<PayoutResult>;
  getPayoutStatus(req: { providerReference: string | null; idempotencyKey: string }): Promise<PayoutStatusResult>;
}

// ---------------------------------------------------------------------------
// Adaptateurs « non configurés » (les seuls existants aujourd'hui)
// ---------------------------------------------------------------------------

function notIntegratedReason(provider: Provider, capability: Capability): string {
  const what = capability === 'collection' ? 'encaissement' : 'décaissement';
  return `API officielle ${PROVIDER_LABELS[provider]} ${what} non intégrée.`;
}

/** Base commune : n'appelle rien, ne fait rien, renvoie toujours un résultat non abouti. */
class NotConfiguredCollection implements CollectionAdapter {
  provider: Provider;
  environment: PaymentsEnvironment;

  constructor(provider: Provider, environment: PaymentsEnvironment) {
    this.provider = provider;
    this.environment = environment;
  }

  status(): AdapterStatus {
    return { configured: false, ready: false, reason: notIntegratedReason(this.provider, 'collection') };
  }

  createCheckout(): Promise<CheckoutResult> {
    return Promise.resolve({ ok: false, retryable: false, error: notIntegratedReason(this.provider, 'collection') });
  }

  verifyWebhook(): Promise<WebhookVerification> {
    // Sans vérification de signature réelle, aucune notification n'est valide.
    return Promise.resolve({ valid: false });
  }

  getPaymentStatus(): Promise<PaymentStatusResult> {
    return Promise.resolve({ error: notIntegratedReason(this.provider, 'collection'), retryable: false });
  }
}

class NotConfiguredDisbursement implements DisbursementAdapter {
  provider: Provider;
  environment: PaymentsEnvironment;

  constructor(provider: Provider, environment: PaymentsEnvironment) {
    this.provider = provider;
    this.environment = environment;
  }

  status(): AdapterStatus {
    return { configured: false, ready: false, reason: notIntegratedReason(this.provider, 'disbursement') };
  }

  getBalance(): Promise<BalanceResult> {
    return Promise.resolve({ ok: false, error: notIntegratedReason(this.provider, 'disbursement') });
  }

  sendPayout(): Promise<PayoutResult> {
    // Rien n'est envoyé : erreur certaine avant tout envoi.
    return Promise.resolve({ outcome: 'retryable_before_send', error: notIntegratedReason(this.provider, 'disbursement') });
  }

  getPayoutStatus(): Promise<PayoutStatusResult> {
    return Promise.resolve({ error: notIntegratedReason(this.provider, 'disbursement') });
  }
}

/**
 * Wave — encaissement.
 * // À IMPLÉMENTER à réception de la documentation officielle :
 * //   status()          : configuré seulement si tous les secrets WAVE_COLLECTION_* sont présents ;
 * //   createCheckout()  : création de la session de paiement (clé d'idempotence transmise) ;
 * //   verifyWebhook()   : vérification de la signature selon la méthode officielle, AVANT lecture ;
 * //   getPaymentStatus(): interrogation du statut réel + traduction vers PaymentStatus.
 */
export class WaveCollection extends NotConfiguredCollection {
  constructor(environment: PaymentsEnvironment) {
    super('wave', environment);
  }
}

/**
 * Wave — décaissement (versements aux vendeurs).
 * // À IMPLÉMENTER à réception de la documentation officielle :
 * //   status(), getBalance(), sendPayout() (clé d'idempotence transmise),
 * //   getPayoutStatus() (par référence ET par clé d'idempotence si l'API le permet).
 */
export class WaveDisbursement extends NotConfiguredDisbursement {
  constructor(environment: PaymentsEnvironment) {
    super('wave', environment);
  }
}

/**
 * Orange Money — encaissement.
 * // À IMPLÉMENTER à réception de la documentation officielle :
 * //   status(), createCheckout(), verifyWebhook(), getPaymentStatus().
 */
export class OrangeMoneyCollection extends NotConfiguredCollection {
  constructor(environment: PaymentsEnvironment) {
    super('orange_money', environment);
  }
}

/**
 * Orange Money — décaissement.
 * // À IMPLÉMENTER à réception de la documentation officielle :
 * //   status(), getBalance(), sendPayout(), getPayoutStatus().
 */
export class OrangeMoneyDisbursement extends NotConfiguredDisbursement {
  constructor(environment: PaymentsEnvironment) {
    super('orange_money', environment);
  }
}

export interface Adapters {
  environment: PaymentsEnvironment;
  collection: Record<Provider, CollectionAdapter>;
  disbursement: Record<Provider, DisbursementAdapter>;
}

/**
 * Construit les quatre adaptateurs. Aujourd'hui ils sont TOUJOURS « non
 * configurés », quelle que soit la configuration. Seul PAYMENTS_ENVIRONMENT
 * ('sandbox' par défaut, ou 'production') est lu, pour usage futur.
 */
export function createAdapters(env: Record<string, string | undefined>): Adapters {
  const environment: PaymentsEnvironment = env.PAYMENTS_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
  return {
    environment,
    collection: {
      wave: new WaveCollection(environment),
      orange_money: new OrangeMoneyCollection(environment),
    },
    disbursement: {
      wave: new WaveDisbursement(environment),
      orange_money: new OrangeMoneyDisbursement(environment),
    },
  };
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

/** Masque un numéro pour les journaux : « +22177•••67 ». */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '(aucun)';
  if (phone.length <= 8) return '•••';
  return phone.slice(0, 6) + '•••' + phone.slice(-2);
}

/** Retire tout numéro de téléphone complet d'un texte avant journalisation ou stockage. */
export function redactPhones(text: string): string {
  return text.replace(/\+?\d[\d \-.]{6,}\d/g, (m) => {
    const digits = m.replace(/[^\d+]/g, '');
    return digits.replace(/\D/g, '').length >= 9 ? maskPhone(digits) : m;
  });
}

function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return redactPhones(raw).slice(0, 500);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** Erreur métier renvoyée par une fonction SQL (code P0001), au texte déjà destiné au client. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

type Log = (line: string) => void;
const defaultLog: Log = (line) => console.log(line);

// ---------------------------------------------------------------------------
// Accès base (fonctions RPC réservées à service_role, voir la migration)
// ---------------------------------------------------------------------------

/** Ligne renvoyée par payments_create_transaction. */
export interface TransactionRow {
  id: string;
  order_id: string;
  provider: Provider;
  status: 'initiated' | 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'expired';
  amount: number;
  currency: string;
  idempotency_key: string;
  provider_reference: string | null;
  checkout_url: string | null;
  expires_at: string | null;
}

export interface RecordEventInput {
  provider: Provider;
  capability: Capability;
  providerEventId: string;
  eventType: string | null;
  providerReference: string | null;
  reportedStatus: string | null;
  reportedAmount: number | null;
  signatureValid: boolean;
}

export interface InitiateDb {
  /** payments_create_transaction : montant recalculé côté serveur, propriété de la commande vérifiée. */
  createTransaction(orderId: string, provider: Provider, userId: string): Promise<TransactionRow>;
  /** Numéro lisible de la commande (orders.order_number). */
  getOrderNumber(orderId: string): Promise<string | null>;
  /** payments_set_pending */
  setPending(transactionId: string, providerReference: string, checkoutUrl: string, expiresAt: string | null): Promise<void>;
  /** payments_fail */
  fail(transactionId: string, status: 'failed' | 'cancelled' | 'expired', reason: string): Promise<string>;
}

export interface WebhookDb {
  /** payments_record_event : une seule fois par (fournisseur, capacité, identifiant d'événement). */
  recordEvent(input: RecordEventInput): Promise<{ new: boolean; id: string | null; processed: boolean }>;
  /** payments_mark_event_processed */
  markEventProcessed(eventId: string, result: string): Promise<void>;
  /** Lecture de payment_transactions par (fournisseur, référence) avec la clé serveur. */
  findTransactionByReference(provider: Provider, providerReference: string): Promise<{ id: string; amount: number; status: string } | null>;
  /** payments_confirm — uniquement après vérification du statut auprès du fournisseur. */
  confirm(transactionId: string, providerReference: string, confirmedAmount: number): Promise<string>;
  /** payments_fail */
  fail(transactionId: string, status: 'failed' | 'cancelled' | 'expired', reason: string): Promise<string>;
}

/** Ligne de public.seller_payouts. */
export interface PayoutRow {
  id: string;
  shop_id: string;
  provider: Provider;
  recipient_phone: string;
  amount: number;
  status: 'scheduled' | 'processing' | 'unknown' | 'succeeded' | 'failed' | 'blocked' | 'cancelled';
  idempotency_key: string;
  provider_reference: string | null;
  attempts: number;
}

export type PayoutOutcome = 'succeeded' | 'failed' | 'unknown' | 'blocked' | 'retry';

export interface PayoutDb {
  /** payments_record_provider_status */
  recordProviderStatus(provider: Provider, capability: Capability, configured: boolean, ready: boolean, balance: number | null, error: string | null): Promise<void>;
  /** payouts_to_reconcile */
  toReconcile(limit: number): Promise<PayoutRow[]>;
  /** payouts_prepare_due */
  prepareDue(): Promise<number>;
  /** payouts_claim_batch (ne renvoie jamais un versement « unknown » ou « processing ») */
  claimBatch(limit: number): Promise<PayoutRow[]>;
  /** payouts_record_result */
  recordPayoutResult(payoutId: string, outcome: PayoutOutcome, providerReference: string | null, error: string | null): Promise<string>;
}

export type PaymentsDb = InitiateDb & WebhookDb & PayoutDb;

export interface PaymentSettings {
  collections_enabled: boolean;
  payouts_enabled: boolean;
  payout_frequency?: 'daily' | 'weekly';
  payout_weekday?: number;
}

// ---------------------------------------------------------------------------
// a. Lancer un paiement (appelé par payment-initiate)
// ---------------------------------------------------------------------------

export const NOT_AVAILABLE_MESSAGE = 'Le paiement en ligne Wave / Orange Money est en cours d’activation.';

export type InitiateErrorCode = 'not_available' | 'invalid_request' | 'refused' | 'provider_error' | 'internal_error';

export type InitiateResult =
  | { ok: true; checkoutUrl: string; transactionId: string }
  | { ok: false; code: InitiateErrorCode; message: string };

export interface InitiateInput {
  orderId: string;
  provider: Provider;
  /** Identifiant issu du jeton vérifié, jamais du corps de la requête. */
  userId: string;
  /** « {orderNumber} » est remplacé par le numéro de commande. */
  returnUrl: string;
  cancelUrl: string;
}

function fillUrl(template: string, orderNumber: string): string {
  return template.split('{orderNumber}').join(encodeURIComponent(orderNumber));
}

function isHttpsUrl(value: string): boolean {
  return /^https:\/\/[^\s]+$/.test(value);
}

export async function initiatePayment(
  db: InitiateDb,
  adapter: CollectionAdapter,
  input: InitiateInput,
  opts: { settings?: Pick<PaymentSettings, 'collections_enabled'>; log?: Log } = {},
): Promise<InitiateResult> {
  const log = opts.log ?? defaultLog;

  // 1. Rien n'est créé tant que l'adaptateur n'est pas prêt.
  const readiness = adapter.status();
  if (!readiness.ready) {
    log(`[paiements] encaissement ${adapter.provider} non prêt : ${readiness.reason ?? 'non configuré'}`);
    return { ok: false, code: 'not_available', message: NOT_AVAILABLE_MESSAGE };
  }
  if (opts.settings && !opts.settings.collections_enabled) {
    return { ok: false, code: 'not_available', message: NOT_AVAILABLE_MESSAGE };
  }
  if (!isHttpsUrl(input.returnUrl) || !isHttpsUrl(input.cancelUrl)) {
    log('[paiements] adresses de retour / annulation non configurées');
    return { ok: false, code: 'not_available', message: NOT_AVAILABLE_MESSAGE };
  }
  if (!isUuid(input.orderId) || !isUuid(input.userId) || input.provider !== adapter.provider) {
    return { ok: false, code: 'invalid_request', message: 'Demande de paiement invalide.' };
  }

  // 2. Transaction côté serveur (montant = total de la commande en base).
  let tx: TransactionRow;
  try {
    tx = await db.createTransaction(input.orderId, input.provider, input.userId);
  } catch (err) {
    if (err instanceof UserFacingError) return { ok: false, code: 'refused', message: err.message };
    log(`[paiements] création de transaction impossible : ${errorText(err)}`);
    return { ok: false, code: 'internal_error', message: 'Le paiement n’a pas pu être lancé. Réessayez dans un instant.' };
  }

  // Tentative déjà ouverte avec une page de paiement valide : on la réutilise.
  if (tx.status === 'pending' && tx.checkout_url && (!tx.expires_at || Date.parse(tx.expires_at) > Date.now())) {
    return { ok: true, checkoutUrl: tx.checkout_url, transactionId: tx.id };
  }

  try {
    const orderNumber = (await db.getOrderNumber(tx.order_id)) ?? tx.order_id;
    const checkout = await adapter.createCheckout({
      transactionId: tx.id,
      idempotencyKey: tx.idempotency_key,
      amount: tx.amount,
      currency: 'XOF',
      orderNumber,
      returnUrl: fillUrl(input.returnUrl, orderNumber),
      cancelUrl: fillUrl(input.cancelUrl, orderNumber),
    });

    if (!checkout.ok) {
      const error = redactPhones(checkout.error).slice(0, 300);
      log(`[paiements] ${tx.id} : page de paiement refusée par ${adapter.provider} (${error})`);
      // Refus définitif : la tentative est close, une nouvelle sera créée au
      // prochain essai. Erreur passagère : la tentative reste ouverte et sera
      // réutilisée avec la même clé d'idempotence.
      if (!checkout.retryable) await db.fail(tx.id, 'failed', error);
      return {
        ok: false,
        code: 'provider_error',
        message: `${PROVIDER_LABELS[adapter.provider]} n’a pas pu ouvrir la page de paiement. Réessayez dans un instant ou choisissez un autre moyen de paiement.`,
      };
    }
    if (!isHttpsUrl(checkout.checkoutUrl) || !checkout.providerReference) {
      log(`[paiements] ${tx.id} : réponse incomplète de ${adapter.provider}`);
      return { ok: false, code: 'provider_error', message: `${PROVIDER_LABELS[adapter.provider]} n’a pas pu ouvrir la page de paiement. Réessayez dans un instant.` };
    }

    await db.setPending(tx.id, checkout.providerReference, checkout.checkoutUrl, checkout.expiresAt);
    log(`[paiements] ${tx.id} : page de paiement ${adapter.provider} créée (${tx.amount} FCFA)`);
    return { ok: true, checkoutUrl: checkout.checkoutUrl, transactionId: tx.id };
  } catch (err) {
    log(`[paiements] ${tx.id} : erreur pendant le lancement : ${errorText(err)}`);
    return { ok: false, code: 'internal_error', message: 'Le paiement n’a pas pu être lancé. Réessayez dans un instant.' };
  }
}

// ---------------------------------------------------------------------------
// b. Notification d'encaissement (appelé par payment-webhook)
// ---------------------------------------------------------------------------

export interface WebhookResponse {
  status: number;
  body: { ok: boolean; result: string };
}

export async function handleCollectionWebhook(
  db: WebhookDb,
  adapter: CollectionAdapter,
  rawBody: string,
  headers: Record<string, string>,
  opts: { log?: Log } = {},
): Promise<WebhookResponse> {
  const log = opts.log ?? defaultLog;
  const provider = adapter.provider;

  if (!adapter.status().ready) {
    return { status: 503, body: { ok: false, result: 'not_configured' } };
  }

  // 1. Signature vérifiée AVANT toute lecture ; une notification non signée
  //    n'est ni enregistrée ni traitée.
  let verification: WebhookVerification;
  try {
    verification = await adapter.verifyWebhook(rawBody, headers);
  } catch (err) {
    log(`[paiements] webhook ${provider} : vérification impossible (${errorText(err)})`);
    return { status: 401, body: { ok: false, result: 'invalid_signature' } };
  }
  const event = verification.event;
  if (!verification.valid || !event || !event.eventId || !event.providerReference) {
    log(`[paiements] webhook ${provider} rejeté : signature invalide ou contenu incomplet`);
    return { status: 401, body: { ok: false, result: 'invalid_signature' } };
  }

  // 2. Enregistrement unique (anti-doublon).
  let recorded: { new: boolean; id: string | null; processed: boolean };
  try {
    recorded = await db.recordEvent({
      provider,
      capability: 'collection',
      providerEventId: event.eventId,
      eventType: event.type || null,
      providerReference: event.providerReference,
      reportedStatus: event.status,
      reportedAmount: event.amount,
      signatureValid: true,
    });
  } catch (err) {
    log(`[paiements] webhook ${provider} : enregistrement impossible (${errorText(err)})`);
    return { status: 500, body: { ok: false, result: 'error' } };
  }
  // Doublon déjà traité → rien à faire. Doublon dont le traitement n'a pas
  // abouti (statut invérifiable la première fois) → retraité ; la
  // confirmation reste idempotente côté base.
  if (!recorded.id || (!recorded.new && recorded.processed)) {
    return { status: 200, body: { ok: true, result: 'duplicate' } };
  }
  const eventRowId = recorded.id;

  const finish = async (result: string, status = 200): Promise<WebhookResponse> => {
    // Une erreur temporaire (5xx) laisse l'événement « non traité » : le
    // nouvel envoi du fournisseur sera traité au lieu d'être ignoré.
    if (status < 500) {
      try {
        await db.markEventProcessed(eventRowId, result);
      } catch (err) {
        log(`[paiements] webhook ${provider} : marquage impossible (${errorText(err)})`);
      }
    }
    log(`[paiements] webhook ${provider} ${event.eventId} : ${result}`);
    return { status, body: { ok: status < 400, result } };
  };

  try {
    const tx = await db.findTransactionByReference(provider, event.providerReference);
    if (!tx) return await finish('transaction_introuvable');

    // 3. Ne JAMAIS se fier au seul contenu du webhook : statut réel demandé à l'API.
    const real = await adapter.getPaymentStatus(event.providerReference);
    if ('error' in real) {
      return await finish(`verification_impossible: ${redactPhones(real.error).slice(0, 150)}`, real.retryable ? 503 : 200);
    }

    switch (real.status) {
      case 'confirmed': {
        if (real.amount === null || !Number.isInteger(real.amount)) return await finish('montant_absent');
        const res = await db.confirm(tx.id, event.providerReference, real.amount);
        return await finish(`confirm:${res}`);
      }
      case 'failed':
      case 'cancelled':
      case 'expired': {
        const res = await db.fail(tx.id, real.status, `Statut ${PROVIDER_LABELS[provider]} : ${real.status}`);
        return await finish(`fail:${res}`);
      }
      default:
        // pending / unknown : rien n'est modifié.
        return await finish(`ignored:${real.status}`);
    }
  } catch (err) {
    return await finish(`error: ${errorText(err).slice(0, 150)}`, 500);
  }
}

// ---------------------------------------------------------------------------
// c. Versements aux vendeurs (appelé par payouts-dispatch)
// ---------------------------------------------------------------------------

export interface PayoutsSummary {
  enabled: boolean;
  ready: Record<Provider, boolean>;
  reconciled: number;
  prepared: number;
  claimed: number;
  accepted: number;
  succeeded: number;
  failed: number;
  unknown: number;
  blocked: number;
  retried: number;
  reason?: string;
  error?: string;
}

const RECIPIENT = /^\+221\d{9}$/;

export async function runPayouts(
  db: PayoutDb,
  adapters: Pick<Adapters, 'collection' | 'disbursement'>,
  settings: PaymentSettings,
  opts: { log?: Log; reconcileLimit?: number; batchLimit?: number } = {},
): Promise<PayoutsSummary> {
  const log = opts.log ?? defaultLog;
  const summary: PayoutsSummary = {
    enabled: !!settings.payouts_enabled,
    ready: { wave: false, orange_money: false },
    reconciled: 0,
    prepared: 0,
    claimed: 0,
    accepted: 0,
    succeeded: 0,
    failed: 0,
    unknown: 0,
    blocked: 0,
    retried: 0,
  };

  // 0. État réel des quatre API (visible dans l'administration).
  for (const provider of PROVIDERS) {
    const c = adapters.collection[provider].status();
    await safeRecordStatus(db, log, provider, 'collection', c, null, c.ready ? null : (c.reason ?? null));

    const dAdapter = adapters.disbursement[provider];
    const d = dAdapter.status();
    let balance: number | null = null;
    let error: string | null = d.ready ? null : (d.reason ?? null);
    if (d.ready) {
      try {
        const b = await dAdapter.getBalance();
        if (b.ok) balance = b.available;
        else error = `Solde indisponible : ${redactPhones(b.error).slice(0, 200)}`;
      } catch (err) {
        error = `Solde indisponible : ${errorText(err)}`;
      }
    }
    summary.ready[provider] = d.ready;
    await safeRecordStatus(db, log, provider, 'disbursement', d, balance, error);
  }

  if (!settings.payouts_enabled) {
    summary.reason = 'Versements désactivés (payment_settings.payouts_enabled = false).';
    log(`[versements] ${summary.reason}`);
    return summary;
  }
  if (!PROVIDERS.some((p) => summary.ready[p])) {
    summary.reason = 'Aucune API de décaissement prête.';
    log(`[versements] ${summary.reason}`);
    return summary;
  }

  // Versements déjà touchés pendant ce passage : jamais deux envois.
  const touched = new Set<string>();

  // 1. Rapprochement d'abord (réponses incertaines des passages précédents).
  let toReconcile: PayoutRow[] = [];
  try {
    toReconcile = await db.toReconcile(opts.reconcileLimit ?? 20);
  } catch (err) {
    summary.error = `Liste à rapprocher indisponible : ${errorText(err)}`;
    log(`[versements] ${summary.error}`);
    return summary; // sans rapprochement possible, on n'envoie rien
  }
  for (const p of toReconcile) {
    touched.add(p.id);
    const adapter = adapters.disbursement[p.provider];
    if (!adapter || !summary.ready[p.provider]) continue;
    try {
      const st = await adapter.getPayoutStatus({ providerReference: p.provider_reference, idempotencyKey: p.idempotency_key });
      if ('error' in st) {
        log(`[versements] ${p.id} : statut indisponible (${redactPhones(st.error).slice(0, 200)}), nouvel essai au prochain passage`);
        continue;
      }
      const ref = st.providerReference ?? p.provider_reference;
      if (st.status === 'succeeded') {
        await db.recordPayoutResult(p.id, 'succeeded', ref, null);
        summary.succeeded += 1;
        summary.reconciled += 1;
      } else if (st.status === 'failed') {
        await db.recordPayoutResult(p.id, 'failed', ref, `Échec confirmé par ${PROVIDER_LABELS[p.provider]}.`);
        summary.failed += 1;
        summary.reconciled += 1;
      } else if (st.status === 'not_found') {
        // Introuvable chez le fournisseur : on ne conclut PAS à un échec et on
        // ne renvoie JAMAIS ; vérification manuelle nécessaire.
        if (p.status === 'processing') {
          await db.recordPayoutResult(p.id, 'unknown', ref, 'Introuvable chez le fournisseur : vérification manuelle nécessaire.');
        }
        summary.unknown += 1;
        log(`[versements] ${p.id} → ${maskPhone(p.recipient_phone)} : introuvable chez ${p.provider}, reste « unknown » (vérification manuelle)`);
      } else {
        // pending : on attend. Un « processing » ancien passe « unknown ».
        if (p.status === 'processing') await db.recordPayoutResult(p.id, 'unknown', ref, 'En cours chez le fournisseur.');
        summary.unknown += 1;
      }
    } catch (err) {
      log(`[versements] ${p.id} : rapprochement interrompu (${errorText(err)})`);
    }
  }

  // 2. Préparation des versements dus (fréquence gérée en SQL).
  try {
    summary.prepared = await db.prepareDue();
  } catch (err) {
    summary.error = `Préparation impossible : ${errorText(err)}`;
    log(`[versements] ${summary.error}`);
  }

  // 3. Envoi.
  let batch: PayoutRow[];
  try {
    batch = await db.claimBatch(opts.batchLimit ?? 10);
  } catch (err) {
    summary.error = `Réservation impossible : ${errorText(err)}`;
    log(`[versements] ${summary.error}`);
    return summary;
  }
  summary.claimed = batch.length;

  for (const p of batch) {
    if (touched.has(p.id)) {
      log(`[versements] ${p.id} déjà traité pendant ce passage : ignoré`);
      continue;
    }
    touched.add(p.id);
    const masked = maskPhone(p.recipient_phone);
    const label = PROVIDER_LABELS[p.provider] ?? p.provider;
    const record = async (outcome: PayoutOutcome, ref: string | null, error: string | null) => {
      if (outcome === 'succeeded') summary.succeeded += 1;
      else if (outcome === 'failed') summary.failed += 1;
      else if (outcome === 'unknown') summary.unknown += 1;
      else if (outcome === 'blocked') summary.blocked += 1;
      else summary.retried += 1;
      log(`[versements] ${p.id} ${p.provider} ${p.amount} FCFA → ${masked} : ${outcome}${error ? ` (${error})` : ''}`);
      try {
        await db.recordPayoutResult(p.id, outcome, ref, error);
      } catch (err) {
        // Le versement reste « processing » : il sera rapproché (jamais renvoyé).
        summary.error = `payouts_record_result(${p.id}) : ${errorText(err)}`;
        log(`[versements] ${summary.error}`);
      }
    };

    const adapter = adapters.disbursement[p.provider];
    if (!adapter || !adapter.status().ready) {
      await record('blocked', null, `API de décaissement ${label} indisponible.`);
      continue;
    }
    if (!Number.isInteger(p.amount) || p.amount <= 0) {
      await record('blocked', null, 'Montant de versement invalide.');
      continue;
    }
    if (!RECIPIENT.test(p.recipient_phone ?? '')) {
      await record('blocked', null, 'Numéro de réception invalide.');
      continue;
    }

    // Fonds disponibles sur le compte du MÊME fournisseur (aucun transfert
    // entre Wave et Orange Money).
    let balance: BalanceResult;
    try {
      balance = await adapter.getBalance();
    } catch (err) {
      balance = { ok: false, error: errorText(err) };
    }
    if (!balance.ok) {
      await record('blocked', null, `API ${label} indisponible (solde) : ${redactPhones(balance.error).slice(0, 200)}`);
      continue;
    }
    if (balance.available !== null && balance.available < p.amount) {
      await record('blocked', null, `Fonds insuffisants sur le compte ${label}`);
      continue;
    }

    let sent: PayoutResult;
    try {
      sent = await adapter.sendPayout({
        payoutId: p.id,
        idempotencyKey: p.idempotency_key,
        amount: p.amount,
        currency: 'XOF',
        recipientPhone: p.recipient_phone,
      });
    } catch (err) {
      // Exception pendant l'envoi : l'argent a pu partir → incertain.
      sent = { outcome: 'uncertain', error: errorText(err) };
    }

    if (sent.outcome === 'accepted') {
      summary.accepted += 1;
      // Demande acceptée ≠ versement réussi : « unknown » jusqu'au rapprochement.
      await record('unknown', sent.providerReference, null);
      try {
        const st = await adapter.getPayoutStatus({ providerReference: sent.providerReference, idempotencyKey: p.idempotency_key });
        if (!('error' in st) && st.status === 'succeeded') {
          summary.unknown -= 1;
          await record('succeeded', st.providerReference ?? sent.providerReference, null);
        } else if (!('error' in st) && st.status === 'failed') {
          summary.unknown -= 1;
          await record('failed', st.providerReference ?? sent.providerReference, `Échec confirmé par ${label}.`);
        }
      } catch (err) {
        log(`[versements] ${p.id} : vérification immédiate impossible (${errorText(err)}), rapprochement au prochain passage`);
      }
    } else if (sent.outcome === 'rejected') {
      await record('failed', null, redactPhones(sent.error).slice(0, 300));
    } else if (sent.outcome === 'uncertain') {
      await record('unknown', null, redactPhones(sent.error).slice(0, 300));
    } else {
      await record('retry', null, redactPhones(sent.error).slice(0, 300));
    }
  }

  return summary;
}

async function safeRecordStatus(
  db: PayoutDb,
  log: Log,
  provider: Provider,
  capability: Capability,
  status: AdapterStatus,
  balance: number | null,
  error: string | null,
): Promise<void> {
  try {
    await db.recordProviderStatus(provider, capability, status.configured, status.ready, balance, error);
  } catch (err) {
    log(`[paiements] état ${provider}/${capability} non enregistré : ${errorText(err)}`);
  }
}
