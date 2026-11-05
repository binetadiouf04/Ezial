import { Crown } from 'lucide-react';

// Shown only where a shop's real, server-computed isPremium is true (see
// active_premium_shop_ids() / supabaseCatalog.ts) — never a seller-editable
// field, never shown for Free, an expired Premium, or a pending/failed
// payment. Not a link/button: it's informational, so it's a <span>, not
// a clickable element.
export default function PremiumBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const compact = size === 'sm';
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-champagne/50 bg-burgundy font-medium tracking-wide text-white ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'}`}
      title="Boutique Ezial Premium"
    >
      <Crown size={compact ? 10 : 12} className="text-champagne" />
      Premium
    </span>
  );
}
