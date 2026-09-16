import { supabase } from './supabaseClient';

// Location read/write for the seller's own real Supabase shop row. Kept
// separate from the mock `sellerShop` state in ProContext (which never
// reflects real shops.* data) — this talks to shops.latitude/longitude
// directly, scoped to the shop the authenticated seller owns.

export interface ShopLocation {
  latitude: number | null;
  longitude: number | null;
}

export async function fetchShopLocation(shopId: string): Promise<ShopLocation | null> {
  const { data, error } = await supabase.from('shops').select('latitude, longitude').eq('id', shopId).maybeSingle();
  if (error || !data) return null;
  return {
    latitude: (data.latitude as number | null) ?? null,
    longitude: (data.longitude as number | null) ?? null,
  };
}

export async function updateShopLocation(shopId: string, latitude: number, longitude: number): Promise<{ error?: string }> {
  const { error } = await supabase.from('shops').update({ latitude, longitude }).eq('id', shopId);
  if (error) return { error: `Impossible d'enregistrer la localisation : ${error.message}` };
  return {};
}
