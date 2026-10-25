// Supabase Edge Function — the ONLY place that ever calls Google Routes
// API. Computes the real road distance for a cart's delivery route (shop
// -> shop -> ... -> client, in the exact order the shops appear in the
// cart — never re-optimized, so it stays comparable to create_order()'s
// own fixed-order Haversine distance) and the resulting fee, using the
// same calculate_delivery_fee() Postgres function the order itself uses —
// one formula, never duplicated. The frontend uses this for the live
// checkout estimate; create_order() only ever trusts the distance this
// returns after sanity-checking it against its own Haversine distance
// (see the migration), so a tampered or stale quote can never under-charge
// a delivery.
//
// GOOGLE_MAPS_SERVER_API_KEY never reaches the frontend — this is the only
// code that reads it.
//
// Deploy: supabase functions deploy calculate-delivery-fee
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GOOGLE_MAPS_SERVER_API_KEY = Deno.env.get('GOOGLE_MAPS_SERVER_API_KEY') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// A cart realistically spans a handful of shops at most — this is purely a
// sanity cap (reject obviously malformed/abusive requests before spending
// a Google call), not a real product limit.
const MAX_SHOPS = 6;
// How long a (shop set, rounded client point) result stays reusable —
// avoids a fresh Google call every time the customer nudges the map pin or
// re-renders the checkout page.
const CACHE_TTL_MINUTES = 15;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function cacheKey(shopIds: string[], lat: number, lng: number): string {
  // Shop order matters for the route itself, but not for whether this
  // exact route was already priced — sorted here only for a stable cache
  // key, the real (unsorted) order is still what's sent to Routes API.
  return `${[...shopIds].sort().join(',')}|${round3(lat)},${round3(lng)}`;
}

interface ShopPoint { lat: number; lng: number }

async function routesApiDistanceKm(shopPoints: ShopPoint[], client: ShopPoint): Promise<number> {
  const origin = shopPoints[0];
  const intermediates = shopPoints.slice(1);
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_SERVER_API_KEY,
      'X-Goog-FieldMask': 'routes.distanceMeters',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: client.lat, longitude: client.lng } } },
      intermediates: intermediates.map((p) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } })),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      // Never reordered — must stay the same fixed shop-then-client route
      // create_order() computes its own Haversine distance for, so the two
      // stay comparable.
      optimizeWaypointOrder: false,
    }),
  });
  if (!res.ok) throw new Error(`Routes API request failed: ${res.status}`);
  const data = await res.json();
  const meters = data?.routes?.[0]?.distanceMeters;
  if (typeof meters !== 'number' || meters <= 0) throw new Error('Routes API returned no usable distance.');
  return meters / 1000;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  let body: { shopIds?: unknown; clientLat?: unknown; clientLng?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Requête invalide.' }, 400);
  }

  const shopIds = Array.isArray(body.shopIds) ? body.shopIds.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
  const clientLat = typeof body.clientLat === 'number' ? body.clientLat : NaN;
  const clientLng = typeof body.clientLng === 'number' ? body.clientLng : NaN;

  if (shopIds.length === 0 || shopIds.length > MAX_SHOPS) return json({ error: 'Nombre de boutiques invalide.' }, 400);
  if (!Number.isFinite(clientLat) || clientLat < -90 || clientLat > 90) return json({ error: 'Latitude invalide.' }, 400);
  if (!Number.isFinite(clientLng) || clientLng < -180 || clientLng > 180) return json({ error: 'Longitude invalide.' }, 400);
  if (!GOOGLE_MAPS_SERVER_API_KEY) return json({ error: 'Service de livraison indisponible.' }, 500);

  // Shop coordinates are always re-read here, in the caller's requested
  // order — never trusted from the client, exactly like create_order()
  // itself never trusts client-supplied shop coordinates.
  const { data: shopRows, error: shopsError } = await admin
    .from('shops')
    .select('id, latitude, longitude')
    .in('id', shopIds)
    .eq('status', 'active');
  if (shopsError) return json({ error: 'Boutiques introuvables.' }, 500);

  const byId = new Map((shopRows ?? []).map((r) => [r.id as string, r]));
  const shopPoints: ShopPoint[] = [];
  for (const id of shopIds) {
    const row = byId.get(id);
    if (!row || row.latitude == null || row.longitude == null) {
      return json({ error: 'Position de boutique manquante.' }, 422);
    }
    shopPoints.push({ lat: row.latitude as number, lng: row.longitude as number });
  }

  const key = cacheKey(shopIds, clientLat, clientLng);
  const { data: cached } = await admin
    .from('delivery_fee_cache')
    .select('distance_km, computed_at')
    .eq('id', key)
    .maybeSingle();

  let distanceKm: number;
  const cacheIsFresh = cached && Date.now() - new Date(cached.computed_at as string).getTime() < CACHE_TTL_MINUTES * 60_000;
  if (cacheIsFresh) {
    distanceKm = cached!.distance_km as number;
  } else {
    try {
      distanceKm = await routesApiDistanceKm(shopPoints, { lat: clientLat, lng: clientLng });
    } catch {
      return json({ error: 'Calcul de distance indisponible pour le moment.' }, 502);
    }
    await admin.from('delivery_fee_cache').upsert({ id: key, distance_km: distanceKm, computed_at: new Date().toISOString() });
    // Opportunistic cleanup — bounded cost, runs only on an actual cache
    // miss, keeps the table from growing unbounded without needing a
    // separate scheduled job.
    await admin.from('delivery_fee_cache').delete().lt('computed_at', new Date(Date.now() - 24 * 60 * 60_000).toISOString());
  }

  const { data: feeData, error: feeError } = await admin.rpc('calculate_delivery_fee', { distance_km: distanceKm });
  if (feeError || typeof feeData !== 'number') return json({ error: 'Calcul du tarif indisponible.' }, 500);

  return json({ distanceKm, feeFcfa: feeData });
});
