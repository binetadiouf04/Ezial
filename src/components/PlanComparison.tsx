import { Check, Crown, Minus } from 'lucide-react';
import { PLAN_COMPARISON, PLUS_PLAN_NAME } from '@/data/subscriptionPlans';

// Free vs Ezial Plus comparison table (rows in src/shared/plans.js). A
// boolean renders as ✓ / — with a text alternative for screen readers. A
// fixed three-column layout that wraps inside its cells, so it never
// overflows horizontally, down to 360 px wide.

function Cell({ value, plus }: { value: string | boolean; plus?: boolean }) {
  if (typeof value === 'boolean') {
    return value ? (
      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${plus ? 'bg-burgundy text-white' : 'bg-ink/10 text-ink/70'}`}>
        <Check size={14} strokeWidth={2.5} aria-hidden="true" />
        <span className="sr-only">Inclus</span>
      </span>
    ) : (
      <span className="inline-flex h-6 w-6 items-center justify-center text-ink/30">
        <Minus size={14} aria-hidden="true" />
        <span className="sr-only">Non inclus</span>
      </span>
    );
  }
  // "6 000 FCFA / 3 mois ou 20 000 FCFA / an": one option per line.
  const options = value.split(' ou ');
  return (
    <span className={plus ? 'font-semibold text-burgundy' : 'text-ink/70'}>
      {options.map((option, i) => (
        <span key={option} className="block">{i > 0 ? `ou ${option}` : option}</span>
      ))}
    </span>
  );
}

export default function PlanComparison({ className = '' }: { className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-line bg-white ${className}`}>
      <table className="w-full table-fixed border-collapse text-left text-[13px] leading-snug sm:text-sm">
        <caption className="sr-only">Comparatif des forfaits Ezial Free et {PLUS_PLAN_NAME}</caption>
        <colgroup>
          <col className="w-[44%]" />
          <col className="w-[21%] sm:w-[24%]" />
          <col className="w-[35%] sm:w-[32%]" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="px-3 py-3.5 text-xs font-medium uppercase tracking-wider text-ink/40 sm:px-5">
              <span className="sr-only">Avantage</span>
            </th>
            <th scope="col" className="px-2 py-3.5 text-center font-display text-base font-semibold text-ink sm:px-4 sm:text-lg">Free</th>
            <th scope="col" className="bg-burgundy px-2 py-3.5 text-center font-display text-base font-semibold text-white sm:px-4 sm:text-lg">
              <span className="inline-flex items-center justify-center gap-1.5">
                <Crown size={15} className="hidden text-champagne sm:inline" aria-hidden="true" />
                {PLUS_PLAN_NAME}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {PLAN_COMPARISON.map((row, i) => (
            <tr key={row.label} className={i > 0 ? 'border-t border-line' : ''}>
              <th scope="row" className="px-3 py-3.5 font-medium text-ink sm:px-5">{row.label}</th>
              <td className="break-words px-2 py-3.5 text-center sm:px-4"><Cell value={row.free} /></td>
              <td className="break-words bg-burgundy/[0.06] px-2 py-3.5 text-center sm:px-4"><Cell value={row.plus} plus /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
