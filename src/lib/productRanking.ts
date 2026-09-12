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
