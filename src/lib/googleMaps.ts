// Google Maps JavaScript API (map rendering) + Places API (New) Text
// Search (address/place search) — loaded with the browser-restricted
// VITE_GOOGLE_MAPS_API_KEY (HTTP-referrer-restricted to ezial.net in
// Google Cloud Console). No npm dependency: the JS API is loaded via a
// plain <script> tag, Places (New) is called directly as a REST POST —
// same lightweight, framework-free style src/lib/geocoding.ts already
// used for the (now replaced) Nominatim search.
//
// Reverse-geocoding a dropped pin into a human-readable label still uses
// Nominatim (see geocoding.ts's reverseGeocode) — that's cosmetic only
// (never feeds into the coordinates saved or the delivery fee), and the
// project wasn't asked to enable Google's separate Geocoding API for it.

import type { GeocodeResult, GeocodeSearchResult } from './geocoding';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

let loadPromise: Promise<void> | null = null;

// Loads the Maps JavaScript API once (idempotent — safe to call from every
// component that needs a map); resolves once window.google.maps is ready.
export function loadGoogleMaps(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (!API_KEY) { reject(new Error('Clé Google Maps manquante.')); return; }
    if ((window as unknown as { google?: { maps?: unknown } }).google?.maps) { resolve(); return; }
    const callbackName = '__ezialGoogleMapsLoaded';
    (window as unknown as Record<string, () => void>)[callbackName] = () => resolve();
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=marker&v=weekly&loading=async&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => reject(new Error('Impossible de charger Google Maps.'));
    document.head.appendChild(script);
  });
  return loadPromise;
}

// Same Dakar/Sénégal bias as the Nominatim search this replaces — every
// Ezial shop is in Dakar, and an unscoped place name mostly returns
// results from elsewhere.
function withDakarSenegal(query: string): string {
  return /dakar|s[ée]n[ée]gal/i.test(query) ? query : `${query}, Dakar, Sénégal`;
}

interface PlacesTextSearchResult {
  places?: { id: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude: number; longitude: number } }[];
}

async function textSearch(query: string): Promise<GeocodeResult[]> {
  if (!API_KEY) return [];
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({ textQuery: query, regionCode: 'SN' }),
  });
  if (!res.ok) throw new Error(`Places API request failed: ${res.status}`);
  const data: PlacesTextSearchResult = await res.json();
  return (data.places ?? [])
    .filter((p) => p.location)
    .map((p) => ({
      id: p.id,
      label: p.formattedAddress || p.displayName?.text || query,
      lat: p.location!.latitude,
      lng: p.location!.longitude,
    }));
}

// Same progressive-fallback contract as geocoding.ts's searchAddress() —
// drop-in replacement: exact query first, then the same query with
// ", Dakar, Sénégal" appended if the exact text found nothing.
export async function searchPlaces(query: string): Promise<GeocodeSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) return { results: [], usedFallback: false };

  const exact = await textSearch(trimmed);
  if (exact.length > 0) return { results: exact, usedFallback: false };

  const withCity = withDakarSenegal(trimmed);
  if (withCity.toLowerCase() !== trimmed.toLowerCase()) {
    const cityResults = await textSearch(withCity);
    if (cityResults.length > 0) return { results: cityResults, usedFallback: true };
  }

  return { results: [], usedFallback: false };
}
