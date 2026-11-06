// Single source of truth for Ezial's two seller plans — shared by the
// pricing cards, the seller subscription data layer, and anywhere else that
// needs to display or reason about these numbers. Keeping them in one place
// is what keeps the client-side display and the server-side enforcement
// (enforce_product_limit(), create_order()'s commission calc) from ever
// silently drifting apart.
//
// The paid plan is shown to users as "Ezial Plus"; its technical id stays
// 'pro' in the database and PREMIUM_* in code, unchanged for compatibility.
export const FREE_PRODUCT_LIMIT = 10;
export const PREMIUM_PRODUCT_LIMIT = 30;
export const FREE_COMMISSION_PERCENT = 10;
export const PREMIUM_COMMISSION_PERCENT = 8;

export const PLUS_PLAN_NAME = 'Ezial Plus';

export type BillingPeriod = 'quarterly' | 'annual';

// Display only — the amount actually charged is decided server-side by
// public.subscription_plan_price(), which must hold these same values.
export const PLUS_BILLING: Record<BillingPeriod, { priceFcfa: number; months: number }> = {
  quarterly: { priceFcfa: 6000, months: 3 },
  annual: { priceFcfa: 20000, months: 12 },
};
export const PLUS_ANNUAL_REFERENCE_PRICE_FCFA = PLUS_BILLING.quarterly.priceFcfa * 4;
export const PLUS_ANNUAL_SAVINGS_FCFA = PLUS_ANNUAL_REFERENCE_PRICE_FCFA - PLUS_BILLING.annual.priceFcfa;
export const PLUS_ANNUAL_DISCOUNT_PERCENT = Math.round((PLUS_ANNUAL_SAVINGS_FCFA / PLUS_ANNUAL_REFERENCE_PRICE_FCFA) * 100);

export const BILLING_PERIOD_LABEL: Record<BillingPeriod, string> = {
  quarterly: 'Trimestrielle',
  annual: 'Annuelle',
};

export function formatFcfa(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} FCFA`;
}
