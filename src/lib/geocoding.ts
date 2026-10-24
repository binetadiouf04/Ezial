// Reverse-geocoding only (free-text search moved to src/lib/googleMaps.ts's
// searchPlaces(), backed by Places API (New) — Nominatim/OpenStreetMap
// search is no longer used). Still backed by the public Nominatim API for
// this one purpose: turning a dropped map pin into a human-readable label
// is cosmetic only (never feeds into the coordinates saved, the delivery
// fee, or create_order()), so it never needed Google's separate Geocoding
// API.
//
// GeocodeResult/GeocodeSearchResult stay exported from here — googleMaps.ts
// reuses the exact same shape for its own search results, so every caller
// (CheckoutPage, SellerShop) keeps working against one shared contract.

export interface GeocodeResult {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

export interface GeocodeSearchResult {
  results: GeocodeResult[];
  // true when the exact text the user typed found nothing and these
  // results come from a broadened fallback query instead (", Dakar,
  // Sénégal" appended) — the caller uses this to show "Lieu exact non
  // trouvé. Voici les résultats les plus proches." instead of implying an
  // exact match.
  usedFallback: boolean;
}

const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';

// Best-effort label for a raw GPS point (map click/drag, "use my current
// position") — the GPS coordinate itself always stays the source of truth
// for delivery (see create_order()); this is only ever used to show the
// customer something readable instead of raw numbers. Returns null on any
// failure or when Nominatim has nothing for that exact point, so the
// caller can fall back to its own generic wording rather than showing
// nothing at all.
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `${NOMINATIM_REVERSE_URL}?format=jsonv2&lat=${lat}&lon=${lng}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const displayName = (data as Record<string, unknown> | null)?.display_name;
    return typeof displayName === 'string' && displayName.trim() ? displayName : null;
  } catch {
    return null;
  }
}
