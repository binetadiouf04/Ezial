import { UserFacingError, fillUrl, isUuid, redactPhones } from './core.ts';
import type { CheckoutData, CollectionAdapter, InitiateErrorCode, PaymentSettings, Provider } from './core.ts';

// Ezial — lancement du paiement d'un ABONNEMENT Ezial Plus (boutique) avec Orange Money « QR CODE – OM ».
//
// Même mécanique que le paiement d'une commande (initiatePayment dans core.ts), sur la table dédiée
// subscription_payment_attempts : aucune des fonctions des commandes n'est utilisée ni modifiée.
//   * Le MONTANT n'est jamais lu de la requête : la base le recalcule (subscription_plan_price) à partir
//     de la périodicité demandée, et vérifie que la boutique appartient à l'appelant.
//   * QR valable 30 minutes. Interrupteur : payment_settings.orange_money_enabled OU compte testeur
//     (vérifié aussi par la base). Wave : même structure plus tard ; refusé pour l'instant.
//   * Le site ne conclut jamais « payé » : l'activation est faite par la base à la confirmation d'Orange
//     (payment-webhook / payments-reconcile -> subscription_payments_record_verification).
// TypeScript pur (testé par subscription.test.ts).

// 'test_25' : plan de TEST (25 FCFA, 1 jour), réservé aux comptes listés dans payment_testers (vérifié ici ET par la base).
export type BillingPeriod = 'quarterly' | 'annual' | 'test_25';
export const BILLING_PERIODS: readonly BillingPeriod[] = ['quarterly', 'annual', 'test_25'];

export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return typeof value === 'string' && (BILLING_PERIODS as readonly string[]).includes(value);
}

/** Validité du QR d'abonnement : 30 minutes. */
export const SUBSCRIPTION_QR_VALIDITY_SECONDS = 1800;

export const SUBSCRIPTION_NOT_AVAILABLE_MESSAGE = 'Le paiement de l’abonnement avec Orange Money est en cours d’activation.';

/** Ligne renvoyée par subscription_payments_create_attempt. */
export interface SubscriptionAttemptRow {
  id: string;
  shop_id: string;
  provider: Provider;
  billing_period: BillingPeriod;
  status: 'initiated' | 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'expired' | 'superseded' | 'duplicate';
  /** Montant en FCFA recalculé par la base. */
  amount: number;
  currency: string;
  idempotency_key: string;
  provider_reference: string | null;
  checkout_url: string | null;
  checkout_data?: CheckoutData | null;
  expires_at: string | null;
}

export interface SubscriptionInitiateDb {
  /** subscription_payments_create_attempt : montant recalculé, boutique de l'appelant, interrupteur, réutilisation. */
  createAttempt(shopId: string, billingPeriod: BillingPeriod, provider: Provider, userId: string): Promise<SubscriptionAttemptRow>;
  /** Enregistre les données d'affichage du QR (subscription_payment_attempts.checkout_data). */
  saveCheckoutData(attemptId: string, data: CheckoutData): Promise<void>;
  /** subscription_payments_set_pending */
  setPending(attemptId: string, providerReference: string, checkoutUrl: string | null, expiresAt: string | null): Promise<void>;
  /** subscription_payments_fail */
  fail(attemptId: string, status: 'failed' | 'cancelled' | 'expired', reason: string): Promise<string>;
}

export interface SubscriptionInitiateInput {
  shopId: string;
  billingPeriod: BillingPeriod;
  provider: Provider;
  /** Identifiant issu du jeton vérifié, jamais du corps de la requête. */
  userId: string;
  /** « {transactionId} » est remplacé par l'identifiant (uuid aléatoire) de la tentative : page de retour sans connexion. */
  returnUrl: string;
  cancelUrl: string;
}

export type SubscriptionInitiateResult =
  | { ok: true; transactionId: string; checkoutData: CheckoutData | null; expiresAt: string | null; amount: number; billingPeriod: BillingPeriod }
  | { ok: false; code: InitiateErrorCode; message: string };

const PROVIDER_ERROR = 'Orange Money n’a pas pu ouvrir la page de paiement. Réessayez dans un instant.';
const INTERNAL_ERROR = 'Le paiement n’a pas pu être lancé. Réessayez dans un instant.';

function isHttpsUrl(value: string): boolean {
  return /^https:\/\/[^\s]+$/.test(value);
}

function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return redactPhones(raw).slice(0, 500);
}

