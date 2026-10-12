import { supabase } from './supabaseClient';
import { resolveImageUrl } from './supabaseCatalog';
import type { ClaimType, ClaimStatus, DesiredSolution } from './supabaseClaims';

// Seller-side view of public.order_claims — RLS (order_claims_select_seller)
// already scopes this to claims on the signed-in seller's own shop only;
// this file never adds its own shop filter, it just reads whatever RLS
// already allows. Sellers can only ever add a response, never change
// claim.status or see another shop's claims — seller_respond_to_claim()
// enforces that server-side too, not just here.

export interface SellerClaim {
  id: string;
  orderId: string;
  orderNumber: string;
  claimType: ClaimType;
  motif: string;
  desiredSolution: DesiredSolution;
  details: string | null;
  photoUrls: string[];
  status: ClaimStatus;
  sellerResponse: string | null;
  refusalReason: string | null;
  createdAt: string;
}

function mapRow(row: Record<string, unknown>): SellerClaim {
  const photoPaths = (row.photo_paths as string[] | null) ?? [];
  const order = row.orders as { order_number?: string } | null;
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    orderNumber: order?.order_number ?? '',
    claimType: row.claim_type as ClaimType,
    motif: row.motif as string,
    desiredSolution: row.desired_solution as DesiredSolution,
    details: (row.details as string | null) ?? null,
    photoUrls: photoPaths.map(resolveImageUrl),
    status: row.status as ClaimStatus,
    sellerResponse: (row.seller_response as string | null) ?? null,
    refusalReason: (row.refusal_reason as string | null) ?? null,
    createdAt: (row.created_at as string) ?? '',
  };
}

export async function fetchSellerClaims(): Promise<SellerClaim[]> {
  const { data, error } = await supabase
    .from('order_claims')
    .select('*, orders(order_number)')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map(mapRow);
}

export async function fetchSellerClaimDetail(claimId: string): Promise<SellerClaim | null> {
  const { data, error } = await supabase
    .from('order_claims')
    .select('*, orders(order_number)')
    .eq('id', claimId)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

export async function sellerRespondToClaim(claimId: string, response: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('seller_respond_to_claim', { p_claim_id: claimId, p_response: response });
  return error ? { error: error.message } : {};
}
