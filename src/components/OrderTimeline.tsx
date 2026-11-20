import { Check } from 'lucide-react';
import type { DeliveryStepStatus, PickupStepStatus } from '@/store/AppContext';

// Frise « Où en est ma commande ? » : étapes réelles de la commande (préparation par la
// boutique, livreur Ezial, remise contre le code), une phrase simple sous l'étape en cours.
// Aucun délai ni promesse non vérifiée.

interface Step { id: string; label: string; hint: string }

const deliverySteps: Step[] = [
  { id: 'confirmed', label: 'Commande reçue', hint: 'La boutique a bien reçu votre commande.' },
  { id: 'preparing', label: 'En préparation', hint: 'La boutique prépare vos articles.' },
  { id: 'ready', label: 'Prête', hint: 'Un livreur Ezial vient la récupérer.' },
  { id: 'delivering', label: 'En route', hint: 'Le livreur vous l’apporte.' },
  { id: 'delivered', label: 'Livrée', hint: 'Votre colis vous a été remis.' },
];

const pickupSteps: Step[] = [
  { id: 'preparing', label: 'En préparation', hint: 'La boutique prépare vos articles.' },
  { id: 'ready_for_pickup', label: 'Prête à retirer', hint: 'Présentez votre code de retrait à la boutique.' },
  { id: 'picked_up', label: 'Récupérée', hint: 'Vous avez récupéré votre commande.' },
];

function Timeline({ steps, currentIdx }: { steps: Step[]; currentIdx: number }) {
  return (
    <ol className="space-y-0">
      {steps.map((step, i) => {
        const done = i < currentIdx || (i === currentIdx && i === steps.length - 1);
        const active = i === currentIdx;
        const last = i === steps.length - 1;
        return (
          <li key={step.id} className="flex gap-3" aria-current={active ? 'step' : undefined}>
            <div className="flex flex-col items-center">
              <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 ${done ? 'border-burgundy bg-burgundy text-white' : active ? 'border-burgundy bg-white' : 'border-line bg-white'}`}>
                {done ? <Check size={13} strokeWidth={3} /> : active ? <span className="h-2 w-2 rounded-full bg-burgundy" /> : null}
              </span>
              {!last && <span className={`w-0.5 flex-1 ${i < currentIdx ? 'bg-burgundy' : 'bg-line'}`} style={{ minHeight: 18 }} />}
            </div>
            <div className={last ? 'pb-0' : 'pb-4'}>
              <p className={`text-sm leading-6 ${active ? 'font-semibold text-ink' : done ? 'text-ink/70' : 'text-ink/40'}`}>{step.label}</p>
              {active && <p className="text-sm text-ink/60">{step.hint}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function DeliveryTimeline({ status }: { status: DeliveryStepStatus }) {
  // Le client ne voit pas d'étape « récupérée par le livreur » distincte : c'est « En route ».
  const mappedStatus = status === 'picked_up' ? 'delivering' : status;
  const currentIdx = Math.max(0, deliverySteps.findIndex((s) => s.id === mappedStatus));
  return <Timeline steps={deliverySteps} currentIdx={currentIdx} />;
}

export function PickupTimeline({ status }: { status: PickupStepStatus }) {
  const currentIdx = Math.max(0, pickupSteps.findIndex((s) => s.id === status));
  return <Timeline steps={pickupSteps} currentIdx={currentIdx} />;
}

export default function OrderTimeline({ status }: { status: DeliveryStepStatus }) {
  return <DeliveryTimeline status={status} />;
}
