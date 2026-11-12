import { supabase } from './supabaseClient';
import {
  FREE_PRODUCT_LIMIT, PREMIUM_PRODUCT_LIMIT, FREE_COMMISSION_PERCENT, PREMIUM_COMMISSION_PERCENT,
  PLUS_PLAN_NAME, PLUS_BILLING, BILLING_PERIOD_LABEL, TRIAL_DAYS, formatFcfa, type BillingPeriod,
} from '@/data/subscriptionPlans';

// Real seller subscription state, backed by the seller_subscriptions /
// subscription_payments tables. Paid activation only ever happens through
// confirm_subscription_payment(), server-side; no payment gateway is wired
// yet (see SellerSubscriptionPayment.tsx).
export { FREE_PRODUCT_LIMIT, PREMIUM_PRODUCT_LIMIT, FREE_COMMISSION_PERCENT, PREMIUM_COMMISSION_PERCENT };

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
  // Set once, forever, by confirm_subscription_payment() on the first real
  // payment — never cleared by an expiry or a plan read. Once true, this
  // seller can never be offered "Continuer gratuitement" again.
  premiumPaidEver: boolean;
  // plan stays 'pro' forever once premiumPaidEver is true (see
  // process_subscription_expirations) — this is the distinct "Premium
  // expiré, renouvelez" state, never shown as Free.
  isPremiumExpired: boolean;
  // False only for a brand-new shop that has never gone through
  // activate_seller_trial(), confirm_subscription_payment(), or
  // choose_free_plan() — the one reliable, server-side signal that
  // "Choisissez votre formule" still needs to be shown, instead of
  // inferring it from the absence of a row (which also, ambiguously,
  // described an already-chosen Free shop).
  planChosen: boolean;
  // The official Ezial shop (shops.is_official) is always Ezial Plus:
  // active, no trial, no expiry, nothing to pay, renew or downgrade. Its
  // product limit is not enforced (enforce_product_limit() skips it), so
  // pages show its product count without a limit.
  isOfficial: boolean;
  // Accès Ezial Plus offert par un administrateur (table premium_grants),
  // seulement quand un don est actif. null sinon — y compris tant que la
  // migration n'est pas exécutée. Un don n'est jamais un essai : isTrialActive
  // reste faux, isProActive vrai, limite et commission sont ceux d'Ezial Plus.
  gift: SellerGiftInfo | null;
}

export interface SellerGiftInfo {
  endsAt: string;
  daysRemaining: number;
  grantedMonths: number;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / (24 * 60 * 60 * 1000)) : 0;
}

// Ezial Plus for good — no row is read for the official shop: its
// seller_subscriptions row (if any) does not describe its plan.
function officialShopSubscription(): SellerSubscriptionInfo {
  return {
    plan: 'pro',
    trialUsed: false,
    trialStart: null,
    trialEnd: null,
    proUntil: null,
    proStartedAt: null,
    isProActive: true,
    isTrialActive: false,
    productLimit: PREMIUM_PRODUCT_LIMIT,
    commissionPercent: PREMIUM_COMMISSION_PERCENT,
    trialDaysRemaining: null,
    proDaysRemaining: null,
    premiumPaidEver: false,
    isPremiumExpired: false,
    planChosen: true,
    isOfficial: true,
    gift: null,
  };
}

