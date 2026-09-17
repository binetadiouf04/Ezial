import { supabase } from './supabaseClient';
import { PRODUCT_IMAGES_BUCKET, resolveImageUrl } from './supabaseCatalog';

// Real Supabase-backed product reviews — public.reviews / review_images
// (see the migration this feature ships with). RLS: published reviews
// (is_hidden = false) are publicly readable; a review is only ever
// created/edited/deleted by its own author (one review per user per
// product — see the unique constraint); admins can hide an abusive one.

export interface ReviewImage {
  id: string;
  url: string;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  comment: string;
  createdAt: string;
  images: ReviewImage[];
  // Best-effort — computed client-side from the reviewer's own order
  // history at fetch time, not stored on the row itself.
  verifiedPurchase: boolean;
}

export interface ReviewStats {
  average: number;
  count: number;
}

interface ReviewRow {
  id: string;
  product_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

interface ReviewImageRow {
  id: string;
  review_id: string;
  storage_path: string;
}

// Bulk stats for many products at once (ProductCard listings) — computed
// client-side from raw ratings rather than a dedicated view/RPC, which is
// plenty at pilot scale (few products, few reviews per product).
export async function fetchReviewStatsForProducts(productIds: string[]): Promise<Map<string, ReviewStats>> {
  const stats = new Map<string, ReviewStats>();
  if (productIds.length === 0) return stats;
  const { data, error } = await supabase.from('reviews').select('product_id, rating').in('product_id', productIds);
  if (error || !data) return stats;
  const byProduct = new Map<string, number[]>();
  for (const row of data as { product_id: string; rating: number }[]) {
    const list = byProduct.get(row.product_id) ?? [];
    list.push(row.rating);
    byProduct.set(row.product_id, list);
  }
  for (const [productId, ratings] of byProduct) {
    stats.set(productId, { average: ratings.reduce((s, r) => s + r, 0) / ratings.length, count: ratings.length });
  }
  return stats;
}

export interface FetchProductReviewsResult {
  reviews: Review[];
  stats: ReviewStats;
  // Whether the CURRENT signed-in user has a delivered/collected purchase
  // of this exact product — the one condition that unlocks the review
  // form. false (never true) when signed out.
  canReview: boolean;
}

export async function fetchProductReviews(productId: string): Promise<FetchProductReviewsResult> {
  // Computed first, before any early return — the very first reviewer of a
  // product would otherwise never have their purchase checked (the old bug
  // here: this ran only when reviews already existed).
  const { data: userData } = await supabase.auth.getUser();
  const currentUserId = userData.user?.id;
  const canReview = currentUserId ? await hasVerifiedPurchase(productId, currentUserId) : false;

  const { data: reviewRows } = await supabase.from('reviews').select('*').eq('product_id', productId).order('created_at', { ascending: false });
  const rows = (reviewRows ?? []) as ReviewRow[];
  if (rows.length === 0) return { reviews: [], stats: { average: 0, count: 0 }, canReview };

  const reviewIds = rows.map((r) => r.id);
  const { data: imageRows } = await supabase.from('review_images').select('*').in('review_id', reviewIds);
  const imagesByReview = new Map<string, ReviewImage[]>();
  for (const img of (imageRows ?? []) as ReviewImageRow[]) {
    const list = imagesByReview.get(img.review_id) ?? [];
    list.push({ id: img.id, url: resolveImageUrl(img.storage_path) });
    imagesByReview.set(img.review_id, list);
  }

  const reviews: Review[] = rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    userId: r.user_id,
    rating: r.rating,
    comment: r.comment ?? '',
    createdAt: r.created_at,
    images: imagesByReview.get(r.id) ?? [],
    verifiedPurchase: r.user_id === currentUserId && canReview,
  }));

  const average = rows.reduce((s, r) => s + r.rating, 0) / rows.length;
  return { reviews, stats: { average, count: rows.length }, canReview };
}

async function hasVerifiedPurchase(productId: string, customerId: string): Promise<boolean> {
  const { data: orderRows } = await supabase.from('orders').select('id').eq('customer_id', customerId);
  const orderIds = (orderRows ?? []).map((o) => o.id as string);
  if (orderIds.length === 0) return false;
  const { data: shopRows } = await supabase.from('order_shops').select('id').in('order_id', orderIds).in('status', ['delivered', 'collected']);
  const orderShopIds = (shopRows ?? []).map((s) => s.id as string);
  if (orderShopIds.length === 0) return false;
  const { count } = await supabase.from('order_items').select('id', { count: 'exact', head: true }).in('order_shop_id', orderShopIds).eq('product_id', productId);
  return (count ?? 0) > 0;
}

export interface SubmitReviewInput {
  productId: string;
  rating: number;
  comment: string;
  photos: File[]; // up to 3 — enforced by the UI, not re-checked here
}

// One review per (product, user) — see the unique constraint. Submitting
// again just replaces the previous review's rating/comment/photos rather
// than creating a second one.
export async function submitReview(userId: string, input: SubmitReviewInput): Promise<{ error?: string }> {
  const { data: existing } = await supabase.from('reviews').select('id').eq('product_id', input.productId).eq('user_id', userId).maybeSingle();

  let reviewId: string;
  if (existing) {
    const { error } = await supabase.from('reviews').update({ rating: input.rating, comment: input.comment.trim() || null, updated_at: new Date().toISOString() }).eq('id', existing.id);
    if (error) return { error: error.message };
    reviewId = existing.id as string;
    await supabase.from('review_images').delete().eq('review_id', reviewId);
  } else {
    const { data, error } = await supabase.from('reviews').insert({ product_id: input.productId, user_id: userId, rating: input.rating, comment: input.comment.trim() || null }).select('id').single();
    if (error || !data) return { error: error?.message ?? "Impossible d'enregistrer l'avis." };
    reviewId = data.id as string;
  }

  for (let i = 0; i < input.photos.slice(0, 3).length; i++) {
    const file = input.photos[i];
    const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
    const path = `reviews/${userId}/${reviewId}-${i}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, file);
    if (!uploadError) await supabase.from('review_images').insert({ review_id: reviewId, storage_path: path, sort_order: i });
  }

  return {};
}

export async function deleteReview(reviewId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('reviews').delete().eq('id', reviewId);
  return error ? { error: error.message } : {};
}
