import { Check } from 'lucide-react';

export interface OrderStep { id: string; label: string; }

// Indicateur d'étapes : pastilles reliées par un trait fin, nom de l'étape
// dessous. Étapes terminées : pastille bordeaux avec coche ; étape en cours :
// pastille bordeaux numérotée, libellé en gras ; étapes suivantes : contour gris.
export default function CheckoutSteps({ steps, current }: { steps: OrderStep[]; current: number }) {
  return (
    <ol className="flex items-start" aria-label="Étapes de la commande">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={step.id} aria-current={active ? 'step' : undefined} className="flex flex-1 flex-col items-center last:flex-none">
            <div className="flex w-full items-center">
              <div className={`h-px flex-1 ${i === 0 ? 'bg-transparent' : i <= current ? 'bg-burgundy' : 'bg-ink/20'}`} />
              <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${done || active ? 'border-burgundy bg-burgundy text-white' : 'border-ink/25 bg-white text-ink/45'}`}>
                {done ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : i + 1}
              </span>
              <div className={`h-px flex-1 ${i === steps.length - 1 ? 'bg-transparent' : i < current ? 'bg-burgundy' : 'bg-ink/20'}`} />
            </div>
            <span className={`mt-1.5 text-[11px] ${active ? 'font-semibold text-ink' : done ? 'text-ink/70' : 'text-ink/40'}`}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
