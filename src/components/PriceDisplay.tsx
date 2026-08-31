import { formatFCFA, discountPercent } from '@/data/products';

export default function PriceDisplay({ price, oldPrice, size = 'md' }: { price: number; oldPrice?: number; size?: 'sm' | 'md' | 'lg' }) {
  const disc = discountPercent(price, oldPrice);
  const main = size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-base' : 'text-sm';
  const old = size === 'lg' ? 'text-base' : 'text-xs';
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
