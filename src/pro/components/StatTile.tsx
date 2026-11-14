import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

interface StatTileProps {
  label: string;
  value: ReactNode;
  /** Variation en % par rapport à la période précédente ; null = non comparable. */
  change?: number | null;
  hint?: string;
  icon?: ReactNode;
}

// Chiffre clé : libellé, valeur, variation éventuelle. La variation porte une
// flèche et un signe en plus de sa couleur.
export default function StatTile({ label, value, change, hint, icon }: StatTileProps) {
  const hasChange = typeof change === 'number';
  const up = hasChange && change > 0;
  const down = hasChange && change < 0;
  const ChangeIcon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <div className="min-w-0 rounded-xl border border-line bg-white px-3.5 py-3 sm:px-4 sm:py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-ink/55">{label}</p>
        {icon && <span className="flex-shrink-0 text-burgundy/60">{icon}</span>}
      </div>
      <p className="mt-1.5 whitespace-nowrap text-[19px] font-semibold leading-tight tracking-tightish text-ink sm:text-[22px]">{value}</p>
      {hasChange ? (
        <p className={`mt-1 flex items-center gap-1 whitespace-nowrap text-xs ${up ? 'text-green-700' : down ? 'text-red-700' : 'text-ink/50'}`}>
          <ChangeIcon size={13} className="flex-shrink-0" aria-hidden="true" />
          <span className="font-medium">{change > 0 ? '+' : ''}{change.toLocaleString('fr-FR')} %</span>
          <span className="truncate text-ink/45"><span className="sm:hidden">vs préc.</span><span className="hidden sm:inline">vs période précédente</span></span>
        </p>
      ) : hint ? (
        <p className="mt-1 truncate text-xs text-ink/45">{hint}</p>
      ) : null}
    </div>
  );
}
