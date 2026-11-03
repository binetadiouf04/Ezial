import { supabase } from './supabaseClient';

// Real seller subscription state, backed by the seller_subscriptions /
// subscription_payments tables (migration applied directly in Supabase —
// see admin confirmation). No payment gateway exists anywhere in Ezial yet,
// so activation/renewal is declarative: the seller submits their own
// Wave/Orange Money reference, an admin manually verifies it against their
// own account and confirms via the confirm_subscription_payment() RPC.

export type SubscriptionPlan = 'free' | 'pro';
export type SubscriptionPaymentMethod = 'wave' | 'orange_money';
export type SubscriptionPaymentStatus = 'pending_review' | 'confirmed' | 'rejected';

export const FREE_PRODUCT_LIMIT = 10;
export const PRO_PRODUCT_LIMIT = 30;
export const PRO_PRICE_FCFA = 5000;

export interface SellerSubscriptionInfo {
  plan: SubscriptionPlan;
  trialUsed: boolean;
  trialStart: string | null;
  trialEnd: string | null;
  proUntil: string | null;
  // True while Pro access (trial or paid) is currently in effect — the
  // stored `plan` column can lag one day behind `pro_until` until the
  // daily cron job runs, so this is the field the UI should actually read.
  isProActive: boolean;
  productLimit: number;
}

// A shop with no seller_subscriptions row at all (not yet activated, or
// activated before this feature existed and never backfilled) is implicitly
// Free with no trial used — mirrors the same coalesce the enforce_product_limit()
// trigger and the grant_seller_trial_on_activation() trigger already use.
export async function fetchSellerSubscription(shopId: string): Promise<SellerSubscriptionInfo> {
  const { data } = await supabase
    .from('seller_subscriptions')
    .select('plan, trial_used, trial_start, trial_end, pro_until')
    .eq('shop_id', shopId)
    .maybeSingle();

  const proUntil = (data?.pro_until as string | null) ?? null;
  const isProActive = !!proUntil && new Date(proUntil) > new Date();

  return {
    plan: (data?.plan as SubscriptionPlan) ?? 'free',
    trialUsed: (data?.trial_used as boolean) ?? false,
    trialStart: (data?.trial_start as string | null) ?? null,
    trialEnd: (data?.trial_end as string | null) ?? null,
    proUntil,
    isProActive,
    productLimit: isProActive ? PRO_PRODUCT_LIMIT : FREE_PRODUCT_LIMIT,
  };
}

export async function fetchActiveProductCount(shopId: string): Promise<number> {
  const { count } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .eq('status', 'active');
  return count ?? 0;
}

export interface SubscriptionPaymentRow {
  id: string;
  amount: number;
  method: SubscriptionPaymentMethod;
  reference: string;
  status: SubscriptionPaymentStatus;
  requestedAt: string;
  reviewedAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}

export async function fetchSubscriptionPayments(shopId: string): Promise<SubscriptionPaymentRow[]> {
  const { data } = await supabase
    .from('subscription_payments')
    .select('id, amount, payment_method, reference, status, requested_at, reviewed_at, period_start, period_end')
    .eq('shop_id', shopId)
    .order('requested_at', { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id as string,
    amount: r.amount as number,
    method: r.payment_method as SubscriptionPaymentMethod,
    reference: r.reference as string,
    status: r.status as SubscriptionPaymentStatus,
    requestedAt: r.requested_at as string,
    reviewedAt: (r.reviewed_at as string | null) ?? null,
    periodStart: (r.period_start as string | null) ?? null,
    periodEnd: (r.period_end as string | null) ?? null,
  }));
}

// Never activates anything itself — just records the seller's declared
// payment reference as "pending_review". A migration-side trigger notifies
// admins on insert; an admin manually verifies the reference against their
// own Wave/Orange Money account and confirms or rejects via RPC.
export async function submitSubscriptionPayment(
  shopId: string,
  method: SubscriptionPaymentMethod,
  reference: string
): Promise<{ error?: string }> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { error: 'Session expirée. Reconnectez-vous.' };

  const { error } = await supabase.from('subscription_payments').insert({
    shop_id: shopId,
    payment_method: method,
    reference: reference.trim(),
    requested_by: userId,
  });
  return error ? { error: error.message } : {};
}
