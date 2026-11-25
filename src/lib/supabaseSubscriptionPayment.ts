import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { toQr, type OrangeQr } from './supabaseOrangeMoney';
import { isSubscriptionPayState, type SubscriptionPayPeriod, type SubscriptionPayState } from './subscriptionPaymentCore';

// Paiement de l'abonnement Ezial Plus avec Orange Money. Le QR est créé par la fonction Edge
// subscription-payment-initiate (identifiants Orange côté serveur uniquement). Le montant n'est jamais envoyé :
// la base le recalcule depuis la périodicité. L'abonnement est activé UNIQUEMENT par la base, à la confirmation d'Orange.
export const SUBSCRIPTION_INITIATE_FUNCTION = 'subscription-payment-initiate';

export async function startSubscriptionPayment(shopId: string, period: SubscriptionPayPeriod): Promise<{ qr: OrangeQr; amount: number } | { error: string }> {
  const { data, error } = await supabase.functions.invoke(SUBSCRIPTION_INITIATE_FUNCTION, { body: { shopId, billingPeriod: period, provider: 'orange_money' } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        if (typeof body?.error === 'string') return { error: body.error };
      } catch { /* réponse illisible : message générique */ }
    }
    return { error: 'Le paiement Orange Money n’a pas pu être lancé. Vérifiez votre connexion et réessayez.' };
  }
  const qr = toQr(String(data?.transactionId ?? ''), data?.checkoutData, data?.expiresAt);
  if (!qr || !qr.transactionId) return { error: 'Orange Money n’a pas renvoyé de QR code. Réessayez dans un instant.' };
  return { qr, amount: Number(data?.amount) || 0 };
}

/** Le compte est-il testeur ? (réponse du serveur : seule condition d'affichage de l'option « Test 25 FCFA »). */
export async function fetchTestPlanAvailable(): Promise<boolean> {
  const { data, error } = await supabase.rpc('subscription_test_plan_available');
  return !error && data === true;
}

export interface SubscriptionAttemptState { attemptId: string; state: SubscriptionPayState; period: SubscriptionPayPeriod; expiresAt: string | null; createdAt: string }

/** Dernière tentative de la boutique (3 jours). undefined = lecture impossible ; null = aucune. */
export async function fetchSubscriptionAttemptState(shopId: string): Promise<SubscriptionAttemptState | null | undefined> {
  const { data, error } = await supabase.rpc('seller_subscription_attempt_state', { p_shop_id: shopId });
  if (error) return error.code === 'PGRST202' || error.code === '42883' ? null : undefined;
  const row = (Array.isArray(data) ? data[0] : data) as { attempt_id?: string; payment_state?: unknown; billing_period?: string; expires_at?: string | null; created_at?: string } | null | undefined;
  if (!row || !row.attempt_id || !isSubscriptionPayState(row.payment_state)) return null;
  return { attemptId: row.attempt_id, state: row.payment_state, period: row.billing_period === 'annual' ? 'annual' : row.billing_period === 'test_25' ? 'test_25' : 'quarterly', expiresAt: row.expires_at ?? null, createdAt: row.created_at ?? '' };
}

/** État SANS connexion pour la page de retour (uuid non devinable). */
export async function fetchSubscriptionReturnStatus(ref: string): Promise<{ state: SubscriptionPayState; periodEnd: string | null } | 'unknown' | 'unavailable' | 'error'> {
  const { data, error } = await supabase.rpc('subscription_payment_return_status', { p_ref: ref });
  if (error) return error.code === 'PGRST202' || error.code === '42883' ? 'unavailable' : 'error';
  const row = (Array.isArray(data) ? data[0] : data) as { payment_state?: unknown; period_end?: string | null } | null | undefined;
  if (!row) return 'unknown';
  if (!isSubscriptionPayState(row.payment_state)) return 'error';
  return { state: row.payment_state, periodEnd: row.period_end ?? null };
}
