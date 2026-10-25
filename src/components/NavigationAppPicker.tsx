import { Navigation, X } from 'lucide-react';
import { navigationUrl, navigationAppLabels, type GeoPoint, type NavigationApp } from '@/utils/geo';

const APPS: NavigationApp[] = ['google', 'apple', 'waze'];

interface Props {
  point: GeoPoint;
  label?: string;
  onClose: () => void;
}

// Lets the driver pick whichever navigation app they actually have — never
// guesses one from the platform. Each option is a plain deep link; the OS
// handles opening the installed app or falling back on its own.
export default function NavigationAppPicker({ point, label, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold text-ink"><Navigation size={16} className="text-burgundy" /> Ouvrir l'itinéraire avec</h3>
          <button onClick={onClose} className="text-ink/40 hover:text-ink"><X size={18} /></button>
        </div>
        <div className="space-y-2">
          {APPS.map((app) => (
            <a
              key={app}
              href={navigationUrl(app, point, label)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="block w-full rounded-lg border border-line px-4 py-3 text-center text-sm font-medium text-ink hover:border-ink/30 hover:bg-cream/50"
            >
              {navigationAppLabels[app]}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
