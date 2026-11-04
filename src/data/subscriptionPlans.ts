// Single source of truth for Ezial's two seller plans — shared by the
// pricing cards, the seller subscription data layer, and anywhere else that
// needs to display or reason about these numbers. Keeping them in one place
// is what keeps the client-side display and the server-side enforcement
// (enforce_product_limit(), create_order()'s commission calc) from ever
// silently drifting apart.
export const FREE_PRODUCT_LIMIT = 10;
export const PREMIUM_PRODUCT_LIMIT = 30;
export const PREMIUM_PRICE_FCFA = 5000;
export const FREE_COMMISSION_PERCENT = 10;
export const PREMIUM_COMMISSION_PERCENT = 8;
