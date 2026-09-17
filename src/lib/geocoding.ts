// Free-text address/place search, backed by the public Nominatim
// (OpenStreetMap) search API — no API key, no new dependency. Used only to
// help a seller/customer point at a real-world location on the map; never
// wired into checkout, delivery-fee math or create_order().

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
  // Sénégal" appended, and/or a generic category word like "mosquée"
  // stripped out) — the caller uses this to show "Lieu exact non trouvé.
  // Voici les résultats les plus proches." instead of implying an exact
  // match.
  usedFallback: boolean;
}

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
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

// Generic category words that describe a *type* of place rather than its
// name — Nominatim often has no result for "Mosquée Cité des Magistrats"
// (that exact string is never anyone's official place name) but finds
// "Cité des Magistrats" once the category word is stripped. Not
// exhaustive by design (the user's own spec says "etc.") — just the most
// common French descriptors likely to prefix a place name here.
const GENERIC_WORDS = [
  'mosquée', 'mosquee', 'église', 'eglise', 'boutique', 'magasin', 'immeuble',
  'résidence', 'residence', 'école', 'ecole', 'pharmacie', 'restaurant',
  'hôtel', 'hotel', 'banque', 'clinique', 'hôpital', 'hopital', 'marché',
  'marche', 'gare', 'station', 'villa', 'appartement', 'cité', 'cite',
];

function normalizeForCompare(s: string): string {
  return s.trim().toLowerCase();
}

// Drops any word from GENERIC_WORDS, keeping the rest in their original
// order — "Mosquée Cité des Magistrats" -> "Cité des Magistrats".
function stripGenericWords(query: string): string {
  const words = query
    .split(/\s+/)
    .filter((w) => !GENERIC_WORDS.includes(normalizeForCompare(w).replace(/[^a-zà-öø-ÿ]/gi, '')));
  return words.join(' ').trim();
}

function withDakarSenegal(query: string): string {
  return /dakar|s[ée]n[ée]gal/i.test(query) ? query : `${query}, Dakar, Sénégal`;
}

// Biased to Senegal — every Ezial shop is in Dakar, and unscoped results
// for common place names (e.g. "Sacré-Cœur") mostly come back from France.
async function rawSearch(query: string): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const url = `${NOMINATIM_SEARCH_URL}?format=jsonv2&addressdetails=1&limit=5&countrycodes=sn&q=${encodeURIComponent(trimmed)}`;
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

// Progressive fallback so a precise but narrowly-tagged place name (e.g.
// "Mosquée Cité des Magistrats") isn't a dead end just because it isn't
// literally how OpenStreetMap tagged it:
//   1. the exact text typed;
//   2. the same text with ", Dakar, Sénégal" appended (helps a bare
//      neighborhood/place name with no city context);
//   3. the text with generic category words stripped, plus ", Dakar,
//      Sénégal" (turns "Mosquée Cité des Magistrats" into "Cité des
//      Magistrats, Dakar, Sénégal").
// The caller always gets *some* results back whenever any step finds
// something, tagged with whether it was the exact query or a fallback —
// it never has to fully block on a single failed exact match, and the
// map is always still available for the user to place the point by hand.
export async function searchAddress(query: string): Promise<GeocodeSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) return { results: [], usedFallback: false };

  const exact = await rawSearch(trimmed);
  if (exact.length > 0) return { results: exact, usedFallback: false };

  const withCity = withDakarSenegal(trimmed);
  if (normalizeForCompare(withCity) !== normalizeForCompare(trimmed)) {
    const cityResults = await rawSearch(withCity);
    if (cityResults.length > 0) return { results: cityResults, usedFallback: true };
  }

  const stripped = stripGenericWords(trimmed);
  if (stripped && normalizeForCompare(stripped) !== normalizeForCompare(trimmed)) {
    const strippedWithCity = withDakarSenegal(stripped);
    const strippedResults = await rawSearch(strippedWithCity);
    if (strippedResults.length > 0) return { results: strippedResults, usedFallback: true };
  }

  return { results: [], usedFallback: false };
}
