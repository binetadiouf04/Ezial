import { Check } from 'lucide-react';

export interface OrderStep { id: string; label: string; }

export default function CheckoutSteps({ steps, current }: { steps: OrderStep[]; current: number }) {
  return (
    <div className="flex items-center">
      {steps.map((step, i) => { const done = i < current; const active = i === current; return (
        <div key={step.id} className="flex items-center flex-1 last:flex-none">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${done ? 'border-burgundy bg-burgundy text-white' : active ? 'border-burgundy text-burgundy' : 'border-line text-ink/40'}`}>{done ? <Check size={15} strokeWidth={3} /> : i + 1}</div>
            <span className={`text-sm font-medium hidden sm:inline ${active ? 'text-burgundy' : done ? 'text-ink' : 'text-ink/40'}`}>{step.label}</span>
          </div>
          {i < steps.length - 1 && <div className={`mx-3 h-0.5 flex-1 rounded-full ${done ? 'bg-burgundy' : 'bg-line'}`} />}
        </div>
      ); })}
    </div>
  );
}
