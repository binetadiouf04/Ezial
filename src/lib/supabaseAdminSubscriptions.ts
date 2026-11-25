import { supabase } from './supabaseClient';
import { isRpcMissing } from './supabaseFeatureDetect';

// Paiements d'abonnement Ezial Plus (administration). Les abonnements sont activés tout seuls à la confirmation d'Orange :
// cette liste sert à SUIVRE (moyen, état) et, pour les cas d'exception seulement (paiement reçu chez Orange / Wave mais non
// rapproché), à confirmer ou refuser à la main, avec la référence de la transaction. Jamais d'espèces.
export type SubscriptionPaymentState = 'confirmed' | 'pending' | 'expired' | 'failed' | 'duplicate' | 'review' | 'replaced';

export interface AdminSubscriptionPayment {
  id: string; kind: 'online' | 'legacy'; shopId: string; shopName: string; provider: 'orange_money' | 'wave';
  billingPeriod: 'quarterly' | 'annual' | 'test_25'; amount: number; state: SubscriptionPaymentState; createdAt: string;
  confirmedAt: string | null; periodEnd: string | null; reference: string | null; failureReason: string | null;
  manual: boolean; canConfirm: boolean; adminNote: string | null;
}

export const PAYMENT_STATE_LABELS: Record<SubscriptionPaymentState, string> = {
  confirmed: 'Confirmé', pending: 'En attente de paiement', expired: 'QR expiré, aucun paiement', failed: 'Non abouti',
  duplicate: 'Double paiement', review: 'À vérifier', replaced: 'QR remplacé',
};
export const PROVIDER_LABELS: Record<string, string> = { orange_money: 'Orange Money', wave: 'Wave' };

type Raw = Record<string, unknown>;
export function mapSubscriptionPayment(r: Raw): AdminSubscriptionPayment {
  return {
    id: String(r.id), kind: r.kind === 'legacy' ? 'legacy' : 'online', shopId: String(r.shop_id ?? ''), shopName: String(r.shop_name ?? ''),
    provider: r.provider === 'wave' ? 'wave' : 'orange_money', billingPeriod: r.billing_period === 'annual' ? 'annual' : r.billing_period === 'test_25' ? 'test_25' : 'quarterly',
    amount: Number(r.amount) || 0, state: (r.state as SubscriptionPaymentState) ?? 'review', createdAt: String(r.created_at ?? ''),
    confirmedAt: (r.confirmed_at as string | null) ?? null, periodEnd: (r.period_end as string | null) ?? null,
    reference: (r.reference as string | null) ?? null, failureReason: (r.failure_reason as string | null) ?? null,
    manual: r.manual === true, canConfirm: r.can_confirm === true, adminNote: (r.admin_note as string | null) ?? null,
  };
}

export type SubscriptionPaymentsResult = { supported: false } | { supported: true; rows: AdminSubscriptionPayment[]; error?: string };

export async function fetchSubscriptionPayments(): Promise<SubscriptionPaymentsResult> {
  const { data, error } = await supabase.rpc('admin_subscription_payments', { p_limit: 200 });
  if (isRpcMissing(error)) return { supported: false };
  if (error) return { supported: true, rows: [], error: error.message || 'Impossible de charger les paiements d’abonnement.' };
  return { supported: true, rows: ((data ?? []) as Raw[]).map(mapSubscriptionPayment) };
}

export async function confirmSubscriptionAttempt(id: string, reference: string, note: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('admin_confirm_subscription_attempt', { p_attempt_id: id, p_reference: reference.trim(), p_note: note.trim() || null });
  return error ? { error: error.message || 'Impossible de confirmer ce paiement.' } : {};
}

export async function rejectSubscriptionAttempt(id: string, reason: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('admin_reject_subscription_attempt', { p_attempt_id: id, p_reason: reason.trim() || null });
  return error ? { error: error.message || 'Impossible de refuser ce paiement.' } : {};
}
