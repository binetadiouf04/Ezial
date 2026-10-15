import { supabase } from './supabaseClient';
import { PRODUCT_IMAGES_BUCKET } from './supabaseCatalog';

// Admin moderation view over public.reviews — admins see every review
// (including hidden ones) via admins_select_all_reviews, unlike the
// public is_hidden=false policy customers/sellers are scoped to.

export interface AdminReview {
  id: string;
  productId: string;
  productName: string;
  shopName: string;
  userId: string | null;
  rating: number;
  comment: string;
  createdAt: string;
  isHidden: boolean;
  hiddenReason: string | null;
  reportCount: number;
}

interface ReviewRow {
  id: string;
  product_id: string;
  user_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  is_hidden: boolean;
  hidden_reason: string | null;
}

export async function fetchAdminReviews(): Promise<AdminReview[]> {
  const { data: reviewRows, error } = await supabase
    .from('reviews')
    .select('id, product_id, user_id, rating, comment, created_at, is_hidden, hidden_reason')
    .order('created_at', { ascending: false });
  if (error || !reviewRows) return [];
  const rows = reviewRows as ReviewRow[];
  if (rows.length === 0) return [];

  const productIds = [...new Set(rows.map((r) => r.product_id))];
  const reviewIds = rows.map((r) => r.id);

  const [{ data: productRows }, { data: reportRows }] = await Promise.all([
    supabase.from('products').select('id, name, shop_id').in('id', productIds),
    supabase.from('review_reports').select('review_id').in('review_id', reviewIds),
  ]);

  const shopIds = [...new Set((productRows ?? []).map((p) => p.shop_id as string).filter(Boolean))];
  const { data: shopRows } = shopIds.length > 0
    ? await supabase.from('shops').select('id, name').in('id', shopIds)
    : { data: [] as { id: string; name: string }[] };

  const shopNameById = new Map((shopRows ?? []).map((s) => [s.id as string, s.name as string]));
  const productById = new Map((productRows ?? []).map((p) => [p.id as string, p as { name: string; shop_id: string }]));

  const reportCountByReview = new Map<string, number>();
  for (const r of (reportRows ?? []) as { review_id: string }[]) {
    reportCountByReview.set(r.review_id, (reportCountByReview.get(r.review_id) ?? 0) + 1);
  }

  return rows.map((r) => {
    const product = productById.get(r.product_id);
    return {
      id: r.id,
      productId: r.product_id,
      productName: product?.name ?? 'Produit introuvable',
      shopName: product?.shop_id ? shopNameById.get(product.shop_id) ?? '' : '',
      userId: r.user_id,
      rating: r.rating,
      comment: r.comment ?? '',
      createdAt: r.created_at,
      isHidden: r.is_hidden,
      hiddenReason: r.hidden_reason,
      reportCount: reportCountByReview.get(r.id) ?? 0,
    };
  });
}

// Soft-moderation — never deletes data, just takes the review out of the
// public reviews_select_public view while keeping a full audit trail
// (hidden_reason/hidden_by/hidden_at, protected from forgery by the
// lock_reviews_moderation_column trigger). Already covered by the
// confirmed migration — works immediately.
export async function hideReview(reviewId: string, reason: string): Promise<{ error?: string }> {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from('reviews').update({
    is_hidden: true,
    hidden_reason: reason.trim() || null,
    hidden_by: userData.user?.id ?? null,
    hidden_at: new Date().toISOString(),
  }).eq('id', reviewId);
  return error ? { error: error.message } : {};
}

export async function unhideReview(reviewId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('reviews').update({
    is_hidden: false, hidden_reason: null, hidden_by: null, hidden_at: null,
  }).eq('id', reviewId);
  return error ? { error: error.message } : {};
}

// Hard delete, for a review genuinely unfit to keep even hidden (e.g.
// illegal content). Requires the reviews_admin_delete RLS policy —
// see the migration handed over alongside this feature.
export async function deleteReviewAdmin(reviewId: string): Promise<{ error?: string }> {
  const { data: images } = await supabase.from('review_images').select('storage_path').eq('review_id', reviewId);
  const paths = (images ?? []).map((r) => r.storage_path as string).filter(Boolean);
  const { error } = await supabase.from('reviews').delete().eq('id', reviewId);
  if (error) return { error: error.message };
  if (paths.length > 0) void supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(paths);
  return {};
}
