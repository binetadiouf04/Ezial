import { supabase } from './supabaseClient';
import { FREE_PRODUCT_LIMIT, PREMIUM_PRODUCT_LIMIT, PREMIUM_PRICE_FCFA, FREE_COMMISSION_PERCENT, PREMIUM_COMMISSION_PERCENT } from '@/data/subscriptionPlans';

// Real seller subscription state, backed by the seller_subscriptions /
// subscription_payments tables. No payment gateway exists anywhere in
// Ezial yet, so activation/renewal is declarative: the seller submits
// their own Wave/Orange Money reference, an admin manually verifies it
// against their own account and confirms via the
// confirm_subscription_payment() RPC.
export { FREE_PRODUCT_LIMIT, PREMIUM_PRODUCT_LIMIT, PREMIUM_PRICE_FCFA, FREE_COMMISSION_PERCENT, PREMIUM_COMMISSION_PERCENT };

export type SubscriptionPlan = 'free' | 'pro';
export type SubscriptionPaymentMethod = 'wave' | 'orange_money';
export type SubscriptionPaymentStatus = 'pending_review' | 'confirmed' | 'rejected';

export interface SellerSubscriptionInfo {
  plan: SubscriptionPlan;
  trialUsed: boolean;
  trialStart: string | null;
  trialEnd: string | null;
  proUntil: string | null;
  proStartedAt: string | null;
  // True while Pro access (trial or paid) is currently in effect — the
  // stored `plan` column can lag one day behind `pro_until` until the
  // daily cron job runs, so this is the field the UI should actually read.
  isProActive: boolean;
  // Distinguishes an active trial from active paid Premium — both make
  // isProActive true, but the UI (and eligibility for a fresh trial)
  // needs to tell them apart.
  isTrialActive: boolean;
  productLimit: number;
  commissionPercent: number;
  trialDaysRemaining: number | null;
  proDaysRemaining: number | null;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / (24 * 60 * 60 * 1000)) : 0;
}

// A shop with no seller_subscriptions row at all (not yet activated, or
// activated before this feature existed and never backfilled) is implicitly
// Free with no trial used — mirrors the same coalesce the
// enforce_product_limit() trigger already uses.
export async function fetchSellerSubscription(shopId: string): Promise<SellerSubscriptionInfo> {
  const { data } = await supabase
    .from('seller_subscriptions')
    .select('plan, trial_used, trial_start, trial_end, pro_until, pro_started_at')
    .eq('shop_id', shopId)
    .maybeSingle();

  const proUntil = (data?.pro_until as string | null) ?? null;
  const trialEnd = (data?.trial_end as string | null) ?? null;
  const isProActive = !!proUntil && new Date(proUntil) > new Date();
  // A trial is "active" specifically when the current pro_until is the
  // trial's own end date — once a real payment is confirmed, pro_until
  // moves past trial_end (see confirm_subscription_payment), so this
  // naturally stops being true the moment a paid period takes over.
  const isTrialActive = isProActive && !!trialEnd && proUntil === trialEnd;

  return {
    plan: (data?.plan as SubscriptionPlan) ?? 'free',
    trialUsed: (data?.trial_used as boolean) ?? false,
    trialStart: (data?.trial_start as string | null) ?? null,
    trialEnd,
    proUntil,
    proStartedAt: (data?.pro_started_at as string | null) ?? null,
    isProActive,
    isTrialActive,
    productLimit: isProActive ? PREMIUM_PRODUCT_LIMIT : FREE_PRODUCT_LIMIT,
    commissionPercent: isProActive ? PREMIUM_COMMISSION_PERCENT : FREE_COMMISSION_PERCENT,
    trialDaysRemaining: isTrialActive ? daysUntil(proUntil) : null,
    proDaysRemaining: isProActive ? daysUntil(proUntil) : null,
  };
}

// The seller-initiated trial activation (see Part 4 of the subscription
// spec): server-side eligibility check (trial_used must still be false),
// real 30-day Premium activation, dates recorded — replaces the previous
// automatic grant-on-shop-activation trigger, which left no room for an
// explicit "Activer mes 30 jours gratuits" moment or page.
export async function activateSellerTrial(shopId: string): Promise<{ trialEnd?: string; alreadyUsed?: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('activate_seller_trial', { p_shop_id: shopId });
  if (error) return { error: error.message };
  if (data?.alreadyUsed) return { alreadyUsed: true };
  return { trialEnd: data?.trialEnd as string | undefined };
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
