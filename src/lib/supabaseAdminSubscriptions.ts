import { supabase } from './supabaseClient';
import type { SubscriptionPaymentMethod, SubscriptionPaymentStatus } from './supabaseSellerSubscription';

// Admin-side view of seller subscription requests. No payment gateway exists
// in Ezial yet, so every request is manually verified by an admin against
// their own Wave/Orange Money account before confirm_subscription_payment()
// or reject_subscription_payment() is called — both SECURITY DEFINER RPCs,
// gated the same way notify_admins() already gates admin-only writes.

export interface AdminSubscriptionPaymentRow {
  id: string;
  shopId: string;
  shopName: string;
  amount: number;
  method: SubscriptionPaymentMethod;
  reference: string;
  status: SubscriptionPaymentStatus;
  requestedAt: string;
  reviewedAt: string | null;
}

export async function fetchSubscriptionPayments(): Promise<AdminSubscriptionPaymentRow[]> {
  const { data: rows } = await supabase
    .from('subscription_payments')
    .select('id, shop_id, amount, payment_method, reference, status, requested_at, reviewed_at')
    .order('requested_at', { ascending: false });
  if (!rows || rows.length === 0) return [];

  const shopIds = [...new Set(rows.map((r) => r.shop_id as string))];
  const { data: shopRows } = await supabase.from('shops').select('id, name').in('id', shopIds);
  const nameById = new Map((shopRows ?? []).map((s) => [s.id as string, s.name as string]));

  return rows.map((r) => ({
    id: r.id as string,
    shopId: r.shop_id as string,
    shopName: nameById.get(r.shop_id as string) ?? 'Boutique',
    amount: r.amount as number,
    method: r.payment_method as SubscriptionPaymentMethod,
    reference: r.reference as string,
    status: r.status as SubscriptionPaymentStatus,
    requestedAt: r.requested_at as string,
    reviewedAt: (r.reviewed_at as string | null) ?? null,
  }));
}

export async function confirmSubscriptionPayment(paymentId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('confirm_subscription_payment', { p_payment_id: paymentId });
  return error ? { error: error.message } : {};
}

export async function rejectSubscriptionPayment(paymentId: string, reason: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('reject_subscription_payment', { p_payment_id: paymentId, p_reason: reason || null });
  return error ? { error: error.message } : {};
}
