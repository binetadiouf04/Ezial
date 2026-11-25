import { supabase } from './supabaseClient';
import { isRpcMissing } from './supabaseFeatureDetect';
import { REFUND_METHOD_LABELS, mapRefund, cancelReasonLabels, type RefundMethod, type RefundRow, type RawRefund } from './sellerCancelCore';

// Remboursements à effectuer après l'annulation d'une part de commande par sa boutique
// (docs/sql/vendeur-annulation.sql). Aucun remboursement automatique, aucune API de paiement : l'administratrice
// rembourse depuis Orange Money / Wave, puis note ici date, moyen et référence. Tant que la migration n'est pas
// exécutée, rien n'est affiché (supported: false).

export { REFUND_METHOD_LABELS, mapRefund, type RefundMethod, type RefundRow, type RawRefund };
export const CANCEL_REASON_LABELS: Record<string, string> = { ...cancelReasonLabels };

export type RefundsResult = { supported: false } | { supported: true; rows: RefundRow[]; error?: string };

export async function fetchRefunds(status: 'to_refund' | 'refunded' | null): Promise<RefundsResult> {
  const { data, error } = await supabase.rpc('admin_refunds_to_make', { p_status: status });
  if (isRpcMissing(error)) return { supported: false };
  if (error) return { supported: true, rows: [], error: error.message || 'Impossible de charger les remboursements.' };
  return { supported: true, rows: ((data ?? []) as RawRefund[]).map(mapRefund) };
}

export async function markRefunded(id: string, method: RefundMethod, reference: string, note: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('admin_mark_refunded', {
    p_id: id, p_method: method, p_reference: reference.trim() || null, p_note: note.trim() || null,
  });
  return error ? { error: error.message || 'Impossible d’enregistrer le remboursement.' } : {};
}

export interface ShopCancellationStats { last30Days: number; total: number; lastCancelledAt: string | null }

/** Annulations par boutique (vendeur) : 30 derniers jours et total. Fonction absente ou erreur : null (rien n'est affiché). */
export async function fetchShopCancellationStats(): Promise<Map<string, ShopCancellationStats> | null> {
  const { data, error } = await supabase.rpc('admin_shop_cancellation_stats');
  if (error || !data) return null;
  const map = new Map<string, ShopCancellationStats>();
  for (const r of data as { shop_id: string; last_30_days: number; total: number; last_cancelled_at: string | null }[]) {
    map.set(r.shop_id, { last30Days: r.last_30_days, total: r.total, lastCancelledAt: r.last_cancelled_at });
  }
  return map;
}
