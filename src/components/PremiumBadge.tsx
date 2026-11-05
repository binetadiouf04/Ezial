import { Crown } from 'lucide-react';

// Shown only where a shop's real, server-computed isPremium is true (see
// active_premium_shop_ids() / supabaseCatalog.ts) — never a seller-editable
// field, never shown for Free, an expired Premium, or a pending/failed
// payment. Indicates a Premium subscription, not an independent
// certification — kept to a plain circle + crown, no "Premium" text next
// to the shop name, so it never reads as an official stamp. Not a
// link/button: it's informational, so it's a <span>, not a clickable
// element. aria-label carries the meaning for screen readers since the
// visible mark alone (a circle) says nothing on its own; title gives
// sighted mouse users the same thing as a tooltip.
export default function PremiumBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const compact = size === 'sm';
  const px = compact ? 16 : 20;
  return (
    <span
      role="img"
      aria-label="Boutique Premium"
      title="Boutique Premium"
      className="inline-flex flex-shrink-0 items-center justify-center rounded-full bg-burgundy"
      style={{ width: px, height: px }}
    >
      <Crown size={compact ? 9 : 11} className="text-champagne" />
    </span>
  );
}
