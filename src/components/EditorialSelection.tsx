import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import type { Product } from '@/data/products';
import { fetchEditorialPicks, type EditorialPick } from '@/lib/supabaseEditorial';
import ProductCard from './ProductCard';

// Homepage "Sélection Ezial": the products picked by the Ezial team
// (public.editorial_picks), reserved for Ezial Plus shops. A pick is shown
// only while its product is in the loaded public catalog (active product of
// an active shop) AND its shop is currently Ezial Plus — the same
// server-computed isPremium (active_premium_shop_ids()) as the badge. The
// database checks this when a pick is added; this re-check hides a pick as
// soon as the product is unpublished or the shop's Ezial Plus ends.
// Renders nothing while loading, on any error (missing table included) or
// when no pick qualifies — never an empty block.
export default function EditorialSelection() {
  const { catalogProducts, catalogShops, catalogLoading } = useApp();
  const [picks, setPicks] = useState<EditorialPick[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchEditorialPicks().then(({ picks: fetched, error }) => {
      if (!cancelled && !error) setPicks(fetched);
    });
    return () => { cancelled = true; };
  }, []);

  const products = useMemo(() => {
    if (catalogLoading || picks.length === 0) return [];
    const plusShopIds = new Set(catalogShops.filter((s) => s.isPremium).map((s) => s.id));
    const byId = new Map(catalogProducts.map((p) => [p.id, p]));
    return [...picks]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((pick) => byId.get(pick.productId))
      .filter((p): p is Product => p !== undefined && plusShopIds.has(p.shopId));
  }, [picks, catalogProducts, catalogShops, catalogLoading]);

  if (products.length === 0) return null;

  return (
    <section aria-labelledby="selection-ezial-title" className="rounded-2xl border border-champagne/40 bg-cream p-6 sm:p-10">
      <div className="mb-6">
        <p className="eyebrow mb-1.5 flex items-center gap-1.5"><Sparkles size={13} className="text-champagne" aria-hidden="true" /> Sélection Ezial</p>
        <h2 id="selection-ezial-title" className="section-title">Choisis par l’équipe Ezial</h2>
        <p className="mt-2 max-w-xl text-sm text-ink/55">Des produits de boutiques Ezial Plus, retenus pour leur pertinence et leur disponibilité.</p>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:gap-5 lg:grid-cols-6">
        {products.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  );
}
