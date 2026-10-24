import { supabase } from './supabaseClient';

export interface DeliveryFeeQuote {
  distanceKm: number;
  feeFcfa: number;
}

// Calls the calculate-delivery-fee Edge Function (the only place that ever
// calls Google Routes API) for a live, real-road-distance estimate before
// checkout. Returns null on any failure — the caller falls back to the
// existing Haversine-only estimate (deliveryEstimate.ts) and simply omits
// routeDistanceKm from the order payload; create_order() already handles
// that exact case by using its own Haversine distance, so a failure here
// never blocks checkout.
export async function fetchDeliveryFeeQuote(shopIds: string[], clientLat: number, clientLng: number): Promise<DeliveryFeeQuote | null> {
  if (shopIds.length === 0) return null;
  try {
    const { data, error } = await supabase.functions.invoke('calculate-delivery-fee', {
      body: { shopIds, clientLat, clientLng },
    });
    if (error || !data || typeof data.distanceKm !== 'number' || typeof data.feeFcfa !== 'number') return null;
    return { distanceKm: data.distanceKm, feeFcfa: data.feeFcfa };
  } catch {
    return null;
  }
}
