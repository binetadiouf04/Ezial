import { formatFCFA, discountPercent } from '@/data/products';

// Les gabarits « sm » et « md » (cartes, panier, récapitulatifs) sont
// inchangés. « lg » est le prix de la fiche produit : prix en bordeaux, ancien
// prix barré, réduction en pastille pleine.
export default function PriceDisplay({ price, oldPrice, size = 'md' }: { price: number; oldPrice?: number; size?: 'sm' | 'md' | 'lg' }) {
  const disc = discountPercent(price, oldPrice);
  if (size === 'lg') {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[28px] font-bold leading-none text-burgundy">{formatFCFA(price)}</span>
        {oldPrice && disc && (
          <>
            <span className="text-base text-ink/40 line-through">{formatFCFA(oldPrice)}</span>
            <span className="rounded-md bg-burgundy px-2 py-1 text-xs font-semibold leading-none text-white">-{disc}%</span>
          </>
        )}
      </div>
    );
  }
  const main = size === 'md' ? 'text-base' : 'text-sm';
  const old = 'text-xs';
  return (
    <div className="flex items-baseline gap-2 flex-wrap">
      <span className={`font-semibold text-ink ${main}`}>{formatFCFA(price)}</span>
      {oldPrice && disc && (
        <>
          <span className={`text-ink/35 line-through ${old}`}>{formatFCFA(oldPrice)}</span>
          <span className="rounded-full bg-burgundy/8 px-2 py-0.5 text-[11px] font-semibold text-burgundy">-{disc}%</span>
        </>
      )}
    </div>
  );
}
