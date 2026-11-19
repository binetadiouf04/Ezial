import type { Product } from '@/data/products';
import type { Shop } from '@/data/shops';

// Mémoire locale du dernier catalogue public (boutiques et produits actifs) :
// quand la personne revient sur Ezial, l'accueil s'affiche tout de suite avec
// ces données, pendant que la liste à jour est relue en arrière-plan puis
// remplace la copie. Ce sont des données publiques réelles (jamais de démo) ;
// le prix, le stock et la disponibilité sont toujours revérifiés par le
// serveur à la commande. Aucun compte, aucune donnée privée.

const KEY = 'ezial-catalog-snapshot-v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 1_500_000;

export interface CatalogSnapshot { shops: Shop[]; products: Product[] }

export function saveCatalogSnapshot(snapshot: CatalogSnapshot): void {
  try {
    if (snapshot.products.length === 0 || snapshot.shops.length === 0) return;
    const json = JSON.stringify({ at: Date.now(), shops: snapshot.shops, products: snapshot.products });
    if (json.length > MAX_BYTES) { localStorage.removeItem(KEY); return; }
    localStorage.setItem(KEY, json);
  } catch { /* stockage indisponible ou plein : le catalogue se charge simplement normalement */ }
}

export function loadCatalogSnapshot(): CatalogSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; shops?: unknown; products?: unknown };
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > MAX_AGE_MS) { localStorage.removeItem(KEY); return null; }
    if (!Array.isArray(parsed.shops) || !Array.isArray(parsed.products) || parsed.products.length === 0) return null;
    return { shops: parsed.shops as Shop[], products: parsed.products as Product[] };
  } catch {
    return null;
  }
}
