export type BillingPeriod = 'quarterly' | 'annual';

export const FREE_PRODUCT_LIMIT: number;
export const PREMIUM_PRODUCT_LIMIT: number;
export const FREE_COMMISSION_PERCENT: number;
export const PREMIUM_COMMISSION_PERCENT: number;
export const TRIAL_DAYS: number;
export const FREE_AD_PRODUCTS_LABEL: string;
export const PLUS_AD_PRODUCTS_LABEL: string;
export const PLUS_PLAN_NAME: string;
export const PLUS_BILLING: Record<BillingPeriod, { priceFcfa: number; months: number }>;
export const PLUS_ANNUAL_REFERENCE_PRICE_FCFA: number;
export const PLUS_ANNUAL_SAVINGS_FCFA: number;
export const PLUS_ANNUAL_DISCOUNT_PERCENT: number;
export function formatFcfa(amount: number): string;

export const FREE_BENEFITS: string[];
export interface PlusHighlight { id: 'products' | 'commission' | 'ads' | 'editorial'; value: string; title: string; text: string; note?: string }
export const PLUS_HIGHLIGHTS: PlusHighlight[];
export const PLUS_BENEFITS: string[];
export interface PlanComparisonRow { label: string; free: string | boolean; plus: string | boolean }
export const PLAN_COMPARISON: PlanComparisonRow[];
export const PLUS_SAME_BENEFITS_NOTE: string;
export const TRIAL_RULES: string;
export const TRIAL_PRELAUNCH_NOTE: string;
export const PLAN_END_RULES: string;
