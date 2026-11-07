import { PLUS_ANNUAL_DISCOUNT_PERCENT, type BillingPeriod } from '@/data/subscriptionPlans';

// "Tous les 3 mois" / "Annuel −17 %" switch for Ezial Plus. `tone` follows
// the surface it sits on: 'dark' on the burgundy pricing card, 'light' on
// white cards (payment page).
export default function BillingPeriodToggle({
  value, onChange, tone = 'light',
}: { value: BillingPeriod; onChange: (period: BillingPeriod) => void; tone?: 'light' | 'dark' }) {
  const options: { id: BillingPeriod; label: string }[] = [
    { id: 'quarterly', label: 'Tous les 3 mois' },
    { id: 'annual', label: 'Annuel' },
  ];
  const track = tone === 'dark' ? 'bg-white/10' : 'bg-cream';
  const selected = tone === 'dark' ? 'bg-white text-burgundy shadow-sm' : 'bg-white text-ink shadow-sm';
  const idle = tone === 'dark' ? 'text-white/75 hover:text-white' : 'text-ink/55 hover:text-ink';
  const badge = (isSelected: boolean) => (tone === 'dark' && !isSelected ? 'bg-white/15 text-white' : 'bg-burgundy/10 text-burgundy');

  return (
    <div role="radiogroup" aria-label="Périodicité de paiement" className={`grid grid-cols-2 gap-1 rounded-full p-1 ${track}`}>
      {options.map((option) => {
        const isSelected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(option.id)}
            className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${isSelected ? selected : idle}`}
          >
            {option.label}
            {option.id === 'annual' && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${badge(isSelected)}`}>−{PLUS_ANNUAL_DISCOUNT_PERCENT} %</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
