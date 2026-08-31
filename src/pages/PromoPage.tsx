import { useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import { products } from '@/data/products';
import ProductGrid from '@/components/ProductGrid';
import CategorySidebar from '@/components/CategorySidebar';
import { ChevronRight } from 'lucide-react';

export default function PromoPage() {
  const { navigate } = useApp();
  const promoProducts = useMemo(() => products.filter((p) => p.isPromo), []);

  return (
    <div className="container-pro flex gap-8 py-6">
      <CategorySidebar />
      <div className="min-w-0 flex-1">
        <nav className="mb-4 flex items-center gap-1.5 text-xs text-ink/40">
          <button onClick={() => navigate('/')} className="hover:text-burgundy">Accueil</button>
          <ChevronRight size={12} />
          <span className="text-ink/70">Promos</span>
        </nav>
        <div className="mb-6">
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">Promotions</h1>
          <p className="mt-2 text-sm text-ink/55">{promoProducts.length} produit{promoProducts.length > 1 ? 's' : ''} en promotion</p>
        </div>
        <ProductGrid products={promoProducts} columns={4} />
      </div>
    </div>
  );
}
