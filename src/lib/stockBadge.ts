// Badge de stock des cartes produits — code pur, testé par
// src/lib/stockBadge.test.mjs.
//
// Règles :
// - stock nul → « Sold out » (badge seul : la photo n'est ni grisée ni
//   atténuée, demande du 24 nov. 2026) ;
// - 1 à 3 unités → « Plus que X ! » ;
// - 4 unités ou plus → aucun badge ;
// - stock inconnu (non numérique) → aucun badge : jamais d'information inventée.
//
// `stock` d'un produit est déjà la somme des stocks de toutes ses variantes
// (supabaseCatalog). Un produit n'est donc « Sold out » que si TOUTES ses
// variantes le sont, et « Plus que X ! » désigne le total réellement
// disponible, toutes variantes confondues.
// Tissus (vente au mètre, au kilo ou à la pièce) : le stock est un indicateur
// de disponibilité et non un compteur réel (voir SellerProductForm) — seul
// « Sold out » s'applique, comme sur la fiche produit.

export const LOW_STOCK_MAX = 3;
export const SOLD_OUT_LABEL = 'Sold out';

export type StockBadge = { kind: 'out' | 'low'; label: string };

export function stockBadge(product: { stock?: number | null; saleMode?: string | null }): StockBadge | null {
  const stock = product.stock;
  if (typeof stock !== 'number' || !Number.isFinite(stock) || stock < 0) return null;
  if (stock === 0) return { kind: 'out', label: SOLD_OUT_LABEL };
  if (product.saleMode) return null;
  if (stock >= 1 && stock <= LOW_STOCK_MAX) return { kind: 'low', label: `Plus que ${Math.floor(stock)} !` };
  return null;
}
