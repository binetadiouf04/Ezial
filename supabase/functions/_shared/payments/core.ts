import { OrangeMoneyCollection } from './orange-money.ts';
import type { FetchLike } from './orange-money.ts';
import { WaveCollection } from './wave.ts';

// Ezial — cœur des paiements Wave / Orange Money (encaissements et
// décaissements vendeurs).
//
// TypeScript pur : aucune API propre à Deno ou à Node ; seul import : l'adaptateur
// Orange Money (./orange-money.ts, lui aussi en TypeScript pur). Le même
// fichier tourne dans les Edge Functions (payment-initiate, payment-webhook,
// payouts-dispatch) et dans les tests
// (`node --test supabase/functions/_shared/payments/core.test.ts`).
//
// ÉTAT ACTUEL : l'encaissement Orange Money « QR CODE – OM » (./orange-money.ts)
// et l'encaissement Wave Checkout (./wave.ts) sont écrits d'après la documentation
// officielle. Chacun n'est prêt que si tous ses secrets sont présents, ET il ne sert
// que si son interrupteur est actif (payment_settings.orange_money_enabled pour
// Orange Money, collections_enabled pour Wave). Le décaissement Wave et le
// décaissement Orange Money restent « non configurés ». Les
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
export type PaymentStatus = 'confirmed' | 'failed' | 'cancelled' | 'expired' | 'pending' | 'unknown' | 'not_found';

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
  /** Durée de validité souhaitée (secondes), alignée sur la fin du délai de paiement de la commande. */
  validitySeconds?: number;
}

/** Données d'affichage d'un paiement par QR (Orange Money) : aucune donnée secrète. */
export interface CheckoutData {
  kind: 'orange_money_qr';
  /** Image PNG du QR, en base64 (sans préfixe data:). */
  qrCode: string | null;
  deepLink: string | null;
  deepLinks: { maxit: string | null; om: string | null };
  shortLink: string | null;
  qrId: string | null;
  validUntil: string;
}

export type CheckoutResult =
  | { ok: true; providerReference: string; checkoutUrl: string | null; checkoutData?: CheckoutData; expiresAt: string | null }
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
  | {
    status: PaymentStatus;
    amount: number | null;
    providerTransactionId?: string | null;
    successCount?: number;
    /**
     * Référence cliente (notre identifiant de transaction) telle que le fournisseur l'a enregistrée.
     * Renseignée par Wave ; l'adaptateur Orange Money ne la renseigne jamais (champ absent = aucun contrôle).
     * Si elle est présente et différente de la transaction trouvée en base (y compris null), rien n'est enregistré.
     */
    clientReference?: string | null;
  }
  | { error: string; retryable: boolean };

