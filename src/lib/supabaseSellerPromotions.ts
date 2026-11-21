import { supabase } from './supabaseClient';
import { isModuleMissing, isRpcMissing } from './supabaseFeatureDetect';

// Compensations « promotion Ezial » d'une boutique (contrat :
// docs/promotions/contrat-phase1.md). Ezial finance les réductions des
// campagnes : la part rattachée à la boutique est retirée de son solde
// automatique puis reversée manuellement par l'administratrice. Lecture seule,
// via seller_promotion_compensations(p_shop_id) (sa boutique uniquement) :
// [{ id, order_number, amount, status, paid_at, paid_method, created_at }].

export type SellerCompensationStatus = 'due' | 'paid' | 'cancelled';

export interface SellerCompensation {
  id: string;
  orderNumber: string | null;
  amount: number;
  status: SellerCompensationStatus;
  paidAt: string | null;
  paidMethod: string | null;
  createdAt: string | null;
}

export type SellerCompensationsResult =
  | { supported: false }
  | { supported: true; items: SellerCompensation[]; error?: string };

export async function fetchSellerPromotionCompensations(shopId: string): Promise<SellerCompensationsResult> {
  const { data, error } = await supabase.rpc('seller_promotion_compensations', { p_shop_id: shopId });
  if (error) {
    if (isRpcMissing(error) || isModuleMissing(error)) return { supported: false };
    return { supported: true, items: [], error: 'Impossible de charger les compensations promotion.' };
  }
  const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  return {
    supported: true,
    items: rows.map((r) => ({
      id: String(r.id),
      orderNumber: typeof r.order_number === 'string' ? r.order_number : null,
      amount: Number(r.amount) || 0,
      status: (r.status as SellerCompensationStatus) ?? 'due',
      paidAt: typeof r.paid_at === 'string' ? r.paid_at : null,
      paidMethod: typeof r.paid_method === 'string' ? r.paid_method : null,
      createdAt: typeof r.created_at === 'string' ? r.created_at : null,
    })),
  };
}
