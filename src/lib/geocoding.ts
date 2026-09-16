// Free-text address/place search, backed by the public Nominatim
// (OpenStreetMap) search API — no API key, no new dependency. Used only to
// help a seller point at their shop's real location on the map; never
// wired into checkout, delivery-fee math or create_order().

export interface GeocodeResult {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';

// Biased to Senegal — every Ezial shop is in Dakar, and unscoped results
// for common place names (e.g. "Sacré-Cœur") mostly come back from France.
export async function searchAddress(query: string): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const url = `${NOMINATIM_SEARCH_URL}?format=jsonv2&limit=5&countrycodes=sn&q=${encodeURIComponent(trimmed)}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Nominatim request failed: ${response.status}`);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) return [];
  return data
    .map((row): GeocodeResult | null => {
      const r = row as Record<string, unknown>;
      const lat = parseFloat(String(r.lat));
      const lng = parseFloat(String(r.lon));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { id: String(r.place_id ?? `${lat},${lng}`), label: String(r.display_name ?? trimmed), lat, lng };
    })
    .filter((r): r is GeocodeResult => r !== null);
}
