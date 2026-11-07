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

// ---------------------------------------------------------------------------
// « Vous aimerez » — personalised from the visitor's own habits, in this
// order of strength: what they bought, put in favorites or in the cart, then
// what they recently looked at (this device only). Each signal raises the
// products of the same subcategory, then category, then shop. A visitor
// with no signal yet gets a random draw (as before). A small random part
// keeps the selection changing from one visit to the next.
// ---------------------------------------------------------------------------

export interface ShoppingSignals {
  purchasedIds: string[];
  favoriteIds: string[];
  cartIds: string[];
  viewedIds: string[];
}

const SIGNAL_WEIGHTS = { purchased: 4, favorite: 3, cart: 3, viewed: 1 } as const;

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function rankForYou(products: Product[], signals: ShoppingSignals, ctx: RankingContext): Product[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const subWeight = new Map<string, number>();
  const catWeight = new Map<string, number>();
  const shopWeight = new Map<string, number>();
  const add = (map: Map<string, number>, key: string, w: number) => map.set(key, (map.get(key) ?? 0) + w);

  const feed = (ids: string[], w: number) => {
    for (const id of ids) {
      const p = byId.get(id);
      if (!p) continue;
      add(subWeight, `${p.category}/${p.subcategory}`, w);
      add(catWeight, p.category, w);
      add(shopWeight, p.shopId, w);
    }
  };
  feed(signals.purchasedIds, SIGNAL_WEIGHTS.purchased);
  feed(signals.favoriteIds, SIGNAL_WEIGHTS.favorite);
  feed(signals.cartIds, SIGNAL_WEIGHTS.cart);
  feed(signals.viewedIds, SIGNAL_WEIGHTS.viewed);

  const hasSignal = subWeight.size > 0;
  // Already bought or already in the cart: shown last, the point is to
  // suggest something new.
  const alreadyTaken = new Set([...signals.purchasedIds, ...signals.cartIds]);

  return shuffled(products)
    .map((product, index) => {
      const interest = hasSignal
        ? (subWeight.get(`${product.category}/${product.subcategory}`) ?? 0) * 1
          + (catWeight.get(product.category) ?? 0) * 0.4
          + (shopWeight.get(product.shopId) ?? 0) * 0.25
        : 0;
      const official = ctx.isOfficialShop(product.shopId) ? 0.5 : 0;
      const taken = alreadyTaken.has(product.id) ? -1000 : 0;
      // Random part: enough to vary equal or close interests, never enough
      // to push an unrelated product above a strongly matching one.
      return { product, index, score: interest + official + taken + Math.random() * 0.75 };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.product);
}

// ---------------------------------------------------------------------------
// « Tendances » — what people like most (product_popularity(): favorites and
// purchases), with priority to Ezial Plus shops (the official Ezial shop is
// Ezial Plus by default): Ezial Plus products come first, each group ordered
// by popularity, then by recency for products nobody has liked or bought yet.
// ---------------------------------------------------------------------------

export function rankForTrendingByPopularity(
  products: Product[],
  popularity: Map<string, number>,
  isPlusShop: (shopId: string) => boolean,
): Product[] {
  const time = (p: Product) => (p.createdAt ? new Date(p.createdAt).getTime() : 0);
  return [...products].sort((a, b) => {
    const plusA = isPlusShop(a.shopId) ? 1 : 0;
    const plusB = isPlusShop(b.shopId) ? 1 : 0;
    if (plusA !== plusB) return plusB - plusA;
    const rankA = popularity.get(a.id);
    const rankB = popularity.get(b.id);
    if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
    if (rankA !== undefined) return -1;
    if (rankB !== undefined) return 1;
    return time(b) - time(a);
  });
}

// Homepage preview for an already meaningful order (« Vous aimerez »,
// « Tendances »): keeps that order and only caps each subcategory, so the
// row stays varied without reshuffling what was ranked first.
export function capPerSubcategory(products: Product[], limit: number, maxPerGroup: number): Product[] {
  const counts = new Map<string, number>();
  const result: Product[] = [];
  for (const p of products) {
    if (result.length >= limit) break;
    const key = `${p.category}/${p.subcategory}`;
    const n = counts.get(key) ?? 0;
    if (n >= maxPerGroup) continue;
    counts.set(key, n + 1);
    result.push(p);
  }
  // Small catalog: fill the remaining slots in order rather than show fewer cards.
  if (result.length < limit) {
    const taken = new Set(result.map((p) => p.id));
    for (const p of products) {
      if (result.length >= limit) break;
      if (!taken.has(p.id)) result.push(p);
    }
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
