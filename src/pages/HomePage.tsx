import { useApp } from '@/store/AppContext';
import { products } from '@/data/products';
import { shops } from '@/data/shops';
import { homeCircleTiles } from '@/data/categories';
import ProductGrid from '@/components/ProductGrid';
import ShopCard from '@/components/ShopCard';
import HeroCarousel, { type HeroSlide } from '@/components/HeroCarousel';
import SmartImage from '@/components/SmartImage';
import { ChevronRight } from 'lucide-react';

const heroSlides: HeroSlide[] = [
  {
    id: 'mode-femme',
    image: 'https://images.pexels.com/photos/38277759/pexels-photo-38277759.jpeg?auto=compress&cs=tinysrgb&h=900&w=1600',
    imagePosition: 'object-top',
    eyebrow: 'Mode Femme',
    title: 'Élégance sénégalaise',
    ctaLabel: 'Découvrir',
    ctaRoute: '/categorie/vetements/femme',
  },
  {
    id: 'beaute',
    image: 'https://images.pexels.com/photos/12352170/pexels-photo-12352170.jpeg?auto=compress&cs=tinysrgb&h=900&w=1600',
    imagePosition: 'object-center',
    eyebrow: 'Beauté',
    title: 'Rituels skincare',
    ctaLabel: 'Explorer',
    ctaRoute: '/categorie/beaute/skincare',
  },
  {
    id: 'cheveux',
    image: 'https://images.pexels.com/photos/15868319/pexels-photo-15868319.jpeg?auto=compress&cs=tinysrgb&h=900&w=1600',
    imagePosition: 'object-top',
    eyebrow: 'Cheveux',
    title: 'Perruques premium',
    ctaLabel: 'Voir la collection',
    ctaRoute: '/categorie/cheveux/perruques',
  },
  {
    id: 'bijoux-parfums',
    image: 'https://images.pexels.com/photos/30746012/pexels-photo-30746012.jpeg?auto=compress&cs=tinysrgb&h=900&w=1600',
    imagePosition: 'object-center',
    eyebrow: 'Bijoux & Parfums',
    title: 'Éclat & senteurs',
    ctaLabel: 'Découvrir',
    ctaRoute: '/categorie/bijoux',
  },
  {
    id: 'mode-homme',
    image: 'https://images.pexels.com/photos/34695268/pexels-photo-34695268.jpeg?auto=compress&cs=tinysrgb&h=900&w=1600',
    imagePosition: 'object-top',
    eyebrow: 'Mode Homme',
    title: 'Style affirmé',
    ctaLabel: 'Découvrir',
    ctaRoute: '/categorie/vetements/homme',
  },
];

export default function HomePage() {
  const { navigate } = useApp();
  const trending = products.filter((p) => p.isTrending);
  const promos = products.filter((p) => p.isPromo);
  const nouveautes = products.filter((p) => p.isNew);
  const pourVous = [...products].sort(() => 0.5 - Math.random()).slice(0, 8);

  return (
    <div className="space-y-16 lg:space-y-24">
      <HeroCarousel slides={heroSlides} />

      <section>
        <div className="mb-5 flex items-end justify-between"><h2 className="section-title">À découvrir</h2></div>
        <div className="flex gap-5 overflow-x-auto no-scrollbar pb-1 sm:gap-6 lg:gap-8">
          {homeCircleTiles.map((tile) => (
            <button key={tile.id} onClick={() => navigate(tile.route)} className="group flex w-[76px] flex-shrink-0 flex-col items-center gap-2 sm:w-[92px] lg:w-[104px]">
              <div className="relative aspect-square w-full overflow-hidden rounded-full bg-cream"><SmartImage src={tile.image} alt={tile.label} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" /><div className="absolute inset-0 bg-ink/0 transition-colors group-hover:bg-ink/10" /></div>
              <span className={`text-center text-[11px] font-medium leading-tight transition-colors sm:text-xs ${tile.highlight ? 'text-burgundy font-semibold' : 'text-ink/80 group-hover:text-burgundy'}`}>{tile.label}</span>
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
          {[{ title: 'Livraison à Dakar', desc: 'Sous 4–48 h chez vous' }, { title: 'Boutiques sélectionnées', desc: 'Chaque vendeur est validé par EZIAL' }, { title: 'Paiement sécurisé', desc: 'Wave, Orange Money & PayPal' }].map((f) => (
            <div key={f.title} className="text-center sm:text-left"><h3 className="font-display text-lg font-semibold text-ink">{f.title}</h3><p className="mt-1 text-sm text-ink/55">{f.desc}</p></div>
          ))}
        </div>
      </section>
    </div>
  );
}
