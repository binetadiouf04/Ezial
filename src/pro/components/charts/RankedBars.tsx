export interface RankedRow {
  key: string;
  name: string;
  detail?: string;
  value: number;
  valueLabel: string;
}

// Classement en barres horizontales fines, une seule teinte : la longueur
// porte la valeur, le chiffre est écrit à côté (jamais la couleur seule).
export default function RankedBars({ rows, emptyLabel }: { rows: RankedRow[]; emptyLabel: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-ink/45">{emptyLabel}</p>;
  const max = Math.max(...rows.map((r) => r.value), 0);
  return (
    <ol className="space-y-3">
      {rows.map((row, i) => (
        <li key={row.key} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm text-ink">
              <span className="mr-1.5 text-xs tabular-nums text-ink/35">{i + 1}</span>
              <span className="font-medium">{row.name}</span>
            </p>
            <p className="flex-shrink-0 text-sm font-semibold tabular-nums text-ink">{row.valueLabel}</p>
          </div>
          {row.detail && <p className="mt-0.5 truncate pl-[18px] text-xs text-ink/45">{row.detail}</p>}
          <div className="mt-1.5 h-2" aria-hidden="true">
            <div
              className="h-full rounded-r-[4px] bg-burgundy-ruby"
              style={{ width: `${max > 0 ? Math.max(1.5, (row.value / max) * 100) : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
