import { supabase } from './supabaseClient';
import { optimizeImageFile } from '@/utils/imageOptimize';
import { uploadSecurePhoto, resolveSecurePhotoUrls } from './secureStorage';

// Real Supabase-backed claims/returns/refunds (public.order_claims /
// order_claim_events) — every write goes through a SECURITY DEFINER RPC
// (create_order_claim / seller_respond_to_claim / admin_update_claim_status),
// never a direct table insert/update, by design (see the migration).

export type ClaimType = 'retour_echange' | 'probleme';
export type DesiredSolution = 'remboursement' | 'echange' | 'autre';
export type ClaimStatus = 'demande_recue' | 'en_cours_examen' | 'approuvee' | 'en_cours_paiement' | 'remboursee' | 'refusee';

export const claimStatusLabels: Record<ClaimStatus, string> = {
  demande_recue: 'Demande reçue',
  en_cours_examen: "En cours d'examen",
  approuvee: 'Approuvée',
  en_cours_paiement: 'Remboursement en cours',
  remboursee: 'Remboursée',
  refusee: 'Refusée',
};

const CLAIM_PHOTOS_MAX_DIMENSION = 1280;

async function uploadClaimPhotos(customerId: string, files: File[]): Promise<string[]> {
  const paths: string[] = [];
  const token = Math.random().toString(36).slice(2, 8);
  for (let i = 0; i < files.length; i++) {
    const optimized = await optimizeImageFile(files[i], CLAIM_PHOTOS_MAX_DIMENSION);
    const path = `${customerId}/claims/${token}-${i}.webp`;
    const { error } = await uploadSecurePhoto(path, optimized);
    if (error) throw new Error(`Envoi de la photo impossible : ${error}`);
    paths.push(path);
  }
  return paths;
}

export interface CreateClaimInput {
  customerId: string;
  orderShopId: string;
  orderItemId?: string | null;
  claimType: ClaimType;
  motif: string;
  desiredSolution: DesiredSolution;
  details?: string;
  photos?: File[];
  customerReceptionDate?: string | null;
}

export async function createOrderClaim(input: CreateClaimInput): Promise<{ claimId?: string; error?: string; needsReceptionDate?: boolean }> {
  let photoPaths: string[] | null = null;
  if (input.photos && input.photos.length > 0) {
    try {
      photoPaths = await uploadClaimPhotos(input.customerId, input.photos);
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Envoi des photos impossible.' };
    }
  }

  const { data, error } = await supabase.rpc('create_order_claim', {
    p_order_shop_id: input.orderShopId,
    p_order_item_id: input.orderItemId ?? null,
    p_claim_type: input.claimType,
    p_motif: input.motif,
    p_desired_solution: input.desiredSolution,
    p_details: input.details?.trim() || null,
    p_photo_paths: photoPaths,
    p_customer_reception_date: input.customerReceptionDate ?? null,
  });

  if (error) {
    if (error.message.includes('reception_date_required')) return { needsReceptionDate: true };
    return { error: error.message };
  }
  return { claimId: data as string };
}

export interface CustomerClaim {
  id: string;
  orderId: string;
  orderShopId: string;
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
  createdAt: string;
}

async function mapClaimRow(row: Record<string, unknown>): Promise<CustomerClaim> {
  const photoPaths = (row.photo_paths as string[] | null) ?? [];
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    orderShopId: row.order_shop_id as string,
    claimType: row.claim_type as ClaimType,
    motif: row.motif as string,
    desiredSolution: row.desired_solution as DesiredSolution,
    details: (row.details as string | null) ?? null,
    photoUrls: await resolveSecurePhotoUrls(photoPaths),
    status: row.status as ClaimStatus,
    refusalReason: (row.refusal_reason as string | null) ?? null,
    refundAmount: (row.refund_amount as number | null) ?? null,
    sellerResponse: (row.seller_response as string | null) ?? null,
    receptionDate: (row.reception_date as string | null) ?? null,
    receptionDateIsEstimate: Boolean(row.reception_date_is_estimate),
    createdAt: (row.created_at as string) ?? '',
  };
}

export async function fetchCustomerClaimsForOrder(orderId: string): Promise<CustomerClaim[]> {
  const { data, error } = await supabase
    .from('order_claims')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return Promise.all(data.map(mapClaimRow));
}
