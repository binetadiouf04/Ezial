import { supabase } from './supabaseClient';

// Customer-facing shop reports (public.shop_reports) — distinct from
// moderation_flags (admin -> seller, seller-visible) on purpose: a report
// here must never be visible to the reported shop's seller, only to
// admins. Creating one never changes the shop's status by itself; an
// admin reviews it and decides (see "Désactiver la boutique" separately).

export type ShopReportReason = 'contrefait' | 'trompeur' | 'comportement' | 'autre';

export async function createShopReport(shopId: string, reason: ShopReportReason, details: string): Promise<{ error?: string }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { error: 'Connectez-vous pour signaler une boutique.' };
  const { error } = await supabase.from('shop_reports').insert({
    shop_id: shopId,
    reporter_id: userData.user.id,
    reason,
    details: details.trim() || null,
  });
  return error ? { error: error.message } : {};
}

export interface AdminShopReport {
  id: string;
  shopId: string;
  reason: ShopReportReason;
  details: string | null;
  createdAt: string;
}

function mapRow(row: Record<string, unknown>): AdminShopReport {
  return {
    id: row.id as string,
    shopId: row.shop_id as string,
    reason: row.reason as ShopReportReason,
    details: (row.details as string | null) ?? null,
    createdAt: (row.created_at as string) ?? '',
  };
}

export async function fetchShopReports(shopId: string): Promise<AdminShopReport[]> {
  const { data, error } = await supabase
    .from('shop_reports')
    .select('*')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map(mapRow);
}
