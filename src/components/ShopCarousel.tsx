import { useRef } from 'react';
import type { Shop } from '@/data/shops';
import ShopCard from './ShopCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Same horizontal-scroll-on-mobile / arrow-nav-on-desktop pattern as
// ProductCarousel, for a row of shop cards (used by the "Boutiques
// Premium" home section).
export default function ShopCarousel({ shops }: { shops: Shop[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (shops.length === 0) return null;

  const scrollBy = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 280, behavior: 'smooth' });
  };

  return (
    <div className="relative">
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2">
        {shops.map((s) => (
          <div key={s.id} className="w-[220px] flex-shrink-0 snap-start sm:w-[260px]">
            <ShopCard shop={s} />
          </div>
        ))}
      </div>
      <button
        onClick={() => scrollBy(-1)}
        className="absolute -left-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white shadow-sm hover:shadow-md transition-shadow lg:flex"
        aria-label="Précédent"
      >
        <ChevronLeft size={18} className="text-ink/60" />
      </button>
      <button
        onClick={() => scrollBy(1)}
        className="absolute -right-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white shadow-sm hover:shadow-md transition-shadow lg:flex"
        aria-label="Suivant"
      >
        <ChevronRight size={18} className="text-ink/60" />
      </button>
    </div>
  );
}
