import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Dakar city center — used only as a neutral starting view when no
// coordinate has been set yet. Never saved as a real value on its own.
const DAKAR_CENTER: [number, number] = [14.6928, -17.4467];

interface Props {
  // The point to show. null means "nothing chosen yet" — the map falls
  // back to the Dakar-centered default view instead of jumping around.
  position: { lat: number; lng: number } | null;
  onChange: (lat: number, lng: number) => void;
}

// A plain CSS dot instead of Leaflet's default marker image — sidesteps the
// well-known Vite/bundler issue where Leaflet's default icon URLs resolve
// to missing assets, without needing any icon file at all.
const markerIcon = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#7a2340;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.25);"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export default function LocationPickerMap({ position, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const start = position ? [position.lat, position.lng] as [number, number] : DAKAR_CENTER;
    const map = L.map(containerRef.current).setView(start, position ? 15 : 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker(start, { draggable: true, icon: markerIcon }).addTo(map);
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onChangeRef.current(pos.lat, pos.lng);
    });
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      onChangeRef.current(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;
    markerRef.current = marker;

    // The container isn't necessarily at its final size the instant this
    // effect runs (e.g. right after a conditional re-render on mobile) —
    // Leaflet caches whatever size it reads at creation time, which can
    // otherwise leave the map mispositioned/oversized until the user
    // interacts with it. A re-measure on the next frame, plus on resize
    // (orientation change), keeps it correctly sized.
    const raf = requestAnimationFrame(() => map.invalidateSize());
    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Mounted once — subsequent position updates (e.g. typed lat/lng) are
    // applied by the effect below instead of re-creating the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !position) return;
    const current = markerRef.current.getLatLng();
    if (Math.abs(current.lat - position.lat) > 1e-9 || Math.abs(current.lng - position.lng) > 1e-9) {
      markerRef.current.setLatLng([position.lat, position.lng]);
      mapRef.current.panTo([position.lat, position.lng]);
    }
  }, [position]);

  return <div ref={containerRef} className="h-56 w-full overflow-hidden rounded-lg border border-line" />;
}
