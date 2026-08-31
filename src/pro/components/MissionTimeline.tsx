import { Check, Package, Truck, MapPin, User } from 'lucide-react';
import type { Mission, DeliveryStep } from '../data';

interface MissionTimelineProps {
  mission: Mission;
}

const stepIcons: Record<DeliveryStep, typeof Check> = {
  accepted: Check,
  to_collection: Truck,
  collected: Package,
  all_collected: Package,
  to_customer: Truck,
  arrived: MapPin,
  delivered: Check,
};

const stepLabels: Record<DeliveryStep, string> = {
  accepted: 'Mission acceptée',
  to_collection: 'En route vers la collecte',
  collected: 'Colis récupéré',
  all_collected: 'Tous les colis collectés',
  to_customer: 'En route vers le client',
  arrived: 'Arrivé chez le client',
  delivered: 'Livré',
};

const stepOrder: DeliveryStep[] = ['accepted', 'to_collection', 'collected', 'all_collected', 'to_customer', 'arrived', 'delivered'];

export default function MissionTimeline({ mission }: MissionTimelineProps) {
  const currentIdx = stepOrder.indexOf(mission.step);

  return (
    <div className="space-y-0.5">
      {/* Collection stops */}
      {mission.collections.map((c, i) => (
        <div key={c.shopId} className="flex items-start gap-3 mb-4">
          <div className="flex flex-col items-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-burgundy bg-burgundy/10 text-burgundy text-xs font-semibold">
              {i + 1}
            </div>
            {i < mission.collections.length - 1 && <div className="h-6 w-0.5 bg-line" />}
          </div>
          <div className="pb-2">
            <p className="text-sm font-medium text-ink">{c.shopName}</p>
            <p className="text-xs text-ink/50 flex items-center gap-1"><MapPin size={11} /> {c.area}</p>
          </div>
        </div>
      ))}

      {/* Delivery steps */}
      <div className="border-t border-line pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/40 mb-3">Progression</p>
        <div className="space-y-0.5">
          {stepOrder.map((step, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            const Icon = stepIcons[step];
            return (
              <div key={step} className="flex items-center gap-3 py-1.5">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${
                    done || active ? 'border-burgundy bg-burgundy text-white' : 'border-line text-ink/30'
                  }`}
                >
                  {done ? <Check size={13} strokeWidth={3} /> : <Icon size={13} />}
                </div>
                <span className={`text-sm ${active ? 'font-medium text-burgundy' : done ? 'text-ink' : 'text-ink/40'}`}>
                  {stepLabels[step]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Customer info */}
      <div className="mt-4 rounded-xl bg-cream p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/40 mb-2">Livraison client</p>
        <div className="flex items-center gap-2 text-sm text-ink/70">
          <User size={15} className="text-ink/40" />
          <span className="font-medium text-ink">{mission.customerName}</span>
        </div>
        <p className="mt-1 text-xs text-ink/50 flex items-center gap-1"><MapPin size={11} /> {mission.destination}</p>
      </div>
    </div>
  );
}
