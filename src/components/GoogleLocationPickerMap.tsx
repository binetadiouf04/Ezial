import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/googleMaps';

// Dakar city center — used only as a neutral starting view when no
// coordinate has been set yet. Never saved as a real value on its own.
const DAKAR_CENTER = { lat: 14.6928, lng: -17.4467 };

interface Props {
  // The point to show. null means "nothing chosen yet" — the map falls
  // back to the Dakar-centered default view instead of jumping around.
  position: { lat: number; lng: number } | null;
  onChange: (lat: number, lng: number) => void;
}

// Drop-in replacement for the Leaflet-based LocationPickerMap — same
// props, same drag/click-to-place behavior, Google's own map tiles
// instead of OpenStreetMap's (now that Maps JavaScript API is enabled and
// billed for the project).
export default function GoogleLocationPickerMap({ position, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const start = position ?? DAKAR_CENTER;
        const map = new google.maps.Map(containerRef.current, {
          center: start,
          zoom: position ? 15 : 12,
          mapId: 'EZIAL_LOCATION_PICKER',
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
        const marker = new google.maps.marker.AdvancedMarkerElement({ map, position: start, gmpDraggable: true });
        marker.addListener('dragend', () => {
          const pos = marker.position;
          if (pos) onChangeRef.current(Number(pos.lat), Number(pos.lng));
        });
        map.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          marker.position = e.latLng;
          onChangeRef.current(e.latLng.lat(), e.latLng.lng());
        });
        mapRef.current = map;
        markerRef.current = marker;
      })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
    // Mounted once — subsequent position updates (e.g. typed lat/lng) are
    // applied by the effect below instead of re-creating the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !position) return;
    const current = markerRef.current.position;
    const currentLat = current ? Number((current as google.maps.LatLng).lat ?? (current as google.maps.LatLngLiteral).lat) : null;
    const currentLng = current ? Number((current as google.maps.LatLng).lng ?? (current as google.maps.LatLngLiteral).lng) : null;
    if (currentLat === null || Math.abs(currentLat - position.lat) > 1e-9 || Math.abs((currentLng ?? 0) - position.lng) > 1e-9) {
      markerRef.current.position = position;
      mapRef.current.panTo(position);
    }
  }, [position]);

  if (loadError) {
    return <div className="flex h-56 w-full items-center justify-center rounded-lg border border-line bg-cream/40 text-xs text-ink/45">Carte indisponible. Réessayez dans un instant.</div>;
  }

  return <div ref={containerRef} className="h-56 w-full overflow-hidden rounded-lg border border-line" />;
}
