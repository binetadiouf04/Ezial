import { formatFCFA, discountPercent } from '@/data/products';

// Les gabarits « sm » et « md » (cartes, panier, récapitulatifs) sont
// inchangés. « lg » est le prix de la fiche produit : prix en bordeaux, ancien
// prix barré, réduction en pastille pleine.
export default function PriceDisplay({ price, oldPrice, size = 'md' }: { price: number; oldPrice?: number; size?: 'sm' | 'md' | 'lg' | 'card' }) {
  const disc = discountPercent(price, oldPrice);
  // « card » : cartes produits (2 par ligne sur mobile). Le prix reste seul sur
  // sa ligne, bien lisible, avec la réduction à côté ; l'ancien prix barré
  // passe en petit juste dessous — jamais de retour à la ligne désordonné.
  if (size === 'card') {
    return (
      <div className="leading-tight">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="whitespace-nowrap text-[15px] font-bold text-ink">{formatFCFA(price)}</span>
          {oldPrice && disc && <span className="rounded-full bg-burgundy/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-burgundy">-{disc}%</span>}
        </div>
        {oldPrice && disc && <span className="mt-0.5 block text-[11px] text-ink/40 line-through">{formatFCFA(oldPrice)}</span>}
      </div>
    );
  }
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