export interface CollectionAdapter {
  provider: Provider;
  status(): AdapterStatus;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  /** Vérifie la signature AVANT toute lecture du contenu. */
  verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookVerification>;
  /** Statut réel interrogé auprès de l'API du fournisseur (seule source de vérité). */
  getPaymentStatus(providerReference: string): Promise<PaymentStatusResult>;
  /** Vérification groupée (optionnelle) : une seule recherche pour plusieurs références. */
  getPaymentStatuses?(references: string[], sinceIso: string): Promise<Map<string, PaymentStatusResult> | { error: string; retryable: boolean }>;
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

/** Décaissement « non configuré » : n'appelle rien, ne fait rien, renvoie toujours un résultat non abouti. */
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

// Wave — encaissement « Checkout » : voir ./wave.ts.

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

// Orange Money — encaissement « QR CODE – OM » : voir ./orange-money.ts.
export { OrangeMoneyCollection, WaveCollection };

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
 * Construit les quatre adaptateurs. PAYMENTS_ENVIRONMENT : 'sandbox' (défaut) ou
 * 'production'. Les encaissements Orange Money (ORANGE_MONEY_*) et Wave (WAVE_*)
 * lisent leurs secrets ; les deux décaissements restent « non configurés ».
 */
export function createAdapters(env: Record<string, string | undefined>, fetchImpl?: FetchLike): Adapters {
  const environment: PaymentsEnvironment = env.PAYMENTS_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
  return {
    environment,
    collection: {
      wave: new WaveCollection(environment, env, fetchImpl),
      orange_money: new OrangeMoneyCollection(environment, env, fetchImpl),
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
  status: 'initiated' | 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'expired' | 'superseded' | 'duplicate';
  amount: number;
  currency: string;
  idempotency_key: string;
  provider_reference: string | null;
  checkout_url: string | null;
  checkout_data?: CheckoutData | null;
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
  setPending(transactionId: string, providerReference: string, checkoutUrl: string | null, expiresAt: string | null): Promise<void>;
  /** payments_fail */
  fail(transactionId: string, status: 'failed' | 'cancelled' | 'expired', reason: string): Promise<string>;
  /** Fin du délai de paiement de la commande (orders.payment_deadline), si elle existe. */
  getPaymentDeadline?(orderId: string): Promise<string | null>;
  /** Enregistre les données d'affichage du QR (payment_transactions.checkout_data). */
  saveCheckoutData?(transactionId: string, data: CheckoutData): Promise<void>;
}

export interface WebhookDb {
  /** payments_record_event : une seule fois par (fournisseur, capacité, identifiant d'événement). */
  recordEvent(input: RecordEventInput): Promise<{ new: boolean; id: string | null; processed: boolean }>;
  /** payments_mark_event_processed */
  markEventProcessed(eventId: string, result: string): Promise<void>;
  /**
   * Lecture de payment_transactions par (fournisseur, référence) avec la clé serveur.
   * `kind` : 'subscription' quand la référence est celle d'une tentative de paiement d'ABONNEMENT
   * (subscription_payment_attempts) ; absent ou 'order' pour une commande.
   */
  findTransactionByReference(provider: Provider, providerReference: string): Promise<{ id: string; amount: number; status: string; kind?: AttemptKind } | null>;
  /** payments_confirm — uniquement après vérification du statut auprès du fournisseur. */
  confirm(transactionId: string, providerReference: string, confirmedAmount: number): Promise<string>;
  /** payments_fail */
  fail(transactionId: string, status: 'failed' | 'cancelled' | 'expired', reason: string): Promise<string>;
  /**
   * payments_record_verification : enregistre le statut constaté chez le fournisseur et applique
   * les règles de la base (confirmation, clôture, « introuvable » seulement après la fin de validité).
   * Quand il est fourni, il remplace confirm/fail.
   */
  recordVerification?(transactionId: string, status: PaymentStatus, amount: number | null, providerTransactionId: string | null, kind?: AttemptKind): Promise<string>;
}

/** Nature d'une tentative de paiement : commande (défaut) ou abonnement d'une boutique. */
export type AttemptKind = 'order' | 'subscription';

/** Ligne renvoyée par payments_reconcile_candidates (ou subscription_payments_reconcile_candidates : order_id vide). */
export interface ReconcileCandidate {
  transaction_id: string;
  order_id: string | null;
  /** Absent = commande. */
  kind?: AttemptKind;
  reference: string;
  status: string;
  expires_at: string | null;
  created_at: string;
  check_count: number;
}

export interface ReconcileDb {
  candidates(limit: number): Promise<ReconcileCandidate[]>;
  recordVerification(transactionId: string, status: PaymentStatus, amount: number | null, providerTransactionId: string | null, kind?: AttemptKind): Promise<string>;
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
  /** Interrupteur propre à Orange Money (Wave reste piloté par collections_enabled). */
  orange_money_enabled?: boolean;
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
  | { ok: true; checkoutUrl: string | null; transactionId: string; checkoutData?: CheckoutData; expiresAt?: string }
  | { ok: false; code: InitiateErrorCode; message: string };

export interface InitiateInput {
  orderId: string;
  provider: Provider;
  /** Identifiant issu du jeton vérifié, jamais du corps de la requête. */
  userId: string;
  /**
   * « {orderNumber} » est remplacé par le numéro de commande ; « {transactionId} » par
   * l'identifiant (uuid aléatoire) de la tentative, que la page de retour utilise pour
   * afficher l'état du paiement sans connexion (Safari n'a pas la session de l'application).
   */
  returnUrl: string;
  cancelUrl: string;
}

export function fillUrl(template: string, orderNumber: string, transactionId: string): string {
  const hadRef = template.includes('{transactionId}');
  let url = template
    .split('{orderNumber}').join(encodeURIComponent(orderNumber))
    .split('{transactionId}').join(encodeURIComponent(transactionId));
  // Ancienne adresse configurée sans {transactionId} : la référence non devinable
  // est ajoutée quand même, pour que la page de retour fonctionne sans connexion.
  if (!hadRef && !/[?&]ref=/.test(url)) {
    const hashAt = url.indexOf('#');
    const base = hashAt >= 0 ? url.slice(0, hashAt) : url;
    const hash = hashAt >= 0 ? url.slice(hashAt) : '';
    url = `${base}${base.includes('?') ? '&' : '?'}ref=${encodeURIComponent(transactionId)}${hash}`;
  }
  return url;
}

function isHttpsUrl(value: string): boolean {
  return /^https:\/\/[^\s]+$/.test(value);
}

/** Réponse de succès : les champs QR / expiration ne sont présents que s'ils existent. */
function withCheckout(transactionId: string, checkoutUrl: string | null, checkoutData: CheckoutData | undefined, expiresAt: string | null): InitiateResult {
  const res: InitiateResult = { ok: true, checkoutUrl, transactionId };
  if (checkoutData) res.checkoutData = checkoutData;
  if (checkoutData && expiresAt) res.expiresAt = expiresAt;
  return res;
}

export async function initiatePayment(
  db: InitiateDb,
  adapter: CollectionAdapter,
  input: InitiateInput,
  opts: { settings?: Pick<PaymentSettings, 'collections_enabled' | 'orange_money_enabled'>; log?: Log; now?: () => number } = {},
): Promise<InitiateResult> {
  const log = opts.log ?? defaultLog;

  // 1. Rien n'est créé tant que l'adaptateur n'est pas prêt.
  const readiness = adapter.status();
  if (!readiness.ready) {
    log(`[paiements] encaissement ${adapter.provider} non prêt : ${readiness.reason ?? 'non configuré'}`);
    return { ok: false, code: 'not_available', message: NOT_AVAILABLE_MESSAGE };
  }
  // Interrupteur propre à chaque moyen : Orange Money = orange_money_enabled, Wave = collections_enabled.
  if (opts.settings) {
    const enabled = input.provider === 'orange_money' ? opts.settings.orange_money_enabled === true : opts.settings.collections_enabled;
    if (!enabled) return { ok: false, code: 'not_available', message: NOT_AVAILABLE_MESSAGE };
  }
  const now = opts.now ?? Date.now;
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

  // Tentative déjà ouverte avec une page ou un QR encore valable : on la réutilise.
  if (tx.status === 'pending' && (tx.checkout_url || tx.checkout_data) && (!tx.expires_at || Date.parse(tx.expires_at) > now())) {
    return withCheckout(tx.id, tx.checkout_url, tx.checkout_data ?? undefined, tx.expires_at);
  }

  try {
    const orderNumber = (await db.getOrderNumber(tx.order_id)) ?? tx.order_id;
    // QR valable jusqu'à la fin du délai de paiement de la commande, jamais au-delà.
    let validitySeconds: number | undefined;
    if (db.getPaymentDeadline) {
      const deadline = await db.getPaymentDeadline(tx.order_id);
      if (deadline) {
        validitySeconds = Math.floor((Date.parse(deadline) - now()) / 1000);
        if (!(validitySeconds >= 60)) return { ok: false, code: 'refused', message: 'Le délai de paiement est dépassé.' };
        validitySeconds = Math.min(validitySeconds, 1800);
      }
    }
    const checkout = await adapter.createCheckout({
      transactionId: tx.id,
      idempotencyKey: tx.idempotency_key,
      amount: tx.amount,
      currency: 'XOF',
      orderNumber,
      returnUrl: fillUrl(input.returnUrl, orderNumber, tx.id),
      cancelUrl: fillUrl(input.cancelUrl, orderNumber, tx.id),
      validitySeconds,
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
    const hasPage = checkout.checkoutUrl !== null && isHttpsUrl(checkout.checkoutUrl);
    const hasQr = !!checkout.checkoutData && (!!checkout.checkoutData.qrCode || !!checkout.checkoutData.deepLink);
    if ((!hasPage && !hasQr) || !checkout.providerReference) {
      log(`[paiements] ${tx.id} : réponse incomplète de ${adapter.provider}`);
      return { ok: false, code: 'provider_error', message: `${PROVIDER_LABELS[adapter.provider]} n’a pas pu ouvrir la page de paiement. Réessayez dans un instant.` };
    }

    if (checkout.checkoutData && db.saveCheckoutData) await db.saveCheckoutData(tx.id, checkout.checkoutData);
    await db.setPending(tx.id, checkout.providerReference, hasPage ? checkout.checkoutUrl : null, checkout.expiresAt);
    log(`[paiements] ${tx.id} : ${hasPage ? 'page de paiement' : 'QR'} ${adapter.provider} créé (${tx.amount} FCFA)`);
    return withCheckout(tx.id, hasPage ? checkout.checkoutUrl : null, checkout.checkoutData, checkout.expiresAt);
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
    // La session du fournisseur doit appartenir à CETTE transaction (référence cliente = identifiant de transaction).
    if (real.clientReference !== undefined && real.clientReference !== tx.id) {
      log(`[paiements] ${tx.id} : la référence cliente du fournisseur ne correspond pas à la transaction — rien n'est enregistré`);
      return await finish('client_reference_mismatch');
    }
    if ((real.successCount ?? 0) > 1) log(`[paiements] ${tx.id} : ${real.successCount} paiements réussis pour une même référence — à vérifier`);

    // Base récente : les règles (confirmation, clôture, « introuvable ») sont appliquées par la base.
    if (db.recordVerification) {
      const res = tx.kind === 'subscription'
        ? await db.recordVerification(tx.id, real.status, real.amount, real.providerTransactionId ?? null, 'subscription')
        : await db.recordVerification(tx.id, real.status, real.amount, real.providerTransactionId ?? null);
      return await finish(`verify:${res}`);
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
// b bis. Vérification périodique des paiements en attente (appelé par payments-reconcile)
// ---------------------------------------------------------------------------

export interface ReconcileSummary {
  checked: number;
  results: Record<string, number>;
  error?: string;
}

/**
 * Interroge le fournisseur pour les tentatives non closes (QR en cours, anciens QR remplacés,
 * créations incertaines) et enregistre le statut constaté. Aucune conclusion locale : c'est la base
 * (payments_record_verification) qui décide, et une commande n'est annulée que par
 * orders_finalize_unpaid quand toutes ses tentatives sont closes chez le fournisseur.
 */
export async function reconcileCollections(
  db: ReconcileDb,
  adapter: CollectionAdapter,
  opts: { limit?: number; log?: Log } = {},
): Promise<ReconcileSummary> {
  const log = opts.log ?? defaultLog;
  const summary: ReconcileSummary = { checked: 0, results: {} };
  if (!adapter.status().ready) return { ...summary, error: 'not_configured' };
  const candidates = await db.candidates(opts.limit ?? 50);
  if (candidates.length === 0) return summary;

  let statuses: Map<string, PaymentStatusResult>;
  if (adapter.getPaymentStatuses) {
    const oldest = Math.min(...candidates.map((c) => Date.parse(c.created_at)).filter((n) => Number.isFinite(n)));
    const since = new Date((Number.isFinite(oldest) ? oldest : Date.now()) - 2 * 60 * 1000).toISOString();
    const res = await adapter.getPaymentStatuses(candidates.map((c) => c.reference), since);
    if (!(res instanceof Map)) {
      log(`[paiements] vérification ${adapter.provider} impossible : ${redactPhones(res.error).slice(0, 150)}`);
      return { ...summary, error: res.retryable ? 'provider_unavailable' : 'provider_refused' };
    }
    statuses = res;
  } else {
    statuses = new Map();
    for (const c of candidates.slice(0, 20)) statuses.set(c.reference, await adapter.getPaymentStatus(c.reference));
  }

  for (const c of candidates) {
    const real = statuses.get(c.reference);
    if (!real || 'error' in real) continue;
    if (real.clientReference !== undefined && real.clientReference !== c.transaction_id) {
      log(`[paiements] ${c.transaction_id} : la référence cliente du fournisseur ne correspond pas à la transaction — rien n'est enregistré`);
      summary.results['client_reference_mismatch'] = (summary.results['client_reference_mismatch'] ?? 0) + 1;
      continue;
    }
    if ((real.successCount ?? 0) > 1) log(`[paiements] ${c.transaction_id} : ${real.successCount} paiements réussis pour une même référence — à vérifier`);
    try {
      const res = c.kind === 'subscription'
        ? await db.recordVerification(c.transaction_id, real.status, real.amount, real.providerTransactionId ?? null, 'subscription')
        : await db.recordVerification(c.transaction_id, real.status, real.amount, real.providerTransactionId ?? null);
      summary.checked += 1;
      summary.results[res] = (summary.results[res] ?? 0) + 1;
    } catch (err) {
      log(`[paiements] ${c.transaction_id} : enregistrement de la vérification impossible (${errorText(err)})`);
    }
  }
  return summary;
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
