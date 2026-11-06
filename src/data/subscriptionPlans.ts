// Ezial's two seller plans. The numbers and sales texts live in
// src/shared/plans.js (plain JavaScript, also read by the static SEO build);
// this module re-exports them for the React code and adds UI-only labels.
//
// Commission: one flat rate per plan on every sale — 10 % Free, 8 % Ezial
// Plus (trial or paid) — identical when the seller runs a promotion. There
// is no other rate (the old 5 % "promotion > 10 %" rule is gone for good).
import type { BillingPeriod } from '@/shared/plans';

export * from '@/shared/plans';

export const BILLING_PERIOD_LABEL: Record<BillingPeriod, string> = {
  quarterly: 'Trimestrielle',
  annual: 'Annuelle',
};
