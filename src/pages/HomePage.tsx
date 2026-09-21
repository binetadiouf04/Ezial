import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/store/AppContext';
import type { Product } from '@/data/products';
import { getShop } from '@/data/shops';
import { homeCircleTiles, type HomeCircleTile } from '@/data/categories';
import ProductCard from '@/components/ProductCard';
import ShopCard from '@/components/ShopCard';
import HeroCarousel, { type HeroSlide } from '@/components/HeroCarousel';
import DiscoverMarquee from '@/components/DiscoverMarquee';
import { rankProducts, rankForTrending, diversifyBySubcategory } from '@/lib/productRanking';
import { fetchHeroSlides, fetchDiscoverTiles } from '@/lib/supabaseHomeContent';
import { ChevronRight } from 'lucide-react';

// Phase 1: resolves "official shop" purely from Supabase shops.is_official
// (via getShop's registry) — never a hardcoded id/slug/name. Phase 2 will
// extend RankingContext with buyer-behavior signals; this function itself
// won't need to change.
const isOfficialShop = (shopId: string): boolean => getShop(shopId)?.isOfficial === true;

// Fisher–Yates — `.sort(() => 0.5 - Math.random())` is not a valid
// comparator and (combined with being re-run on every render) is what let
// "Sélection personnalisée" reshuffle into a different top-9 on any
// unrelated context change (e.g. toggling a favorite elsewhere), making it
// look like a card/image had broken. Shuffling is now done once per
// `products` identity via useMemo below, not on every render.
function shuffleOnce<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Each automatic section shows at most this many products on the Home —
// "Voir tout" links to the full, uncapped list on its own page.
const HOME_SECTION_LIMIT = 12;
const HOME_SHOPS_LIMIT = 6;

// Homepage-only preview row for a product section: a capped selection with
// a "Voir tout" link to the full list, horizontally swipeable on mobile
// instead of wrapping into extra rows.
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
  const preview = diversifyBySubcategory(products, HOME_SECTION_LIMIT);
  return (
    <>
      <div className="mb-6 flex items-end justify-between">
        <div><p className="eyebrow mb-1.5">{eyebrow}</p><h2 className="section-title">{title}</h2></div>
        <button onClick={() => onNavigate(seeAllRoute)} className="flex items-center gap-1 text-sm font-medium text-burgundy hover:underline">Voir tout <ChevronRight size={15} /></button>
      </div>
      {preview.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center"><p className="text-sm text-ink/50">Aucun produit trouvé.</p></div>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:gap-5 lg:grid-cols-6">
          {preview.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </>
  );
}

// Static fallback content — used until (or unless) an admin has published
// active rows in hero_slides / home_discover_tiles. Never removed outright:
// an empty Home would be worse than showing this curated default.
const staticHeroSlides: HeroSlide[] = [
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
  const { navigate, catalogProducts: products, catalogShops: displayShops } = useApp();

  // Hero and "À découvrir" are manually managed from the admin (hero_slides /
  // home_discover_tiles) — the static arrays above/in categories.ts are only
  // ever shown until an admin has published active rows, or if the tables
  // can't be reached (migration not run yet, network error, etc.).
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>(staticHeroSlides);
  const [discoverTiles, setDiscoverTiles] = useState<HomeCircleTile[]>(homeCircleTiles);

  useEffect(() => {
    let cancelled = false;
    fetchHeroSlides().then(({ slides, error }) => {
      if (cancelled || error) return;
      if (slides.length > 0) setHeroSlides(slides);
    });
    fetchDiscoverTiles().then(({ tiles, error }) => {
      if (cancelled || error) return;
      if (tiles.length > 0) setDiscoverTiles(tiles);
    });
    return () => { cancelled = true; };
  }, []);

  // Phase 1: official-Ezial-shop products are boosted to the front of each
  // section (rankProducts), never hidden — everything else just follows in
  // its existing order. "Pour vous" is shuffled first so its randomness is
  // preserved within each tier, then ranked so official products still
  // surface even when they wouldn't have landed in a random slice.
  const rankingContext = { isOfficialShop };
  // Tendances: real activity data (consultations/favoris/panier/achats)
  // doesn't exist yet — rankForTrending falls back to real product recency
  // (products.created_at) instead of simulating engagement numbers.
  const trending = rankForTrending(products, rankingContext);
  const promos = rankProducts(products.filter((p) => p.isPromo), rankingContext);
  // Shuffled once per `products` identity, not on every render — see
  // shuffleOnce's comment above.
  const pourVous = useMemo(() => rankProducts(shuffleOnce(products), { isOfficialShop }), [products]);
  const featuredShops = displayShops.slice(0, HOME_SHOPS_LIMIT);

  return (
    <div>
      <h1 className="sr-only">Ezial — Mode, beauté & lifestyle à Dakar</h1>

      {/* Hero + À découvrir intentionally share a tighter rhythm than the
          rest of the page — the goal was to close the gap right under the
          header and right under this circle row specifically, not the
          spacing between the sections further down. */}
      <div className="space-y-4 lg:space-y-6">
        <HeroCarousel slides={heroSlides} />

        <section>
          <div className="mb-5 flex items-end justify-between"><h2 className="section-title">À découvrir</h2></div>
          <DiscoverMarquee tiles={discoverTiles} onNavigate={navigate} />
        </section>
      </div>

      <div className="mt-10 space-y-16 lg:mt-14 lg:space-y-24">
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
          <div className="mb-6 flex items-end justify-between">
            <div><p className="eyebrow mb-1.5">Boutiques à découvrir</p><h2 className="section-title">Nos vendeurs sélectionnés</h2></div>
            <button onClick={() => navigate('/boutiques')} className="flex items-center gap-1 text-sm font-medium text-burgundy hover:underline whitespace-nowrap">Voir toutes les boutiques <ChevronRight size={15} /></button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{featuredShops.map((shop) => <ShopCard key={shop.id} shop={shop} />)}</div>
        </section>

        <section className="border-t border-line pt-12">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {[{ title: 'Livraison à Dakar', desc: 'Sous 4–48 h chez vous' }, { title: 'Boutiques sélectionnées', desc: 'Chaque vendeur est validé par EZIAL' }, { title: 'Paiement sécurisé', desc: 'Wave, Orange Money & PayPal' }].map((f) => (
              <div key={f.title} className="text-center sm:text-left"><h3 className="font-display text-lg font-semibold text-ink">{f.title}</h3><p className="mt-1 text-sm text-ink/55">{f.desc}</p></div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
