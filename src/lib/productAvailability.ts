// Disponibilité d'un produit (En stock / Sur commande) et fournisseur public —
// code pur, testé par src/lib/productAvailability.test.mjs. Les mêmes règles
// sont imposées par la base (contraintes de docs/sql/fournisseur-public-disponibilite.sql).
//
// Principes :
// - « En stock » = l'article est physiquement chez le vendeur ; « Sur commande »
//   = il faut l'approvisionner ou le fabriquer après la commande. C'est le
//   vendeur qui le déclare : un fournisseur renseigné ne rend JAMAIS un produit
//   « sur commande » automatiquement.
// - Un produit sur commande a toujours un délai de préparation (1 à 60 jours),
//   affiché avant le paiement : jamais de promesse de préparation immédiate.
// - Le fournisseur public est un simple nom (« Atelier Ndeye, Thiès »), distinct
//   de la boutique qui vend. Le champ interne d'EZIAL (product_suppliers) reste
//   privé et n'est jamais recopié ici.

export type AvailabilityMode = 'in_stock' | 'on_order';

export const PREPARATION_DAYS_MIN = 1;
export const PREPARATION_DAYS_MAX = 60;
export const PUBLIC_SUPPLIER_MAX_LENGTH = 80;

export function normalizeAvailabilityMode(value: unknown): AvailabilityMode {
  return value === 'on_order' ? 'on_order' : 'in_stock';
}

/** Libellé client, adapté au produit : un article fait main est « fabriqué sur commande ». */
export function availabilityLabel(mode: AvailabilityMode, opts: { handmade?: boolean } = {}): string {
  if (mode === 'in_stock') return 'En stock';
  return opts.handmade ? 'Fabriqué sur commande' : 'Sur commande';
}

export function formatDays(days: number): string {
  return `${days} jour${days > 1 ? 's' : ''}`;
}

/** Phrase de délai affichée au client (fiche produit, panier, paiement, commande). */
export function preparationSentence(days: number, opts: { handmade?: boolean } = {}): string {
  return opts.handmade
    ? `Fabrication en ${formatDays(days)} environ après la commande, avant la livraison.`
    : `Approvisionnement en ${formatDays(days)} environ après la commande, avant la livraison.`;
}

/** Valide le délai saisi par le vendeur. Retourne un message d'erreur, ou null. */
export function validatePreparationDays(mode: AvailabilityMode, raw: string | number | null | undefined): string | null {
  if (mode !== 'on_order') return null;
  const text = String(raw ?? '').trim();
  if (!text) return 'Indiquez le délai de préparation (en jours).';
  if (!/^\d+$/.test(text)) return 'Le délai doit être un nombre entier de jours.';
  const n = Number(text);
  if (n < PREPARATION_DAYS_MIN || n > PREPARATION_DAYS_MAX) return `Le délai doit être compris entre ${PREPARATION_DAYS_MIN} et ${PREPARATION_DAYS_MAX} jours.`;
  return null;
}

/**
 * Nettoie et valide le nom public du fournisseur. Vide = aucun fournisseur
 * affiché. Refuse ce qui ressemble à des coordonnées privées (téléphone,
 * e-mail, lien) : seul un nom doit être rendu public.
 */
export function validatePublicSupplier(raw: string): { value: string | null; error: string | null } {
  const value = raw.replace(/\s+/g, ' ').trim();
  if (!value) return { value: null, error: null };
  if (value.length < 2) return { value: null, error: 'Nom du fournisseur trop court.' };
  if (value.length > PUBLIC_SUPPLIER_MAX_LENGTH) return { value: null, error: `${PUBLIC_SUPPLIER_MAX_LENGTH} caractères au maximum.` };
  if (value.includes('@')) return { value: null, error: 'Pas d’adresse e-mail : indiquez seulement le nom du fournisseur.' };
  if (/https?:|www\./i.test(value)) return { value: null, error: 'Pas de lien : indiquez seulement le nom du fournisseur.' };
  if ((value.match(/\d/g) ?? []).length >= 7) return { value: null, error: 'Pas de numéro de téléphone : indiquez seulement le nom du fournisseur.' };
  return { value, error: null };
}

export interface AvailabilityLike {
  availabilityMode?: AvailabilityMode;
  preparationDays?: number | null;
}

/** Délai de préparation le plus long d'un panier (0 si tout est en stock). */
export function maxPreparationDays(items: AvailabilityLike[]): number {
  return items.reduce((max, it) => (it.availabilityMode === 'on_order' && it.preparationDays ? Math.max(max, it.preparationDays) : max), 0);
}

/** Date (AAAA-MM-JJ) à partir de laquelle une livraison peut être souhaitée. */
export function earliestDeliveryDateISO(todayISO: string, preparationDays: number): string {
  const [y, m, d] = todayISO.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + Math.max(1, preparationDays + 1));
  return date.toISOString().slice(0, 10);
}
