// Campagnes promotionnelles : règles d'affichage côté site (pures, testées).
// Elles ne décident JAMAIS d'un montant : le serveur (promotions_preview, puis
// create_order) recalcule tout. Elles servent seulement à n'annoncer « Livraison
// offerte » que sur un produit réellement concerné par une campagne automatique.

export interface PromotionTarget { type: 'product' | 'shop' | 'category' | 'subcategory'; ref: string }

export interface PublicPromotion {
  id: string;
  name: string;
  kind: 'fixed' | 'percent' | 'free_delivery';
  minAmount: number;
  deliveryCap: number | null;
  endsAt: string;
  targets: PromotionTarget[];
  neighborhoods: string[];
}

export interface PromotableProduct { id: string; shopId: string; category: string; subcategory: string }

/** Un produit est concerné si la campagne n'a aucune cible, ou si l'une d'elles le désigne. */
export function productMatchesTargets(product: PromotableProduct, targets: PromotionTarget[]): boolean {
  if (targets.length === 0) return true;
  return targets.some((t) =>
    (t.type === 'product' && t.ref === product.id)
    || (t.type === 'shop' && t.ref === product.shopId)
    || (t.type === 'category' && t.ref === product.category)
    || (t.type === 'subcategory' && t.ref === `${product.category}/${product.subcategory}`));
}

/** Campagne automatique de livraison offerte qui concerne ce produit (encore en cours), ou null. */
export function freeDeliveryFor(product: PromotableProduct, promotions: PublicPromotion[], now: number = Date.now()): PublicPromotion | null {
  return promotions.find((p) => p.kind === 'free_delivery'
    && Date.parse(p.endsAt) > now
    && productMatchesTargets(product, p.targets)) ?? null;
}

/** Conditions à afficher sous « Livraison offerte » (vide si aucune). */
export function freeDeliveryConditions(p: PublicPromotion, formatMoney: (n: number) => string): string {
  const parts: string[] = [];
  if (p.minAmount > 0) parts.push(`dès ${formatMoney(p.minAmount)} d'articles concernés`);
  if (p.deliveryCap) parts.push(`jusqu'à ${formatMoney(p.deliveryCap)} de livraison`);
  return parts.join(', ');
}
