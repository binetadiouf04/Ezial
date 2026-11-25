// Option « Autre » des caractéristiques produit (type, type de produit,
// matière du bracelet…) avec sa précision facultative — code pur, testé par
// src/lib/otherOption.test.mjs.
//
// Forme enregistrée dans products.descriptive_attributes (aucune nouvelle
// colonne, aucune nouvelle clé) :
//   - « Autre » seul quand le vendeur ne précise rien (forme déjà utilisée
//     par les montres et les faux ongles, inchangée) ;
//   - « Autre (turban en wax) » quand il précise.
// Le filtre client compare les valeurs par « contient » (CategoryPage) : un
// filtre « Autre » retrouve donc les deux formes, et la recherche lit la
// précision comme n'importe quelle caractéristique.

export const OTHER_OPTION = 'Autre';
export const OTHER_DETAIL_MAX_LENGTH = 60;

const OTHER_WITH_DETAIL = /^Autre \((.*)\)$/s;

/** Précision nettoyée : une seule ligne, espaces réduits, 60 caractères au plus. */
export function normalizeOtherDetail(detail: string | null | undefined): string {
  return String(detail ?? '').replace(/\s+/g, ' ').trim().slice(0, OTHER_DETAIL_MAX_LENGTH).trim();
}

/** Valeur à enregistrer pour « Autre » avec sa précision éventuelle. */
export function formatOtherValue(detail: string | null | undefined): string {
  const clean = normalizeOtherDetail(detail);
  return clean ? `${OTHER_OPTION} (${clean})` : OTHER_OPTION;
}

/**
 * Précision d'une valeur enregistrée : '' pour « Autre » seul, le texte pour
 * « Autre (…) », null pour toute autre valeur (« Autre tissu », « Sèche »…).
 */
export function parseOtherValue(value: string): string | null {
  if (value === OTHER_OPTION) return '';
  const m = OTHER_WITH_DETAIL.exec(value);
  return m ? m[1].trim() : null;
}

/**
 * Valeurs enregistrées → choix du formulaire : chaque « Autre (…) » redevient
 * la puce « Autre » et sa précision est rendue à part. Toute autre valeur
 * reste telle quelle (les produits déjà enregistrés ne changent pas).
 */
export function splitOtherValues(values: string[]): { values: string[]; detail: string } {
  let detail = '';
  const out: string[] = [];
  for (const v of values) {
    const parsed = parseOtherValue(v);
    if (parsed === null) { out.push(v); continue; }
    if (parsed && !detail) detail = parsed;
    if (!out.includes(OTHER_OPTION)) out.push(OTHER_OPTION);
  }
  return { values: out, detail };
}

/** Choix du formulaire → valeurs enregistrées (« Autre » reçoit sa précision). */
export function joinOtherValues(values: string[], detail: string | null | undefined): string[] {
  return values.map((v) => (v === OTHER_OPTION ? formatOtherValue(detail) : v));
}

// Skincare, « Type de peau » (choix multiple) : « Tous types de peau » exclut
// les autres choix, dans les deux sens.
export const ALL_SKIN_TYPES = 'Tous types de peau';

export function toggleSkinType(current: string[], value: string): string[] {
  if (current.includes(value)) return current.filter((v) => v !== value);
  if (value === ALL_SKIN_TYPES) return [ALL_SKIN_TYPES];
  return [...current.filter((v) => v !== ALL_SKIN_TYPES), value];
}
