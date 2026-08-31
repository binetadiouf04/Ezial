import type { Mission } from '../data';
import { MapPin, Clock, Navigation, Store, ChevronRight } from 'lucide-react';

interface MissionCardProps {
  mission: Mission;
  onClick?: () => void;
  showEarnings?: boolean;
}

export default function MissionCard({ mission, onClick, showEarnings }: MissionCardProps) {
  return (
    <button
      onClick={onClick}
      className="card w-full p-4 text-left transition-all hover:border-burgundy/30 hover:card-shadow"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-semibold text-ink">MISSION {mission.id}</span>
        <span className="text-xs text-ink/40">{mission.collections.length} collectes</span>
      </div>

      <div className="mt-3 space-y-1.5">
        {mission.collections.map((c) => (
          <div key={c.shopId} className="flex items-center gap-2 text-sm text-ink/70">
            <Store size={14} className="text-ink/40" />
            <span className="font-medium text-ink/80">{c.shopName}</span>
            <span className="text-ink/40">·</span>
            <span className="flex items-center gap-1 text-xs text-ink/50"><MapPin size={11} /> {c.area}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-line pt-3 text-xs text-ink/50">
        <span className="flex items-center gap-1"><Navigation size={12} /> {mission.distance}</span>
        <span className="flex items-center gap-1"><Clock size={12} /> {mission.slot}</span>
        <span className="flex items-center gap-1"><MapPin size={12} /> → {mission.destination}</span>
        {showEarnings && <span className="ml-auto text-sm font-semibold text-ink">{mission.earnings.toLocaleString('fr-FR')} F</span>}
      </div>

      {onClick && <ChevronRight size={16} className="absolute right-4 top-4 text-ink/20" />}
    </button>
  );
}