// Le don actif de la boutique (le propriétaire peut lire ses propres lignes).
// Requête à part : si la table n'existe pas encore (migration non exécutée)
// ou si la lecture échoue, on ignore silencieusement — comportement actuel.
async function fetchActiveGift(shopId: string): Promise<SellerGiftInfo | null> {
  try {
    const { data, error } = await supabase
      .from('premium_grants')
      .select('granted_months, ends_at, status')
      .eq('shop_id', shopId)
      .eq('status', 'active')
      .order('ends_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const endsAt = data.ends_at as string | null;
    // Le serveur marque le don « expired » avec un léger décalage : une date
    // de fin passée n'est jamais présentée comme un don actif.
    if (!endsAt || new Date(endsAt).getTime() <= Date.now()) return null;
    return { endsAt, daysRemaining: daysUntil(endsAt) ?? 0, grantedMonths: Number(data.granted_months) || 0 };
  } catch {
    return null;
  }
}

// A shop with no seller_subscriptions row at all (not yet activated, or
// activated before this feature existed and never backfilled) is implicitly
// Free with no trial used — mirrors the same coalesce the
// enforce_product_limit() trigger already uses. Pass isOfficial (from
// shops.is_official, i.e. ProContext's sellerShopIsOfficial) to get the
// official shop's permanent Ezial Plus status instead.
export async function fetchSellerSubscription(shopId: string, options: { isOfficial?: boolean } = {}): Promise<SellerSubscriptionInfo> {
  if (options.isOfficial) return officialShopSubscription();

  const [{ data }, gift] = await Promise.all([
    supabase
      .from('seller_subscriptions')
      .select('plan, trial_used, trial_start, trial_end, pro_until, pro_started_at, premium_paid_ever, plan_chosen')
      .eq('shop_id', shopId)
      .maybeSingle(),
    fetchActiveGift(shopId),
  ]);

  const proUntil = (data?.pro_until as string | null) ?? null;
  const trialEnd = (data?.trial_end as string | null) ?? null;
  const plan = (data?.plan as SubscriptionPlan) ?? 'free';
  const premiumPaidEver = (data?.premium_paid_ever as boolean) ?? false;
  const isProActive = (!!proUntil && new Date(proUntil) > new Date()) || gift !== null;
  // A trial is "active" specifically when the current pro_until is the
  // trial's own end date — once a real payment is confirmed, pro_until
  // moves past trial_end (see confirm_subscription_payment), so this
  // naturally stops being true the moment a paid period takes over.
  // A gift is never a trial, even if the dates happen to coincide.
  const isTrialActive = gift === null && isProActive && !!trialEnd && proUntil === trialEnd;
  const isPremiumExpired = plan === 'pro' && !isProActive && premiumPaidEver;

  return {
    plan,
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
    premiumPaidEver,
    isPremiumExpired,
    planChosen: (data?.plan_chosen as boolean) ?? false,
    isOfficial: false,
    gift,
  };
}

// Called when the seller picks "Continuer gratuitement" on "Choisissez
// votre formule" — the only mutation Free itself ever needs (no payment,
// no validation), but it still has to persist server-side that a real
// choice was made, not just silently rely on the absence of a row.
export async function chooseFreePlan(): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('choose_free_plan');
  return error ? { error: error.message } : {};
}

