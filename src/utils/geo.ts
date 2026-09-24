// Shared driver geo helpers — distance estimate + native navigation
// deep-linking. No paid API: distance is computed locally from GPS
// coordinates (haversine, straight-line), and "itinerary" always opens the
// phone's own maps app rather than a routing engine Ezial would have to pay
// for. This is explicitly an estimate, never presented as an exact route.

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;

/** Straight-line distance between two GPS points, in kilometres. */
export function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(h));
}

/** "6,4 km" — one decimal, French locale comma. Never claims to be a road distance. */
export function formatDistanceKm(km: number): string {
  return `${km.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

// Detects the platform once per session — cheap, and the result never
// changes mid-session, so no need to recompute per call.
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Opens the phone's own navigation app pointed at exact GPS coordinates —
 * never a routing engine Ezial operates or pays for. iOS opens Apple Maps
 * (universally installed there); everywhere else opens Google Maps, which
 * itself falls back to a browser map view when the native app isn't
 * installed — never a dead link.
 */
export function openNavigationTo(point: GeoPoint, label?: string): void {
  const { latitude, longitude } = point;
  const encodedLabel = label ? encodeURIComponent(label) : '';
  const url = isIOS()
    ? `https://maps.apple.com/?daddr=${latitude},${longitude}${label ? `&q=${encodedLabel}` : ''}`
    : `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}${label ? `&destination_place_id=&q=${encodedLabel}` : ''}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** tel: link target — lets the phone's own dialer handle formatting/calling. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^0-9+]/g, '')}`;
}
