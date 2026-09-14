import type { Product } from '@/data/products';

// Home product-section ranking — Phase 1 (launch): products from the
// official Ezial shop are boosted, everything else keeps its existing
// relative order behind them (never hidden, just deprioritized).
//
// Deliberately kept as a single narrow seam: Phase 2 (behavioral
// personalization) replaces scoreProduct's body with a real interest score
// (drawing on RankingContext fields not needed yet — view history, past
// purchases, etc.) without any caller of rankProducts needing to change.
// No such algorithm is built here yet, only the structure to hang it on.

export interface RankingContext {
  /** Resolves whether a product's shop is the official Ezial shop (from Supabase shops.is_official — never a hardcoded id/slug/name). */
  isOfficialShop: (shopId: string) => boolean;
}

export type ProductScore = number;

// Phase 1's only signal. Phase 2 will combine this with buyer-behavior
// signals (e.g. a weighted sum) instead of replacing it outright, so the
// official shop can stay one input among several rather than disappearing.
export function scoreProduct(product: Product, ctx: RankingContext): ProductScore {
  return ctx.isOfficialShop(product.shopId) ? 1 : 0;
}

// Stable: equal-score products keep their existing relative order — this
// is a reordering by priority, not a replacement of whatever selection
// logic (filter, shuffle, slice) runs before or after it.
export function rankProducts(products: Product[], ctx: RankingContext): Product[] {
  return products
    .map((product, index) => ({ product, index, score: scoreProduct(product, ctx) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.product);
}

// "Tendances" MVP fallback: there is no real view/favorite/cart/purchase
// activity table yet, so this never fabricates an engagement score — it
// ranks by the one honest signal already available, product recency
// (products.created_at, real Supabase products only). Products with a real
// timestamp sort by most-recent-first; the static mock catalog has none,
// so mock products fall after every real one, kept in their existing
// relative order (their own curated isTrending flag as a last tie-break)
// rather than disappearing outright. Phase 2 (real activity data) replaces
// the comparator's body the same way scoreProduct is meant to evolve.
export function rankForTrending(products: Product[], ctx: RankingContext): Product[] {
  const byRecency = [...products].sort((a, b) => {
    if (a.createdAt && b.createdAt) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (a.createdAt && !b.createdAt) return -1;
    if (!a.createdAt && b.createdAt) return 1;
    return (b.isTrending ? 1 : 0) - (a.isTrending ? 1 : 0);
  });
  return rankProducts(byRecency, ctx);
}
