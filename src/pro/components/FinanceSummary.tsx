import { formatFCFA } from '../data';

interface FinanceSummaryProps {
  rows: { label: string; value: number; hint?: string; accent?: boolean }[];
}

export default function FinanceSummary({ rows }: FinanceSummaryProps) {
  return (
    <div className="card overflow-hidden">
      {rows.map((row, i) => (
        <div
          key={i}
          className={`flex items-center justify-between px-5 py-4 ${i > 0 ? 'border-t border-line' : ''} ${row.accent ? 'bg-burgundy/5' : ''}`}
        >
          <div>
            <span className={`text-sm ${row.accent ? 'font-medium text-burgundy' : 'text-ink/60'}`}>{row.label}</span>
            {row.hint && <p className="text-xs text-ink/40 mt-0.5">{row.hint}</p>}
          </div>
          <span className={`font-semibold ${row.accent ? 'text-lg font-display text-burgundy' : 'text-sm text-ink'}`}>
            {formatFCFA(row.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
