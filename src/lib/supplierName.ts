// Nom du fournisseur affiché sur la fiche produit — code pur, testé par
// src/lib/supplierName.test.mjs.
//
// Règle métier : le champ « Fournisseur » est réservé à Ezial Boutique (compte
// officiel) ; son nom est visible par les clients sur la fiche produit. Seul un
// NOM est accepté : ni téléphone, ni e-mail, ni lien (coordonnées et
// informations internes ne doivent jamais devenir publiques). La même règle est
// imposée par la base (contrainte product_suppliers_supplier_name_check,
// docs/sql/fournisseur-public.sql) : celle-ci reste la vraie barrière.

export const SUPPLIER_NAME_MIN_LENGTH = 2;
export const SUPPLIER_NAME_MAX_LENGTH = 80;

/** Nettoie un nom saisi (espaces multiples retirés). */
export function normalizeSupplierName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Message d'erreur si le nom ne peut pas être enregistré, sinon null. Vide = « aucun fournisseur ». */
export function supplierNameError(raw: string): string | null {
  const value = normalizeSupplierName(raw);
  if (!value) return null;
  if (value.length < SUPPLIER_NAME_MIN_LENGTH) return 'Nom du fournisseur trop court.';
  if (value.length > SUPPLIER_NAME_MAX_LENGTH) return `${SUPPLIER_NAME_MAX_LENGTH} caractères au maximum.`;
  if (value.includes('@')) return 'Pas d’adresse e-mail : indiquez seulement le nom du fournisseur.';
  if (/https?:|www\./i.test(value)) return 'Pas de lien : indiquez seulement le nom du fournisseur.';
  if ((value.match(/\d/g) ?? []).length >= 7) return 'Pas de numéro de téléphone : indiquez seulement le nom du fournisseur.';
  return null;
}
