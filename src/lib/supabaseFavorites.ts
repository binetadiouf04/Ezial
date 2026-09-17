import { supabase } from './supabaseClient';
import { isRealCatalogId } from '@/data/products';

// Favorites for a signed-in customer — public.favorites (see the migration
// this feature ships with), scoped by RLS to `user_id = auth.uid()`. A mock
// demo product's id isn't a real Supabase uuid, so it's never written here
// (isRealCatalogId), exactly like checkout already blocks mock items —
// guests/anyone can still favorite a mock product locally, it just never
// reaches Supabase.

export async function fetchFavoriteIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('favorites').select('product_id').eq('user_id', userId);
  if (error || !data) return [];
  return data.map((r) => r.product_id as string);
}

export async function addFavorite(userId: string, productId: string): Promise<void> {
  if (!isRealCatalogId(productId)) return;
  await supabase.from('favorites').upsert({ user_id: userId, product_id: productId }, { onConflict: 'user_id,product_id' });
}

export async function removeFavorite(userId: string, productId: string): Promise<void> {
  await supabase.from('favorites').delete().eq('user_id', userId).eq('product_id', productId);
}

// Called once right after login/signup — merges whatever was favorited
// locally as a guest into the account's real favorites, without duplicates
// (upsert is idempotent), then the local copy is no longer the source of
// truth (the caller switches to the Supabase-backed list).
export async function mergeLocalFavoritesIntoAccount(userId: string, localIds: string[]): Promise<void> {
  const realIds = localIds.filter(isRealCatalogId);
  if (realIds.length === 0) return;
  await supabase.from('favorites').upsert(
    realIds.map((productId) => ({ user_id: userId, product_id: productId })),
    { onConflict: 'user_id,product_id' },
  );
}
