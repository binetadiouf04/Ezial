import { useEffect, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { products as mockProducts, type Product } from '@/data/products';
import { shops as mockShops, registerSupabaseShops, type Shop } from '@/data/shops';
import { homeCircleTiles } from '@/data/categories';
import ProductCard from '@/components/ProductCard';
import ShopCard from '@/components/ShopCard';
import HeroCarousel, { type HeroSlide } from '@/components/HeroCarousel';
import SmartImage from '@/components/SmartImage';
import { fetchActiveCatalogFromSupabase } from '@/lib/supabaseCatalog';
import { ChevronRight } from 'lucide-react';

// TRANSITIONAL — merges the Supabase catalog into the mock one instead of
// replacing it outright, so the homepage stays populated while the real
// catalog is still thin. A Supabase product wins over a mock product that
// shares its reference; mock products with no matching reference are kept
// as-is. Remove this merge (and mockProducts) once the Supabase catalog is
// filled enough to stand on its own — see fetchActiveCatalogFromSupabase().
function mergeCatalogs(mock: Product[], supabase: Product[]): Product[] {
  const supabaseRefs = new Set(supabase.map((p) => p.reference).filter(Boolean));
  const remainingMock = mock.filter((p) => !supabaseRefs.has(p.reference));
  return [...supabase, ...remainingMock];
}

// Same transitional merge as mergeCatalogs, but for the "Boutiques à
// découvrir" shop grid — deduped by id (shops have no shared "reference"
// field to match mock vs. Supabase rows on, but a real Supabase shop's id
// is a UUID that will never collide with a mock shop's slug-style id).
function mergeShops(mock: Shop[], supabase: Shop[]): Shop[] {
  const supabaseIds = new Set(supabase.map((s) => s.id));
  const remainingMock = mock.filter((s) => !supabaseIds.has(s.id));
  return [...supabase, ...remainingMock];
}

// Homepage-only preview row for a product section: a capped selection (~6 on
// desktop) with a "Voir tout" link to the full list, horizontally swipeable
// on mobile instead of wrapping into extra rows.
function HomeProductPreview({
  eyebrow,
  title,
  products,
  seeAllRoute,
  onNavigate,
}: {
  eyebrow: string;
  title: string;
  products: Product[];
  seeAllRoute: string;
  onNavigate: (route: string) => void;
}) {
  const preview = products.slice(0, 6);
  return (
    <>
      <div className="mb-6 flex items-end justify-between">
        <div><p className="eyebrow mb-1.5">{eyebrow}</p><h2 className="section-title">{title}</h2></div>
        <button onClick={() => onNavigate(seeAllRoute)} className="flex items-center gap-1 text-sm font-medium text-burgundy hover:underline">Voir tout <ChevronRight size={15} /></button>
      </div>
      {preview.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center"><p className="text-sm text-ink/50">Aucun produit trouvé.</p></div>
      ) : (
        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:pb-0 lg:grid-cols-6">
          {preview.map((p) => (
            <div key={p.id} className="w-[44%] flex-shrink-0 sm:w-auto sm:flex-shrink-0">
              <ProductCard product={p} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

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
  // The mock catalog renders immediately; if the Supabase catalog fetch
  // succeeds, its products/shops are merged in (see mergeCatalogs/mergeShops
  // above). On failure (or while still loading), the mock catalog stays
  // as-is — never left empty.
  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [displayShops, setDisplayShops] = useState<Shop[]>(mockShops);

  useEffect(() => {
    let cancelled = false;
    fetchActiveCatalogFromSupabase()
      .then((result) => {
        if (cancelled) return;
        if (result.errors.length === 0) {
          // Registered before the merge so ProductCard's getShop() can
          // resolve a real Supabase product's shop (name, logo, link) —
          // without this, a Supabase product's shopId never matches
          // anything in the static mock shop list.
          registerSupabaseShops(result.shops);
          setProducts(mergeCatalogs(mockProducts, result.products));
          setDisplayShops(mergeShops(mockShops, result.shops));
        }
      })
      .catch(() => {
        // Fetch itself failed unexpectedly — keep the mock catalog as-is.
      });
    return () => { cancelled = true; };
  }, []);

  const trending = products.filter((p) => p.isTrending);
  const promos = products.filter((p) => p.isPromo);
  const pourVous = [...products].sort(() => 0.5 - Math.random()).slice(0, 8);

  return (
    <div className="space-y-16 lg:space-y-24">
      <h1 className="sr-only">Ezial — Mode, beauté & lifestyle à Dakar</h1>
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

      {promos.length > 0 && (
        <section className="rounded-2xl bg-burgundy/5 p-6 sm:p-10">
          <HomeProductPreview eyebrow="Promotions" title="Offres à ne pas manquer" products={promos} seeAllRoute="/promos" onNavigate={navigate} />
        </section>
      )}

      <section>
        <HomeProductPreview eyebrow="Tendances du moment" title="Le plus aimé maintenant" products={trending} seeAllRoute="/tendances" onNavigate={navigate} />
      </section>

      <section>
        <HomeProductPreview eyebrow="Pour vous" title="Sélection personnalisée" products={pourVous} seeAllRoute="/pour-vous" onNavigate={navigate} />
      </section>

      <section>
        <div className="mb-6 flex items-end justify-between"><div><p className="eyebrow mb-1.5">Boutiques à découvrir</p><h2 className="section-title">Nos vendeurs sélectionnés</h2></div></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{displayShops.map((shop) => <ShopCard key={shop.id} shop={shop} />)}</div>
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
