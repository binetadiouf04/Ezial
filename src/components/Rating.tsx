import { Star } from 'lucide-react';

export default function Rating({ rating, count, size = 'sm', showCount = true }: { rating: number; count?: number; size?: 'sm' | 'md'; showCount?: boolean }) {
  const star = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} className={`${star} ${n <= Math.round(rating) ? 'fill-champagne text-champagne' : 'text-line'}`} />
        ))}
      </div>
      <span className={`font-medium text-ink/70 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>{rating.toFixed(1)}</span>
      {showCount && count !== undefined && <span className={`text-ink/40 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>({count})</span>}
    </div>
  );
}
