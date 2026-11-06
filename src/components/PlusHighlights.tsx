import { PLUS_HIGHLIGHTS } from '@/data/subscriptionPlans';

// The four headline advantages of Ezial Plus (texts in src/shared/plans.js).
// Stub: final design by the Ezial Plus work.
export default function PlusHighlights({ className = '' }: { className?: string; tone?: 'light' | 'dark' }) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${className}`}>
      {PLUS_HIGHLIGHTS.map((h) => (
        <div key={h.id} className="rounded-2xl border border-line bg-white p-5">
          <p className="font-display text-lg font-semibold text-ink">{h.title}</p>
          <p className="mt-1.5 text-sm text-ink/70">{h.text}</p>
          {h.note && <p className="mt-2 text-xs text-ink/45">{h.note}</p>}
        </div>
      ))}
    </div>
  );
}
