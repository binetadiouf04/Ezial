import { useState, useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import { getShop } from '@/data/shops';
import { productsByShop } from '@/data/products';
import ProductGrid from '@/components/ProductGrid';
import Rating from '@/components/Rating';
import { UserPlus, Check } from 'lucide-react';
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
  const { navigate } = useApp();
  const shop = getShop(shopId);
  const [tab, setTab] = useState<Tab>('Accueil');
  const [following, setFollowing] = useState(false);
  const [sort, setSort] = useState<SortId>('recent');

  const allProducts = productsByShop(shopId);

  const sortedProducts = useMemo(() => {
    let result = [...allProducts];
    switch (sort) {
      case 'prix-asc': result.sort((a, b) => a.price - b.price); break;
      case 'prix-desc': result.sort((a, b) => b.price - a.price); break;
      default: result.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0)); break;
    }
    return result;
  }, [allProducts, sort]);

  if (!shop) return <div className="container-pro py-20 text-center text-ink/50">Boutique introuvable.</div>;

  return (
    <div className="py-6">
      <div className="relative h-48 w-full overflow-hidden rounded-2xl bg-cream sm:h-64"><SmartImage src={shop.banner} alt={shop.name} className="h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-ink/40 to-transparent" /></div>
      <div className="container-pro">
        <div className="relative -mt-12 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-end">
          <SmartImage src={shop.logo} alt={shop.name} className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-sm sm:h-28 sm:w-28" />
          <div className="flex-1 pb-1">
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{shop.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-ink/55"><span>{shop.followers.toLocaleString('fr-FR')} abonnés</span><span className="text-line">·</span><Rating rating={shop.rating} count={shop.reviewCount} /><span className="text-line">·</span><span>{shop.city}</span></div>
          </div>
          <button onClick={() => setFollowing((f) => !f)} className={following ? 'btn-outline' : 'btn-primary'}>{following ? <><Check size={16} /> Suivi</> : <><UserPlus size={16} /> Suivre</>}</button>
        </div>
        <p className="mt-5 max-w-2xl text-sm text-ink/65">{shop.description}</p>
        <div className="mt-6 flex gap-5 border-b border-line overflow-x-auto no-scrollbar">
          {tabs.map((t) => <button key={t} onClick={() => setTab(t)} className={`whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors ${tab === t ? 'border-burgundy text-burgundy' : 'border-transparent text-ink/50 hover:text-ink'}`}>{t}</button>)}
        </div>
        <div className="mt-8">
          {tab === 'Accueil' && <div className="space-y-8"><section><h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink/50">Produits phares</h2><ProductGrid products={allProducts.slice(0, 4)} columns={4} /></section></div>}
          {tab === 'Produits' && (
            <div>
              <div className="mb-5 flex items-center gap-2">
                <span className="text-xs text-ink/45">Trier par</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as SortId)} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink focus:border-burgundy focus:outline-none">
                  {sortOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              <ProductGrid products={sortedProducts} columns={4} />
            </div>
          )}
          {tab === 'Avis' && (
            <div className="mx-auto max-w-2xl space-y-5 py-4">
              <div className="flex items-center gap-6 rounded-xl border border-line p-6">
                <div className="text-center"><p className="font-display text-4xl font-semibold text-ink">{shop.rating}</p><Rating rating={shop.rating} showCount={false} /></div>
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
