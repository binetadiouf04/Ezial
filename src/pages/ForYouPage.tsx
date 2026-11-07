import { useMemo, useRef } from 'react';
import { useApp } from '@/store/AppContext';
import { getShop } from '@/data/shops';
import { rankForYou } from '@/lib/productRanking';
import { useShoppingSignals } from '@/lib/useShoppingSignals';
import ProductGrid from '@/components/ProductGrid';
import CategorySidebar from '@/components/CategorySidebar';
import { ChevronRight } from 'lucide-react';

const isOfficialShop = (shopId: string): boolean => getShop(shopId)?.isOfficial === true;

export default function ForYouPage() {
  const { navigate, catalogProducts } = useApp();
  // Same ranking as the Home preview (purchases, favorites, cart, recently
  // viewed). Re-ranked when the catalog or the purchase history arrives, not
  // on every favorite/cart toggle, so the grid never reshuffles under the
  // visitor's finger.
  const signals = useShoppingSignals();
  const signalsRef = useRef(signals);
  signalsRef.current = signals;
  const purchasedCount = signals.purchasedIds.length;
  const forYouProducts = useMemo(
    () => rankForYou(catalogProducts, signalsRef.current, { isOfficialShop }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
    [catalogProducts, purchasedCount],
  );

  return (
    <div className="container-pro flex gap-8 py-6">
      <CategorySidebar />
      <div className="min-w-0 flex-1">
        <nav className="mb-4 flex items-center gap-1.5 text-xs text-ink/40">
          <button onClick={() => navigate('/')} className="hover:text-burgundy">Accueil</button>
          <ChevronRight size={12} />
          <span className="text-ink/70">Vous aimerez</span>
        </nav>
        <div className="mb-6">
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">Vous aimerez</h1>
          <p className="mt-2 text-sm text-ink/55">{forYouProducts.length} produit{forYouProducts.length > 1 ? 's' : ''}</p>
        </div>
        <ProductGrid products={forYouProducts} columns={4} />
      </div>
    </div>
  );
}
