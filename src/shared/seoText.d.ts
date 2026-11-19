export const DESCRIPTION_MAX: number;
export function clipDescription(text: string, max?: number): string;
export function categoryDescription(categoryLabel: string, subLabel?: string | null): string;
export function productFallbackDescription(name: string): string;
export function shopFallbackDescription(name: string): string;
export const SHOPS_INDEX_DESCRIPTION: string;
export const UTILITY_DESCRIPTIONS: {
  panier: string; commande: string; confirmation: string; suivi: string; detailCommande: string; favoris: string;
  compte: string; recherche: string; promos: string; tendances: string; pourVous: string; pro: string;
};
