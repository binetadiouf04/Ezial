import { PLAN_COMPARISON, PLUS_PLAN_NAME } from '@/data/subscriptionPlans';

// Free vs Ezial Plus comparison table (rows in src/shared/plans.js).
// Stub: final design by the Ezial Plus work.
export default function PlanComparison({ className = '' }: { className?: string }) {
  const cell = (v: string | boolean) => (typeof v === 'boolean' ? (v ? '✓' : '—') : v);
  return (
    <table className={`w-full text-sm ${className}`}>
      <thead><tr><th className="text-left" /><th>Free</th><th>{PLUS_PLAN_NAME}</th></tr></thead>
      <tbody>
        {PLAN_COMPARISON.map((r) => (
          <tr key={r.label}><td>{r.label}</td><td className="text-center">{cell(r.free)}</td><td className="text-center">{cell(r.plus)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
