// Tour de taille des produits de la sous-catégorie « Baya » (Bijoux) — code
// pur, testé par src/lib/waistMeasure.test.mjs.
//
// La mesure du client est une PERSONNALISATION de la ligne de commande, jamais
// une variante : elle ne change ni le prix, ni le stock, ni la commission.
// Elle est obligatoire (40 à 200 cm, une décimale au plus), conservée par
// article (deux baya de mesures différentes = deux lignes), puis enregistrée
// avec la commande (order_items.waist_cm). Le serveur revalide la même plage
// dans create_order (docs/sql/baya-tour-de-taille.sql).

export const WAIST_MIN_CM = 40;
export const WAIST_MAX_CM = 200;
export const WAIST_LABEL = 'Tour de taille (cm)';
export const WAIST_HINT = 'Indiquez votre tour de taille pour adapter votre baya à votre mesure.';
export const WAIST_REQUIRED_MESSAGE = 'Indiquez votre tour de taille (en cm) pour ajouter ce baya au panier.';
export const WAIST_INVALID_MESSAGE = `Tour de taille invalide : indiquez une mesure en centimètres, entre ${WAIST_MIN_CM} et ${WAIST_MAX_CM} cm.`;

/** Sous-catégorie qui demande la mesure. */
export function isBayaProduct(product: { category?: string | null; subcategory?: string | null } | null | undefined): boolean {
  return product?.category === 'bijoux' && product?.subcategory === 'baya';
}

/**
 * Lit la mesure saisie : « 82 », « 82,5 », « 82.5 », « 82 cm ». Retourne null
 * si vide, non numérique, avec plus d'une décimale ou hors de 40–200 cm.
 */
export function parseWaistCm(raw: string | null | undefined): number | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().toLowerCase().replace(/\s*cm$/, '').replace(',', '.').trim();
  if (!/^\d{1,3}(\.\d)?$/.test(text)) return null;
  const n = Number(text);
  return n >= WAIST_MIN_CM && n <= WAIST_MAX_CM ? n : null;
}

/** Message à afficher pour une saisie, ou null si elle est valide. */
export function waistError(raw: string): string | null {
  if (!raw.trim()) return WAIST_REQUIRED_MESSAGE;
  return parseWaistCm(raw) === null ? WAIST_INVALID_MESSAGE : null;
}

/** Valeur déjà enregistrée (panier stocké, réponse serveur) : nombre valide ou undefined. */
export function normalizeStoredWaist(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= WAIST_MIN_CM && n <= WAIST_MAX_CM ? Math.round(n * 10) / 10 : undefined;
}

/** « 82 cm » / « 82,5 cm ». */
export function formatWaistCm(cm: number): string {
  return `${String(cm).replace('.', ',')} cm`;
}

/** Texte d'options d'une ligne : « Couleur : Noir · Tour de taille : 82 cm » (vide s'il n'y a rien). */
export function optionsLine(variants: Record<string, string>, waistCm?: number | null): string {
  const parts = Object.entries(variants).map(([k, v]) => `${k} : ${v}`);
  if (waistCm != null) parts.push(`Tour de taille : ${formatWaistCm(waistCm)}`);
  return parts.join(' · ');
}

/** Deux lignes de panier ne fusionnent que pour le même produit, les mêmes options ET la même mesure. */
export function sameCartLine(
  a: { productId: string; variants: Record<string, string>; waistCm?: number | null },
  b: { productId: string; variants: Record<string, string>; waistCm?: number | null },
): boolean {
  return a.productId === b.productId
    && JSON.stringify(a.variants) === JSON.stringify(b.variants)
    && (a.waistCm ?? null) === (b.waistCm ?? null);
}

/** Une ligne de panier Baya sans mesure valide bloque la commande (le serveur le revérifie). */
export function lineNeedsWaist(item: { waistCm?: number | null }, product: { category?: string | null; subcategory?: string | null } | null | undefined): boolean {
  return isBayaProduct(product) && normalizeStoredWaist(item.waistCm) === undefined;
}
