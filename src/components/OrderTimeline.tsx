import { Check, Circle } from 'lucide-react';
import type { DeliveryStepStatus, PickupStepStatus } from '@/store/AppContext';

const deliverySteps: { id: DeliveryStepStatus; label: string }[] = [
  { id: 'confirmed', label: 'Commande confirmée' },
  { id: 'preparing', label: 'En préparation' },
  { id: 'ready', label: 'Prête' },
  { id: 'delivering', label: 'En livraison' },
  { id: 'delivered', label: 'Livrée' },
];

const pickupSteps: { id: PickupStepStatus; label: string }[] = [
  { id: 'preparing', label: 'En préparation' },
  { id: 'ready_for_pickup', label: 'Prête à récupérer' },
  { id: 'picked_up', label: 'Récupérée' },
];

interface Step { id: string; label: string; }

function Timeline({ steps, currentIdx }: { steps: Step[]; currentIdx: number }) {
  return (
    <div className="space-y-1">
      {steps.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={step.id} className="flex items-start gap-3.5">
            <div className="flex flex-col items-center">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors ${done ? 'border-burgundy bg-burgundy/10 text-burgundy' : active ? 'border-burgundy bg-burgundy text-white' : 'border-line text-ink/30'}`}>
                {done ? <Check size={16} strokeWidth={3} /> : active ? <span className="h-2.5 w-2.5 rounded-full bg-white" /> : <Circle size={14} />}
              </div>
              {i < steps.length - 1 && <div className={`h-8 w-0.5 ${done ? 'bg-burgundy' : 'bg-line'}`} />}
            </div>
            <div className="pt-1.5 pb-8"><p className={`text-sm font-medium ${active ? 'text-burgundy' : done ? 'text-ink' : 'text-ink/40'}`}>{step.label}</p></div>
          </div>
        );
      })}
    </div>
  );
}

export function DeliveryTimeline({ status }: { status: DeliveryStepStatus }) {
  // Map picked_up to delivering since the customer-facing flow no longer has a separate pickup step
  const mappedStatus = status === 'picked_up' ? 'delivering' : status;
  const currentIdx = deliverySteps.findIndex((s) => s.id === mappedStatus);
  return <Timeline steps={deliverySteps} currentIdx={currentIdx} />;
}

export function PickupTimeline({ status }: { status: PickupStepStatus }) {
  const currentIdx = pickupSteps.findIndex((s) => s.id === status);
  return <Timeline steps={pickupSteps} currentIdx={currentIdx} />;
}

export default function OrderTimeline({ status }: { status: DeliveryStepStatus }) {
  return <DeliveryTimeline status={status} />;
}
