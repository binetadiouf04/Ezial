// Valeurs de variantes saisies librement par le vendeur — code pur, testé par
// src/lib/variantValues.test.mjs.
//
// Montres : une combinaison de couleurs (« Cadran blanc / Bracelet noir »,
// « Noir intégral ») est une variante comme une autre, avec son propre stock.
// La palette de pastilles ne peut pas toutes les prévoir : le vendeur les saisit.

/** Sous-catégories où le vendeur peut ajouter ses propres combinaisons de couleurs. */
export function allowsCustomColorCombos(categoryId: string, subId: string): boolean {
  return categoryId === 'bijoux' && subId === 'montres';
}

export const CUSTOM_COLOR_MAX_LENGTH = 40;

/**
 * Nettoie une combinaison saisie : espaces superflus retirés, « / » espacé,
 * première lettre en majuscule. Retourne null si la valeur est vide, trop
 * longue ou contient « | » (séparateur interne des lignes de stock).
 */
export function normalizeCustomColor(raw: string): string | null {
  const value = raw
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, ' / ')
    .trim();
  if (!value || value.includes('|') || value.length > CUSTOM_COLOR_MAX_LENGTH) return null;
  if (!/[\p{L}\p{N}]/u.test(value)) return null;
  // Majuscule au début de chaque partie : « Cadran blanc / Bracelet noir ».
  return value
    .split(' / ')
    .map((part) => part.charAt(0).toLocaleUpperCase('fr-FR') + part.slice(1))
    .join(' / ');
}

/** Ajoute la combinaison si elle n'existe pas déjà (comparaison sans casse ni accents). */
export function addCustomColor(current: string[], raw: string): { values: string[]; added: string | null } {
  const value = normalizeCustomColor(raw);
  if (!value) return { values: current, added: null };
  const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (current.some((v) => key(v) === key(value))) return { values: current, added: null };
  return { values: [...current, value], added: value };
}
