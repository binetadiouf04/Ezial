import { supabase } from './supabaseClient';

// Seller-scoped, read-only view of reviews on their own shop's products.
// Sellers can view but never edit/delete reviews (brief requirement) —
// there is no update/delete call in this file on purpose. Visibility
// relies entirely on the existing public reviews_select_public policy
// (is_hidden = false); a review an admin has hidden simply never shows
// up here either, no extra RLS needed.

export interface SellerReview {
  id: string;
  productId: string;
  productName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export async function fetchSellerReviews(shopId: string): Promise<SellerReview[]> {
  const { data: productRows, error: productsError } = await supabase
    .from('products')
    .select('id, name')
    .eq('shop_id', shopId);
  if (productsError || !productRows || productRows.length === 0) return [];

  const productIds = productRows.map((p) => p.id as string);
  const productNameById = new Map(productRows.map((p) => [p.id as string, p.name as string]));

  const { data: reviewRows, error: reviewsError } = await supabase
    .from('reviews')
    .select('id, product_id, rating, comment, created_at')
    .in('product_id', productIds)
    .order('created_at', { ascending: false });
  if (reviewsError || !reviewRows) return [];

  return reviewRows.map((r) => ({
    id: r.id as string,
    productId: r.product_id as string,
    productName: productNameById.get(r.product_id as string) ?? 'Produit',
    rating: r.rating as number,
    comment: (r.comment as string | null) ?? '',
    createdAt: (r.created_at as string) ?? '',
  }));
}
