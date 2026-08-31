import type { ReactNode } from 'react';

interface SummaryCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  onClick?: () => void;
  accent?: boolean;
}

export default function SummaryCard({ label, value, hint, icon, onClick, accent }: SummaryCardProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`card p-4 text-left transition-all ${onClick ? 'hover:border-ink/20 hover:card-shadow cursor-pointer' : ''} ${accent ? 'bg-burgundy text-white border-burgundy' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${accent ? 'text-white/70' : 'text-ink/50'}`}>{label}</span>
        {icon && <span className={accent ? 'text-white/60' : 'text-ink/30'}>{icon}</span>}
      </div>
      <p className={`mt-2 font-display text-2xl font-semibold ${accent ? 'text-white' : 'text-ink'}`}>{value}</p>
      {hint && <p className={`mt-0.5 text-xs ${accent ? 'text-white/60' : 'text-ink/40'}`}>{hint}</p>}
    </Tag>
  );
}
