// Adresses de livraison déjà utilisées par le client (comme sur Uber) : reprises de ses
// propres commandes passées (position exacte, adresse lisible, point de repère, instructions),
// pour ne pas avoir à refaire la localisation à chaque commande. Aucune donnée nouvelle n'est
// stockée : tout vient des commandes (règle d'accès : le client ne lit que les siennes).
// Les commandes cadeau sont exclues : leur adresse est celle du destinataire.
//
// TypeScript pur pour la partie testée (dedupeDeliveryPlaces, splitDeliveryNotes).

export interface RecentDeliveryPlace {
  lat: number;
  lng: number;
  label: string | null;      // adresse lisible (géocodage inverse), si connue
  quartier: string | null;
  landmark: string;
  instructions: string;
}

export interface DeliveryOrderRow {
  delivery_latitude: number | string | null;
  delivery_longitude: number | string | null;
  delivery_address: string | null;
  delivery_notes: string | null;
  neighborhood: string | null;
}

const LANDMARK_PREFIX = 'Point de repère : ';

/** Sépare « Point de repère : X. instructions » (format écrit à la commande) en ses deux champs. */
export function splitDeliveryNotes(notes: string | null | undefined): { landmark: string; instructions: string } {
  const text = (notes ?? '').trim();
  if (!text.startsWith(LANDMARK_PREFIX)) return { landmark: '', instructions: text };
  const rest = text.slice(LANDMARK_PREFIX.length);
  const cut = rest.indexOf('. ');
  if (cut === -1) return { landmark: rest.trim(), instructions: '' };
  return { landmark: rest.slice(0, cut).trim(), instructions: rest.slice(cut + 2).trim() };
}

/**
 * Commandes (de la plus récente à la plus ancienne) → adresses distinctes, la plus récente d'abord.
 * Deux positions à moins d'environ 30 m l'une de l'autre sont la même adresse.
 */
export function dedupeDeliveryPlaces(rows: DeliveryOrderRow[], max = 3): RecentDeliveryPlace[] {
  const places: RecentDeliveryPlace[] = [];
  for (const row of rows) {
    const lat = Number(row.delivery_latitude);
    const lng = Number(row.delivery_longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || row.delivery_latitude === null || row.delivery_longitude === null) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    if (places.some((p) => Math.abs(p.lat - lat) < 0.0003 && Math.abs(p.lng - lng) < 0.0003)) continue;
    const { landmark, instructions } = splitDeliveryNotes(row.delivery_notes);
    places.push({
      lat, lng,
      label: row.delivery_address?.trim() || null,
      quartier: row.neighborhood?.trim() || null,
      landmark, instructions,
    });
    if (places.length >= max) break;
  }
  return places;
}

/** Libellé affiché d'une adresse enregistrée. */
export function placeTitle(p: RecentDeliveryPlace): string {
  return p.label || (p.landmark ? `${p.quartier ? `${p.quartier} · ` : ''}${p.landmark}` : p.quartier) || 'Position enregistrée';
}
