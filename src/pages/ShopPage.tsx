import { useState, useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import { getShop } from '@/data/shops';
import ProductGrid from '@/components/ProductGrid';
import Rating from '@/components/Rating';
import { UserPlus, Check, Package, MapPin } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

const tabs = ['Accueil', 'Produits', 'Avis'] as const;
type Tab = (typeof tabs)[number];

const sortOptions = [
  { id: 'recent', label: 'Plus récent' },
  { id: 'prix-asc', label: 'Prix croissant' },
  { id: 'prix-desc', label: 'Prix décroissant' },
] as const;
type SortId = (typeof sortOptions)[number]['id'];

export default function ShopPage({ shopId }: { shopId: string }) {
  const { catalogProducts, catalogLoading } = useApp();
  const shop = getShop(shopId);
  const [tab, setTab] = useState<Tab>('Accueil');
  const [following, setFollowing] = useState(false);
  const [sort, setSort] = useState<SortId>('recent');

  // Real shops resolve their products from the merged Supabase+mock
  // catalog (catalogProducts is already scoped to status = 'active' by
  // fetchActiveCatalogFromSupabase — a draft/flagged/disabled product is
  // never returned in it, let alone shown here) — never from the
  // standalone static mock product list, which has no idea a real
  // seller's products even exist. That mismatch is exactly why a real
  // shop's "Produits" tab could stay empty despite the shop actually
  // having active products in Supabase.
  const allProducts = useMemo(
    () => catalogProducts.filter((p) => p.shopId === shopId),
    [catalogProducts, shopId],
  );

  const sortedProducts = useMemo(() => {
    const result = [...allProducts];
    switch (sort) {
      case 'prix-asc': result.sort((a, b) => a.price - b.price); break;
      case 'prix-desc': result.sort((a, b) => b.price - a.price); break;
      default: result.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0)); break;
    }
    return result;
  }, [allProducts, sort]);

  // A shop landed on directly (e.g. a shared link) isn't registered yet
  // until the Supabase fetch that populates it settles — showing "Boutique
  // introuvable" before that point would be a false negative, not a real
  // 404, so a loading state takes priority over the not-found one.
  if (!shop) {
    if (catalogLoading) return <div className="container-pro py-20 text-center text-sm text-ink/45">Chargement…</div>;
    return <div className="container-pro py-20 text-center text-ink/50">Boutique introuvable.</div>;
  }

  const location = shop.address || shop.city;

  return (
    <div className="py-6">
      <div className="relative h-40 w-full overflow-hidden rounded-2xl bg-cream sm:h-56 lg:h-64">
        <SmartImage src={shop.banner} alt={shop.name} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/40 to-transparent" />
      </div>
      <div className="container-pro">
        <div className="relative -mt-10 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end lg:-mt-16">
          <SmartImage src={shop.logo} alt={shop.name} className="h-20 w-20 flex-shrink-0 rounded-full border-4 border-white object-cover shadow-sm sm:h-24 sm:w-24 lg:h-28 lg:w-28" />
          <div className="flex-1 min-w-0 pb-1">
            <h1 className="font-display text-xl font-semibold text-ink sm:text-2xl lg:text-3xl">{shop.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink/55">
              {shop.followers > 0 && <span>{shop.followers.toLocaleString('fr-FR')} abonnés</span>}
              {shop.rating > 0 && <Rating rating={shop.rating} count={shop.reviewCount} />}
              <span className="flex items-center gap-1"><Package size={14} /> {allProducts.length} produit{allProducts.length !== 1 ? 's' : ''}</span>
              {location && <span className="flex items-center gap-1"><MapPin size={14} /> {location}</span>}
            </div>
          </div>
          <button onClick={() => setFollowing((f) => !f)} className={following ? 'btn-outline flex-shrink-0' : 'btn-primary flex-shrink-0'}>{following ? <><Check size={16} /> Suivi</> : <><UserPlus size={16} /> Suivre</>}</button>
        </div>
        {shop.description && <p className="mt-5 max-w-2xl text-sm text-ink/65">{shop.description}</p>}
        <div className="mt-6 flex gap-5 border-b border-line overflow-x-auto no-scrollbar">
          {tabs.map((t) => <button key={t} onClick={() => setTab(t)} className={`whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors ${tab === t ? 'border-burgundy text-burgundy' : 'border-transparent text-ink/50 hover:text-ink'}`}>{t}</button>)}
        </div>
        <div className="mt-8">
          {tab === 'Accueil' && (
            <div className="space-y-8">
              <section>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink/50">Produits phares</h2>
                {catalogLoading ? <p className="py-10 text-center text-sm text-ink/45">Chargement…</p> : <ProductGrid products={allProducts.slice(0, 4)} columns={4} />}
              </section>
            </div>
          )}
          {tab === 'Produits' && (
            <div>
              {allProducts.length > 0 && (
                <div className="mb-5 flex items-center gap-2">
                  <span className="text-xs text-ink/45">Trier par</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortId)} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink focus:border-burgundy focus:outline-none">
                    {sortOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
              )}
              {catalogLoading ? <p className="py-10 text-center text-sm text-ink/45">Chargement…</p> : <ProductGrid products={sortedProducts} columns={4} />}
            </div>
          )}
          {tab === 'Avis' && (
            <div className="mx-auto max-w-2xl space-y-5 py-4">
              <div className="flex items-center gap-6 rounded-xl border border-line p-6">
                <div className="text-center"><p className="font-display text-4xl font-semibold text-ink">{shop.rating || '—'}</p>{shop.rating > 0 && <Rating rating={shop.rating} showCount={false} />}</div>
                <div className="text-sm text-ink/60"><p>{shop.reviewCount} avis vérifiés</p><p className="mt-1">Tous les avis proviennent d'achats confirmés sur EZIAL.</p></div>
              </div>
              <div className="space-y-4">{allProducts.flatMap((p) => p.reviews).slice(0, 4).map((rev) => (
                <div key={rev.id} className="border-b border-line pb-4"><div className="flex items-center justify-between"><span className="text-sm font-medium text-ink">{rev.author}</span><span className="text-xs text-ink/40">{rev.date}</span></div><div className="mt-1.5"><Rating rating={rev.rating} showCount={false} /></div><p className="mt-2 text-sm text-ink/70">{rev.text}</p></div>
              ))}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