/** Numéro d'affichage chez Orange (métadonnées du QR) : « ABO-3F2A91C0 ». */
export function subscriptionLabel(attemptId: string): string {
  return `ABO-${attemptId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export async function initiateSubscriptionPayment(
  db: SubscriptionInitiateDb,
  adapter: CollectionAdapter,
  input: SubscriptionInitiateInput,
  opts: { settings?: Pick<PaymentSettings, 'collections_enabled' | 'orange_money_enabled'>; /** Le compte est-il dans payment_testers ? (plan test_25) */ isTester?: boolean; log?: (line: string) => void; now?: () => number } = {},
): Promise<SubscriptionInitiateResult> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const now = opts.now ?? Date.now;

  // Seul Orange Money est ouvert pour l'abonnement ; Wave suivra avec la même structure.
  if (input.provider !== 'orange_money' || adapter.provider !== 'orange_money') {
    return { ok: false, code: 'not_available', message: 'Le paiement de l’abonnement est disponible avec Orange Money.' };
  }
  // 1. Rien n'est créé tant que l'adaptateur n'est pas prêt ni l'interrupteur allumé.
  const readiness = adapter.status();
  if (!readiness.ready) {
    log(`[paiements] abonnement : encaissement ${adapter.provider} non prêt : ${readiness.reason ?? 'non configuré'}`);
    return { ok: false, code: 'not_available', message: SUBSCRIPTION_NOT_AVAILABLE_MESSAGE };
  }
  if (opts.settings && opts.settings.orange_money_enabled !== true) {
    return { ok: false, code: 'not_available', message: SUBSCRIPTION_NOT_AVAILABLE_MESSAGE };
  }
  if (!isHttpsUrl(input.returnUrl) || !isHttpsUrl(input.cancelUrl)) {
    log('[paiements] abonnement : adresses de retour / annulation non configurées');
    return { ok: false, code: 'not_available', message: SUBSCRIPTION_NOT_AVAILABLE_MESSAGE };
  }
  if (!isUuid(input.shopId) || !isUuid(input.userId) || !isBillingPeriod(input.billingPeriod)) {
    return { ok: false, code: 'invalid_request', message: 'Demande de paiement invalide.' };
  }

  if (input.billingPeriod === 'test_25' && opts.isTester !== true) {
    return { ok: false, code: 'refused', message: 'Ce paiement de test est réservé aux comptes testeurs.' };
  }

  // 2. Tentative côté serveur (montant = prix du plan en base, boutique de l'appelant).
  let attempt: SubscriptionAttemptRow;
  try {
    attempt = await db.createAttempt(input.shopId, input.billingPeriod, input.provider, input.userId);
  } catch (err) {
    if (err instanceof UserFacingError) return { ok: false, code: 'refused', message: err.message };
    log(`[paiements] abonnement : création de tentative impossible : ${errorText(err)}`);
    return { ok: false, code: 'internal_error', message: INTERNAL_ERROR };
  }
  const done = (data: CheckoutData | null, expiresAt: string | null): SubscriptionInitiateResult => ({
    ok: true, transactionId: attempt.id, checkoutData: data, expiresAt, amount: attempt.amount, billingPeriod: attempt.billing_period,
  });

  // QR déjà ouvert et encore valable : réutilisé (jamais de second QR inutile).
  if (attempt.status === 'pending' && attempt.checkout_data && (!attempt.expires_at || Date.parse(attempt.expires_at) > now())) {
    return done(attempt.checkout_data, attempt.expires_at);
  }

  try {
    const label = subscriptionLabel(attempt.id);
    const checkout = await adapter.createCheckout({
      transactionId: attempt.id,
      idempotencyKey: attempt.idempotency_key,
      amount: attempt.amount,
      currency: 'XOF',
      orderNumber: label,
      returnUrl: fillUrl(input.returnUrl, label, attempt.id),
      cancelUrl: fillUrl(input.cancelUrl, label, attempt.id),
      validitySeconds: SUBSCRIPTION_QR_VALIDITY_SECONDS,
    });
    if (!checkout.ok) {
      const error = redactPhones(checkout.error).slice(0, 300);
      log(`[paiements] abonnement ${attempt.id} : QR refusé par ${adapter.provider} (${error})`);
      // Refus définitif : tentative close ; erreur passagère : elle reste ouverte et sera réutilisée.
      if (!checkout.retryable) await db.fail(attempt.id, 'failed', error);
      return { ok: false, code: 'provider_error', message: PROVIDER_ERROR };
    }
    const hasQr = !!checkout.checkoutData && (!!checkout.checkoutData.qrCode || !!checkout.checkoutData.deepLink);
    if (!hasQr || !checkout.providerReference) {
      log(`[paiements] abonnement ${attempt.id} : réponse incomplète de ${adapter.provider}`);
      return { ok: false, code: 'provider_error', message: PROVIDER_ERROR };
    }
    await db.saveCheckoutData(attempt.id, checkout.checkoutData as CheckoutData);
    await db.setPending(attempt.id, checkout.providerReference, null, checkout.expiresAt);
    log(`[paiements] abonnement ${attempt.id} : QR ${adapter.provider} créé (${attempt.amount} FCFA, ${attempt.billing_period})`);
    return done(checkout.checkoutData ?? null, checkout.expiresAt);
  } catch (err) {
    log(`[paiements] abonnement ${attempt.id} : erreur pendant le lancement : ${errorText(err)}`);
    return { ok: false, code: 'internal_error', message: INTERNAL_ERROR };
  }
}
