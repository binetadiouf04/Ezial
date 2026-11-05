import SmartImage from './SmartImage';

// A shop with no cover/logo yet (never uploaded one — not a broken image)
// used to fall through to SmartImage's generic "EZIAL / Image indisponible"
// placeholder for BOTH slots at once, which read as two repeated Ezial
// logos stacked on the same card. That placeholder stays exactly right
// for a genuinely broken upload (SmartImage's own onError fallback,
// untouched here) — this only replaces the "never had one" case, which is
// the common one for a brand-new shop, with a plain neutral block and an
// initial-letter avatar instead.

export function ShopCover({ src, alt, className }: { src: string; alt: string; className?: string }) {
  if (!src) return <div className={`bg-cream ${className ?? ''}`} />;
  return <SmartImage src={src} alt={alt} className={className} />;
}

export function ShopAvatar({ src, alt, name, className }: { src: string; alt: string; name: string; className?: string }) {
  if (!src) {
    const initial = name.trim().charAt(0).toUpperCase() || '?';
    return (
      <div className={`flex items-center justify-center bg-burgundy/10 font-display font-semibold text-burgundy ${className ?? ''}`}>
        {initial}
      </div>
    );
  }
  return <SmartImage src={src} alt={alt} className={className} />;
}
