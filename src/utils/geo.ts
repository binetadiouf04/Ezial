// Shared driver geo helpers — distance estimate + native navigation
// deep-linking. No paid API: distance is computed locally from GPS
// coordinates (haversine, straight-line), and "itinerary" always opens the
// driver's own maps app rather than a routing engine Ezial would have to pay
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

export type NavigationApp = 'google' | 'apple' | 'waze';

export const navigationAppLabels: Record<NavigationApp, string> = {
  google: 'Google Maps',
  apple: 'Plans (Apple)',
  waze: 'Waze',
};

/**
 * Deep link for one specific navigation app, pointed at exact GPS
 * coordinates — never a routing engine Ezial operates or pays for. Each
 * link falls back to that app's own web/store behavior when the native app
 * isn't installed on the driver's phone, so there's never a dead link —
 * which app is actually installed is for the driver to know, not us, hence
 * letting them pick rather than guessing from the platform.
 */
export function navigationUrl(app: NavigationApp, point: GeoPoint, label?: string): string {
  const { latitude, longitude } = point;
  const encodedLabel = label ? encodeURIComponent(label) : '';
  switch (app) {
    case 'apple':
      return `https://maps.apple.com/?daddr=${latitude},${longitude}${label ? `&q=${encodedLabel}` : ''}`;
    case 'waze':
      return `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`;
    case 'google':
    default:
      return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}${label ? `&destination_place_id=&q=${encodedLabel}` : ''}`;
  }
}

/** tel: link target — lets the phone's own dialer handle formatting/calling. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^0-9+]/g, '')}`;
}
