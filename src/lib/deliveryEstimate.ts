// Frontend-only MIRROR of create_order()'s delivery-fee formula, used
// solely to show a live estimate before checkout. The amount actually
// charged always comes from create_order()'s own response
// (order.delivery_fee) — this file never feeds into the payload sent to
// the RPC and never overrides that server-side value.

export interface LatLng {
  lat: number;
  lng: number;
}

const FEE_PER_KM = 100;
const MIN_FEE = 800;
const MAX_FEE = 4000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Great-circle distance in km — same Haversine approximation the backend
// currently uses (see migration comments: flagged there as temporary).
function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Route: first delivery shop -> next delivery shops -> client, in that
// order — never the delivery person's own starting position. Mirrors the
// backend's route shape exactly; shopCoords should be in the same order
// the shops appear in the cart/fulfillment list.
export function estimateDeliveryFee(shopCoords: LatLng[], client: LatLng): number | null {
  if (shopCoords.length === 0) return null;
  let totalKm = 0;
  for (let i = 0; i < shopCoords.length - 1; i++) {
    totalKm += haversineKm(shopCoords[i], shopCoords[i + 1]);
  }
  totalKm += haversineKm(shopCoords[shopCoords.length - 1], client);
  const fee = Math.round(totalKm * FEE_PER_KM);
  return Math.min(MAX_FEE, Math.max(MIN_FEE, fee));
}

export const DELIVERY_FEE_FLOOR = MIN_FEE;
