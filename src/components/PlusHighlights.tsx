import { Megaphone, Package, Percent, Sparkles, type LucideIcon } from 'lucide-react';
import { PLUS_HIGHLIGHTS, type PlusHighlight } from '@/data/subscriptionPlans';

// The four headline advantages of Ezial Plus as highlighted cards. Texts,
// values and notes come verbatim from src/shared/plans.js (validated by
// Ezial); only the icons and the layout live here.

const HIGHLIGHT_ICONS: Record<PlusHighlight['id'], LucideIcon> = {
  products: Package,
  commission: Percent,
  ads: Megaphone,
  editorial: Sparkles,
};

/** Icon of one Ezial Plus advantage — shared with the compact list of PricingCards. */
export function PlusHighlightIcon({ id, size = 18, className = '' }: { id: PlusHighlight['id']; size?: number; className?: string }) {
  const Icon = HIGHLIGHT_ICONS[id];
  return <Icon size={size} className={className} aria-hidden="true" />;
}

export default function PlusHighlights({ className = '', tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  return (
    <ul className={`grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 ${className}`}>
      {PLUS_HIGHLIGHTS.map((h) => (
        <li
          key={h.id}
          className={`relative flex flex-col overflow-hidden rounded-2xl p-6 sm:p-7 ${
            dark ? 'bg-white/10 ring-1 ring-white/15' : 'border border-line bg-white card-shadow'
          }`}
        >
          {/* Thin accent line on top of each card */}
          <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${dark ? 'bg-champagne/70' : 'bg-gradient-to-r from-burgundy to-champagne'}`} />
          <div className="flex items-start justify-between gap-4">
            <span
              aria-hidden="true"
              className={`font-display text-5xl font-semibold leading-none tracking-tightish lining-nums sm:text-6xl ${
                h.id === 'editorial' ? 'text-champagne' : dark ? 'text-white' : 'text-burgundy'
              }`}
            >
              {h.value}
            </span>
            <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${dark ? 'bg-white/15 text-champagne' : 'bg-burgundy/10 text-burgundy'}`}>
              <PlusHighlightIcon id={h.id} size={20} />
            </span>
          </div>
          <h3 className={`mt-5 font-display text-xl font-semibold leading-snug ${dark ? 'text-white' : 'text-ink'}`}>{h.title}</h3>
          <p className={`mt-2 text-sm leading-relaxed ${dark ? 'text-white/80' : 'text-ink/65'}`}>{h.text}</p>
          {h.note && <p className={`mt-auto pt-3 text-xs leading-snug ${dark ? 'text-white/55' : 'text-ink/45'}`}>{h.note}</p>}
        </li>
      ))}
    </ul>
  );
}
