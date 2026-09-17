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

// Shop onboarding — real Supabase-backed "Configurer ma boutique" data,
// replacing the mock-only ShopEdit state ProContext used to keep this in
// (name/description/etc were never actually persisted before this
// feature). status is intentionally read-only here — see
// submitShopForReview(); it's the one and only way a seller can move their
// own shop forward, and it can never reach 'active' from the client side
// (an admin-only UPDATE + a safety trigger both enforce that server-side).
export type ShopWorkflowStatus = 'draft' | 'pending' | 'active' | 'suspended' | 'rejected';

export interface ShopOnboardingData {
  name: string;
  description: string;
  phone: string;
  addressText: string;
  neighborhood: string;
  logoUrl: string;
  coverUrl: string;
  categoryFocus: string;
  pickupEnabled: boolean;
  status: ShopWorkflowStatus;
  latitude: number | null;
  longitude: number | null;
}

export async function fetchShopOnboarding(shopId: string): Promise<ShopOnboardingData | null> {
  const { data, error } = await supabase.from('shops').select('*').eq('id', shopId).maybeSingle();
  if (error || !data) return null;
  return {
    name: (data.name as string) ?? '',
    description: (data.description as string) ?? '',
    phone: (data.phone as string) ?? '',
    addressText: (data.address_text as string) ?? '',
    neighborhood: (data.neighborhood as string) ?? '',
    logoUrl: (data.logo_url as string) ?? '',
    coverUrl: (data.cover_url as string) ?? '',
    categoryFocus: (data.category_focus as string) ?? '',
    pickupEnabled: Boolean(data.pickup_enabled),
    status: ((data.status as ShopWorkflowStatus) ?? 'draft'),
    latitude: (data.latitude as number | null) ?? null,
    longitude: (data.longitude as number | null) ?? null,
  };
}

export interface UpdateShopOnboardingInput {
  name: string;
  description: string;
  phone: string;
  addressText: string;
  neighborhood: string;
  logoUrl: string;
  coverUrl: string;
  categoryFocus: string;
  pickupEnabled: boolean;
}

// Never writes `status` — only submitShopForReview() (and the admin
// approve/refuse/suspend actions) can move it.
export async function updateShopOnboarding(shopId: string, input: UpdateShopOnboardingInput): Promise<{ error?: string }> {
  const { error } = await supabase.from('shops').update({
    name: input.name.trim(),
    description: input.description.trim(),
    phone: input.phone.trim(),
    address_text: input.addressText.trim(),
    neighborhood: input.neighborhood || null,
    logo_url: input.logoUrl || null,
    cover_url: input.coverUrl || null,
    category_focus: input.categoryFocus || null,
    pickup_enabled: input.pickupEnabled,
  }).eq('id', shopId);
  if (error) return { error: `Impossible d'enregistrer la boutique : ${error.message}` };
  return {};
}

// The only client-side path from 'draft'/'rejected' to 'pending' — a plain
// RLS UPDATE policy on shops (rather than a full RPC) would let a seller
// set any status value, so this goes through a security-definer RPC that
// only ever performs that one specific, safe transition on the caller's
// own shop. See the migration this feature ships with.
export async function submitShopForReview(): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('submit_shop_for_review');
  return error ? { error: error.message } : {};
}

const SHOP_ASSETS_BUCKET = 'product-images';

export async function uploadShopAsset(shopId: string, kind: 'logo' | 'cover', file: File): Promise<{ url?: string; error?: string }> {
  const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
  const path = `shops/${shopId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(SHOP_ASSETS_BUCKET).upload(path, file);
  if (error) return { error: `Envoi impossible : ${error.message}` };
  const { data } = supabase.storage.from(SHOP_ASSETS_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}
