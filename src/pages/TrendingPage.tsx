import { useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import { getShop } from '@/data/shops';
import { rankForTrending } from '@/lib/productRanking';
import ProductGrid from '@/components/ProductGrid';
import CategorySidebar from '@/components/CategorySidebar';
import { ChevronRight } from 'lucide-react';

const isOfficialShop = (shopId: string): boolean => getShop(shopId)?.isOfficial === true;

export default function TrendingPage() {
  const { navigate, catalogProducts } = useApp();
  // Same MVP fallback as the Home preview: real activity data doesn't exist
  // yet, so this ranks by real product recency instead of simulating an
  // engagement score — see rankForTrending.
  const trendingProducts = useMemo(() => rankForTrending(catalogProducts, { isOfficialShop }), [catalogProducts]);

  return (
    <div className="container-pro flex gap-8 py-6">
      <CategorySidebar />
      <div className="min-w-0 flex-1">
        <nav className="mb-4 flex items-center gap-1.5 text-xs text-ink/40">
          <button onClick={() => navigate('/')} className="hover:text-burgundy">Accueil</button>
          <ChevronRight size={12} />
          <span className="text-ink/70">Tendances</span>
        </nav>
        <div className="mb-6">
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">Tendances</h1>
          <p className="mt-2 text-sm text-ink/55">{trendingProducts.length} produit{trendingProducts.length > 1 ? 's' : ''} tendance{trendingProducts.length > 1 ? 's' : ''}</p>
        </div>
        <ProductGrid products={trendingProducts} columns={4} />
      </div>
    </div>
  );
}