// The seller-initiated trial activation (see Part 4 of the subscription
// spec): server-side eligibility check (trial_used must still be false),
// real 30-day Premium activation, dates recorded — replaces the previous
// automatic grant-on-shop-activation trigger, which left no room for an
// explicit "Activer mes 30 jours gratuits" moment or page.
export async function activateSellerTrial(shopId: string): Promise<{ trialEnd?: string; alreadyUsed?: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('activate_seller_trial', { p_shop_id: shopId });
  // Le serveur refuse l'essai pendant un accès offert ou un abonnement actif
  // avec une erreur P0001 en français : on l'affiche telle quelle.
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

// The amount charged is fixed server-side per billing period, so it alone
// identifies the period; the confirmed period's length is the fallback for
// a row whose amount predates the current prices (the 5 000 FCFA quarterly
// rows from before Ezial Plus).
export function billingPeriodOfPayment(p: Pick<SubscriptionPaymentRow, 'amount' | 'periodStart' | 'periodEnd'>): BillingPeriod {
  if (p.amount === PLUS_BILLING.annual.priceFcfa) return 'annual';
  if (p.periodStart && p.periodEnd) {
    const days = (new Date(p.periodEnd).getTime() - new Date(p.periodStart).getTime()) / (24 * 60 * 60 * 1000);
    if (days > 200) return 'annual';
  }
  return 'quarterly';
}

// The chosen period travels in the Ezial Pro route's query string
// (?periode=trimestriel|annuel), so a refresh of the payment page keeps it.
export function subscriptionPaymentRoute(period: BillingPeriod): string {
  return `/seller/abonnement/paiement?periode=${period === 'annual' ? 'annuel' : 'trimestriel'}`;
}

export function billingPeriodFromQuery(search: string): BillingPeriod {
  return new URLSearchParams(search).get('periode') === 'annuel' ? 'annual' : 'quarterly';
}

export interface CurrentPlanSummary {
  name: string;
  amountLabel: string | null;
  periodLabel: string | null;
  // Billing period of the last paid subscription — the default offered for a renewal.
  billingPeriod: BillingPeriod | null;
  expiresAt: string | null;
  isExpired: boolean;
}

// Formule / montant / périodicité / expiration, as shown on the seller's
// dashboard and "Mon abonnement" — derived from the real subscription row
// and the last confirmed payment.
export function summarizeCurrentPlan(info: SellerSubscriptionInfo, payments: SubscriptionPaymentRow[]): CurrentPlanSummary {
  if (info.isOfficial) {
    return { name: `${PLUS_PLAN_NAME} — boutique officielle`, amountLabel: null, periodLabel: null, billingPeriod: null, expiresAt: null, isExpired: false };
  }

  if (info.gift) {
    return { name: `Accès ${PLUS_PLAN_NAME} offert`, amountLabel: 'Offert', periodLabel: null, billingPeriod: null, expiresAt: info.gift.endsAt, isExpired: false };
  }

  const lastConfirmed = payments.find((p) => p.status === 'confirmed') ?? null;
  const billingPeriod = lastConfirmed ? billingPeriodOfPayment(lastConfirmed) : null;

  if (info.isTrialActive) {
    return { name: `Essai ${PLUS_PLAN_NAME}`, amountLabel: 'Gratuit', periodLabel: `Essai de ${TRIAL_DAYS} jours`, billingPeriod, expiresAt: info.proUntil, isExpired: false };
  }
  if (info.isProActive || info.isPremiumExpired) {
    return {
      name: info.isPremiumExpired ? `${PLUS_PLAN_NAME} expiré` : PLUS_PLAN_NAME,
      amountLabel: lastConfirmed ? formatFcfa(lastConfirmed.amount) : null,
      periodLabel: billingPeriod ? `${BILLING_PERIOD_LABEL[billingPeriod]} (${PLUS_BILLING[billingPeriod].months} mois)` : null,
      billingPeriod,
      expiresAt: info.proUntil,
      isExpired: info.isPremiumExpired,
    };
  }
  return { name: 'Ezial Free', amountLabel: 'Gratuit', periodLabel: 'Sans limite de durée', billingPeriod, expiresAt: null, isExpired: false };
}

// submitSubscriptionPayment() (the seller-declared-reference, manual-admin-
// review submission) is retired: SellerSubscriptionPayment.tsx now shows
// "paiement en ligne temporairement indisponible" instead of taking a
// reference. fetchSubscriptionPayments()/confirmSubscriptionPayment() below
// still let an admin see and resolve whatever was already pending_review
// before this change.

// ---- Résiliation ----------------------------------------------------------
// La date de résiliation est lue dans une requête à part : si la colonne
// n'existe pas encore (migration de résiliation pas encore exécutée), la
// lecture de l'abonnement ci-dessus n'est pas affectée et la résiliation
// est simplement présentée comme indisponible (supported = false).
export interface CancellationState { supported: boolean; requestedAt: string | null }

export async function fetchCancellationState(shopId: string): Promise<CancellationState> {
  const { data, error } = await supabase
    .from('seller_subscriptions')
    .select('cancel_requested_at')
    .eq('shop_id', shopId)
    .maybeSingle();
  if (error) return { supported: false, requestedAt: null };
  return { supported: true, requestedAt: (data?.cancel_requested_at as string | null) ?? null };
}

// Résilier n'est jamais remboursé : l'abonnement reste actif jusqu'à la date
// de fin renvoyée (le serveur est l'autorité, voir cancel_seller_subscription).
export async function cancelSellerSubscription(): Promise<{ endsAt?: string; error?: string }> {
  const { data, error } = await supabase.rpc('cancel_seller_subscription');
  if (error) return { error: error.code === 'P0001' ? error.message : 'La résiliation n’a pas pu être enregistrée. Réessayez dans un instant.' };
  return { endsAt: data as string };
}

export async function resumeSellerSubscription(): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('resume_seller_subscription');
  if (error) return { error: error.code === 'P0001' ? error.message : 'L’annulation de la résiliation n’a pas pu être enregistrée. Réessayez dans un instant.' };
  return {};
}
