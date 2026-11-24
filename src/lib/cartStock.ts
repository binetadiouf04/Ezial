// Stock disponible d'une ligne de panier ou d'une variante choisie — code
// pur, testé par src/lib/cartStock.test.mjs.
//
// Ce n'est qu'un garde-fou d'affichage : le stock lu ici est celui du
// catalogue chargé dans le navigateur, qui peut avoir quelques minutes de
// retard. La vraie autorité est create_order() (Supabase), qui verrouille
// chaque variante (« for update ») et refuse toute quantité au-delà du stock
// réel, y compris quand deux clients commandent en même temps.

interface StockVariant { id?: string; conditions: Record<string, string>; stock?: number }
interface StockProduct { stock?: number | null; variantPrices?: StockVariant[] }
interface StockLine { quantity: number; variants: Record<string, string>; variantId?: string }

function finiteStock(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Variante correspondant au choix du client : d'abord par identifiant exact,
 * sinon la première dont toutes les conditions sont remplies (même règle que
 * getVariantPrice). undefined si le produit n'a pas de variantes connues.
 */
export function findVariant(product: StockProduct, selected: Record<string, string>, variantId?: string): StockVariant | undefined {
  const list = product.variantPrices ?? [];
  if (variantId) {
    const byId = list.find((v) => v.id === variantId);
    if (byId) return byId;
  }
  return list.find((v) => Object.entries(v.conditions).every(([k, val]) => selected[k] === val));
}

/**
 * Stock disponible pour ce choix : celui de la variante quand elle est
 * connue, sinon le stock total du produit. null quand il est inconnu (jamais
 * de chiffre inventé : rien n'est alors bloqué côté navigateur).
 */
export function availableStock(product: StockProduct, selected: Record<string, string>, variantId?: string): number | null {
  const variant = findVariant(product, selected, variantId);
  if (variant) return finiteStock(variant.stock);
  return finiteStock(product.stock);
}

export type LineStockIssue = { kind: 'out' } | { kind: 'exceeds'; available: number };

/** Problème de stock d'une ligne de panier, ou null si elle peut être commandée. */
export function lineStockIssue(product: StockProduct | undefined, line: StockLine): LineStockIssue | null {
  if (!product) return null;
  const available = availableStock(product, line.variants, line.variantId);
  if (available === null) return null;
  if (available <= 0) return { kind: 'out' };
  if (line.quantity > available) return { kind: 'exceeds', available };
  return null;
}

/** Texte affiché sous une ligne de panier qui ne peut pas être commandée telle quelle. */
export function lineStockMessage(issue: LineStockIssue): string {
  if (issue.kind === 'out') return 'Épuisé : retirez cet article pour commander.';
  return issue.available === 1
    ? 'Plus qu’un seul exemplaire disponible : réduisez la quantité.'
    : `Plus que ${formatQty(issue.available)} disponibles : réduisez la quantité.`;
}

function formatQty(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1).replace('.', ',');
}
