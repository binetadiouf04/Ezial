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
// Homepage section preview only (never the full "Voir tout" list): picks
// products round-robin across category/subcategory groups so a section
// never reads as "just one type of product" — one item per subcategory
// first, then a second pass for a 2nd item per subcategory if the limit
// isn't reached yet, and so on. Each group keeps its own relative order
// (so the official-shop boost from rankProducts still applies within a
// subcategory), and groups are visited in the order their first product
// appeared in the ranked input — so a higher-ranked subcategory still gets
// picked first.
export function diversifyBySubcategory(products: Product[], limit: number): Product[] {
  const groups = new Map<string, Product[]>();
  const groupOrder: string[] = [];
  for (const p of products) {
    const key = `${p.category}/${p.subcategory}`;
    if (!groups.has(key)) { groups.set(key, []); groupOrder.push(key); }
    groups.get(key)!.push(p);
  }

  const result: Product[] = [];
  for (let round = 0; result.length < limit; round++) {
    let addedInThisRound = false;
    for (const key of groupOrder) {
      if (result.length >= limit) break;
      const group = groups.get(key)!;
      if (round < group.length) {
        result.push(group[round]);
        addedInThisRound = true;
      }
    }
    if (!addedInThisRound) break;
  }
  return result;
}

export function rankForTrending(products: Product[], ctx: RankingContext): Product[] {
  const byRecency = [...products].sort((a, b) => {
    if (a.createdAt && b.createdAt) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (a.createdAt && !b.createdAt) return -1;
    if (!a.createdAt && b.createdAt) return 1;
    return (b.isTrending ? 1 : 0) - (a.isTrending ? 1 : 0);
  });
  return rankProducts(byRecency, ctx);
}
