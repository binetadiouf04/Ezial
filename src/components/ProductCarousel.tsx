import { useRef } from 'react';
import type { Product } from '@/data/products';
import ProductCard from './ProductCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function ProductCarousel({ products }: { products: Product[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (products.length === 0) return null;

  const scrollBy = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2"
      >
        {products.map((p) => (
          <div key={p.id} className="w-[160px] flex-shrink-0 snap-start sm:w-[200px] lg:w-[240px]">
            <ProductCard product={p} />
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
