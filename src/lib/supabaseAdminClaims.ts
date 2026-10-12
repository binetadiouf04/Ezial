import { supabase } from './supabaseClient';
import { resolveImageUrl } from './supabaseCatalog';
import type { ClaimType, ClaimStatus, DesiredSolution } from './supabaseClaims';

// Admin-side view of public.order_claims — full visibility (RLS:
// order_claims_select_admin), writes only through admin_update_claim_status()
// (see the migration), never a direct table update.

export interface AdminClaim {
  id: string;
  orderId: string;
  orderNumber: string;
  shopId: string;
  shopName: string;
  claimType: ClaimType;
  motif: string;
  desiredSolution: DesiredSolution;
  details: string | null;
  photoUrls: string[];
  status: ClaimStatus;
  refusalReason: string | null;
  refundAmount: number | null;
  sellerResponse: string | null;
  receptionDate: string | null;
  receptionDateIsEstimate: boolean;
  approvedAt: string | null;
  createdAt: string;
}

function mapAdminClaimRow(row: Record<string, unknown>): AdminClaim {
  const photoPaths = (row.photo_paths as string[] | null) ?? [];
  const order = row.orders as { order_number?: string } | null;
  const shop = row.shops as { name?: string } | null;
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    orderNumber: order?.order_number ?? '',
    shopId: row.shop_id as string,
    shopName: shop?.name ?? 'Boutique',
    claimType: row.claim_type as ClaimType,
    motif: row.motif as string,
    desiredSolution: row.desired_solution as DesiredSolution,
    details: (row.details as string | null) ?? null,
    photoUrls: photoPaths.map(resolveImageUrl),
    status: row.status as ClaimStatus,
    refusalReason: (row.refusal_reason as string | null) ?? null,
    refundAmount: (row.refund_amount as number | null) ?? null,
    sellerResponse: (row.seller_response as string | null) ?? null,
    receptionDate: (row.reception_date as string | null) ?? null,
    receptionDateIsEstimate: Boolean(row.reception_date_is_estimate),
    approvedAt: (row.approved_at as string | null) ?? null,
    createdAt: (row.created_at as string) ?? '',
  };
}

export async function fetchAdminClaims(): Promise<AdminClaim[]> {
  const { data, error } = await supabase
    .from('order_claims')
    .select('*, orders(order_number), shops(name)')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map(mapAdminClaimRow);
}

export async function fetchAdminClaimDetail(claimId: string): Promise<AdminClaim | null> {
  const { data, error } = await supabase
    .from('order_claims')
    .select('*, orders(order_number), shops(name)')
    .eq('id', claimId)
    .maybeSingle();
  if (error || !data) return null;
  return mapAdminClaimRow(data);
}

export interface ClaimEvent {
  id: string;
  oldStatus: string | null;
  newStatus: string;
  note: string | null;
  changedByRole: 'customer' | 'seller' | 'admin';
  createdAt: string;
}

export async function fetchClaimEvents(claimId: string): Promise<ClaimEvent[]> {
  const { data, error } = await supabase
    .from('order_claim_events')
    .select('*')
    .eq('claim_id', claimId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    oldStatus: (row.old_status as string | null) ?? null,
    newStatus: row.new_status as string,
    note: (row.note as string | null) ?? null,
    changedByRole: row.changed_by_role as 'customer' | 'seller' | 'admin',
    createdAt: (row.created_at as string) ?? '',
  }));
}

export async function adminUpdateClaimStatus(
  claimId: string,
  newStatus: ClaimStatus,
  note?: string,
  refusalReason?: string,
  refundAmount?: number,
): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('admin_update_claim_status', {
    p_claim_id: claimId,
    p_new_status: newStatus,
    p_note: note?.trim() || null,
    p_refusal_reason: refusalReason?.trim() || null,
    p_refund_amount: refundAmount ?? null,
  });
  return error ? { error: error.message } : {};
}
