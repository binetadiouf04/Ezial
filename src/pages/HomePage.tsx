import { useApp } from '@/store/AppContext';
import { products } from '@/data/products';
import { shops } from '@/data/shops';
import { categoryTiles } from '@/data/categories';
import ProductGrid from '@/components/ProductGrid';
import ShopCard from '@/components/ShopCard';
import { ChevronRight } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

export default function HomePage() {
  const { navigate } = useApp();
  const trending = products.filter((p) => p.isTrending);
  const promos = products.filter((p) => p.isPromo);
  const nouveautes = products.filter((p) => p.isNew);
  const pourVous = [...products].sort(() => 0.5 - Math.random()).slice(0, 8);

  return (
    <div className="space-y-16 lg:space-y-24">
      <section className="relative overflow-hidden rounded-2xl bg-cream">
        <div className="grid lg:grid-cols-2">
          <div className="flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-16 lg:py-24 order-2 lg:order-1">
            <p className="eyebrow mb-4">Nouvelle sélection</p>
            <h1 className="font-display text-4xl font-semibold leading-[1.05] text-ink sm:text-5xl lg:text-6xl">Les essentiels<br />du moment</h1>
            <p className="mt-5 max-w-md text-sm text-ink/60 sm:text-base">Mode, beauté, cheveux & parfums sélectionnés à Dakar. Une marketplace premium, livrée chez vous.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => navigate('/categorie/vetements')} className="btn-primary">Découvrir <ChevronRight size={16} /></button>
              <button onClick={() => navigate('/categorie/beaute')} className="btn-outline">Beauté</button>
            </div>
          </div>
          <div className="relative aspect-[4/5] lg:aspect-auto order-1 lg:order-2">
            <SmartImage src="https://images.pexels.com/photos/19816456/pexels-photo-19816456.jpeg?auto=compress&cs=tinysrgb&h=1200&w=900" alt="Sélection EZIAL" className="h-full w-full object-cover" />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-6 flex items-end justify-between"><h2 className="section-title">Catégories</h2></div>
        <div className="grid grid-cols-3 gap-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-7">
          {categoryTiles.map((cat) => (
            <button key={cat.id} onClick={() => navigate(`/categorie/${cat.id}`)} className="group flex flex-col items-center gap-2.5">
              <div className="relative aspect-square w-full overflow-hidden rounded-full bg-cream"><SmartImage src={cat.image} alt={cat.label} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" /><div className="absolute inset-0 bg-ink/0 transition-colors group-hover:bg-ink/10" /></div>
              <span className="text-xs font-medium text-ink/80 group-hover:text-burgundy transition-colors sm:text-sm">{cat.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-6 flex items-end justify-between">
          <div><p className="eyebrow mb-1.5">Tendances du moment</p><h2 className="section-title">Le plus aimé maintenant</h2></div>
          <button onClick={() => navigate('/categorie/vetements')} className="hidden sm:flex items-center gap-1 text-sm font-medium text-burgundy hover:underline">Tout voir <ChevronRight size={15} /></button>
        </div>
        <ProductGrid products={trending} columns={4} />
      </section>

      {promos.length > 0 && (
        <section className="rounded-2xl bg-burgundy/5 p-6 sm:p-10">
          <div className="mb-6 flex items-end justify-between"><div><p className="eyebrow mb-1.5">Promotions</p><h2 className="section-title">Offres à ne pas manquer</h2></div></div>
          <ProductGrid products={promos} columns={4} />
        </section>
      )}

      <section>
        <div className="mb-6 flex items-end justify-between"><div><p className="eyebrow mb-1.5">Boutiques à découvrir</p><h2 className="section-title">Nos vendeurs sélectionnés</h2></div></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{shops.map((shop) => <ShopCard key={shop.id} shop={shop} />)}</div>
      </section>

      <section>
        <div className="mb-6 flex items-end justify-between"><div><p className="eyebrow mb-1.5">Nouveautés</p><h2 className="section-title">Vient d'arriver</h2></div></div>
        <ProductGrid products={nouveautes} columns={4} />
      </section>

      <section>
        <div className="mb-6 flex items-end justify-between"><div><p className="eyebrow mb-1.5">Pour vous</p><h2 className="section-title">Sélection personnalisée</h2></div></div>
        <ProductGrid products={pourVous} columns={4} />
      </section>

      <section className="border-t border-line pt-12">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {[{ title: 'Livraison à Dakar', desc: 'Sous 24–48 h chez vous' }, { title: 'Boutiques sélectionnées', desc: 'Chaque vendeur est validé par EZIAL' }, { title: 'Paiement sécurisé', desc: 'Wave & Orange Money' }].map((f) => (
            <div key={f.title} className="text-center sm:text-left"><h3 className="font-display text-lg font-semibold text-ink">{f.title}</h3><p className="mt-1 text-sm text-ink/55">{f.desc}</p></div>
          ))}
        </div>
      </section>
    </div>
  );
}
