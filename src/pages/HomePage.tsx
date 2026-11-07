import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { searchProducts, type Product } from '@/data/products';
import { getShop, type Shop } from '@/data/shops';
import { homeCircleTiles, type HomeCircleTile } from '@/data/categories';
import { DELIVERY } from '@/shared/siteInfo';
import ProductCard from '@/components/ProductCard';
import ShopCard from '@/components/ShopCard';
import HeroCarousel, { type HeroSlide } from '@/components/HeroCarousel';
import DiscoverMarquee from '@/components/DiscoverMarquee';
import EditorialSelection from '@/components/EditorialSelection';
import { rankProducts, rankForTrending, diversifyBySubcategory } from '@/lib/productRanking';
import { fetchHeroSlides, fetchDiscoverTiles } from '@/lib/supabaseHomeContent';
import { ChevronRight, Truck, Store, Smartphone } from 'lucide-react';


// Loaded on demand: renders nothing until an article is published, so its
// code stays out of the main bundle.
const BlogHighlights = lazy(() => import('@/components/BlogHighlights'));
// Phase 1: resolves "official shop" purely from Supabase shops.is_official
// (via getShop's registry) — never a hardcoded id/slug/name. Phase 2 will
// extend RankingContext with buyer-behavior signals; this function itself
// won't need to change.
const isOfficialShop = (shopId: string): boolean => getShop(shopId)?.isOfficial === true;

// Fisher–Yates — `.sort(() => 0.5 - Math.random())` is not a valid
// comparator and (combined with being re-run on every render) is what let
// "Inspirations" reshuffle into a different top-9 on any
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

// "À découvrir" tiles (static or admin-managed) only point at real content:
// a tile is shown when the page it opens has at least one product of the
// loaded catalog — same matching as the destination page itself
// (CategoryPage: category/subcategory; /promos: isPromo; SearchPage:
// searchProducts' exact matches). A route of any other kind is kept as is.
function tileHasProducts(tile: HomeCircleTile, products: Product[], shops: Shop[]): boolean {
  const [path, query = ''] = tile.route.split('?');
  const clean = path.replace(/\/+$/, '');
  if (clean.startsWith('/categorie/')) {
    const [, , categoryId, subId] = clean.split('/');
    if (!categoryId) return true;
    return products.some((p) => p.category === categoryId && (!subId || p.subcategory === subId));
  }
  if (clean === '/promos') return products.some((p) => p.isPromo);
  if (clean === '/recherche') {
    const raw = query.startsWith('q=') ? query.slice(2) : '';
    let q = raw;
    try { q = decodeURIComponent(raw); } catch { /* keep the raw text */ }
    if (!q.trim()) return true;
    return searchProducts(q, products, shops).exact.length > 0;
  }
  return true;
}

// Reassurance band — each line checked against what Ezial actually offers
// (delivery promise from src/shared/siteInfo.js, payment methods from
// src/data/payments.ts).
const reassurance = [
  { id: 'livraison', icon: Truck, title: `Livraison en ${DELIVERY.delay}`, desc: `À ${DELIVERY.area}, directement chez vous` },
  { id: 'boutiques', icon: Store, title: 'Boutiques locales', desc: 'Mode, beauté et lifestyle à Dakar' },
  { id: 'paiement', icon: Smartphone, title: 'Paiement Wave et Orange Money', desc: 'Réglez vos achats depuis votre téléphone' },
];

// Homepage-only preview row for a product section: a capped selection with
// a "Voir tout" link to the full list, horizontally swipeable on mobile
// instead of wrapping into extra rows.
function HomeProductPreview({
  eyebrow,
  title,
  products,
  seeAllRoute,
  onNavigate,
  priority = false,
}: {
  eyebrow: string;
  title: string;
  products: Product[];
  seeAllRoute: string;
  onNavigate: (route: string) => void;
  /** Only the first section actually rendered on the page (closest to the
   * fold) should skip lazy loading — marking every section priority would
   * just make all of them compete for bandwidth at once. */
  priority?: boolean;
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
          {preview.map((p, i) => <ProductCard key={p.id} product={p} priority={priority && i < 3} />)}
        </div>
      )}
    </>
  );
}

// Static fallback content — used until (or unless) an admin has published
// active rows in hero_slides / home_discover_tiles. Never removed outright:
// an empty Home would be worse than showing this curated default.
// Banner images live in public/hero/, one file per format (phone 750×600,
// iPad 1024×520, computer 1600×600).
const heroFormats = (name: string) => ({
  mobile: `/hero/${name}-mobile.webp`,
  tablet: `/hero/${name}-ipad.webp`,
  desktop: `/hero/${name}-ordinateur.webp`,
});

const staticHeroSlides: HeroSlide[] = [
  {
    id: 'mode-femme',
    alt: 'Looks de fêtes : élégance et style pour les fêtes — mode femme',
    route: '/categorie/vetements/femme',
    images: heroFormats('banniere-1-mode-femme'),
  },
  {
    id: 'mode-homme',
    alt: 'Homme : mode et style au quotidien',
    route: '/categorie/vetements/homme',
    images: heroFormats('banniere-2-mode-homme'),
  },
  {
    id: 'tendances',
    alt: 'Livraison à Dakar en 4 h à 48 h',
    route: '/tendances',
    images: heroFormats('banniere-3-livraison'),
  },
  {
    id: 'beaute',
    alt: 'Beauté : maquillage et soin de la peau',
    route: '/categorie/beaute',
    images: heroFormats('banniere-4-beaute'),
  },
  {
    // Existing « Made in Sénégal » section (same route as its « À découvrir »
    // tile): products their sellers marked « Fait à la main ».
    id: 'made-in-senegal',
    alt: 'Mode modeste et traditionnelle — Made in Sénégal',
    route: '/recherche?q=made in senegal',
    images: heroFormats('banniere-5-made-in-senegal'),
  },
  {
    id: 'parfums',
    alt: 'Parfums de fêtes, pour lui et pour elle',
    route: '/categorie/parfums',
    images: heroFormats('banniere-6-parfums'),
  },
];

export default function HomePage() {
  const { navigate, catalogProducts: products, catalogShops: displayShops, catalogLoading } = useApp();

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
  // "Les boutiques Ezial": only active shops (catalogShops is already
  // filtered to status 'active') with at least one product in the public
  // catalog — never an empty storefront.
  const featuredShops = useMemo(() => {
    const shopIdsWithProducts = new Set(products.map((p) => p.shopId));
    return displayShops.filter((shop) => shopIdsWithProducts.has(shop.id)).slice(0, HOME_SHOPS_LIMIT);
  }, [displayShops, products]);
  // Filtered once the real catalog is known — never while it loads, so a
  // tile is never shown and then withdrawn.
  const visibleTiles = useMemo(
    () => (catalogLoading ? [] : discoverTiles.filter((tile) => tileHasProducts(tile, products, displayShops))),
    [catalogLoading, discoverTiles, products, displayShops],
  );

  return (
    <div>
      <h1 className="sr-only">Ezial — Mode, beauté & lifestyle à Dakar</h1>

      {/* Hero + À découvrir intentionally share a tighter rhythm than the
          rest of the page — the goal was to close the gap right under the
          header and right under this circle row specifically, not the
          spacing between the sections further down. */}
      <div className="space-y-4 lg:space-y-6">
        <HeroCarousel slides={heroSlides} />

        {visibleTiles.length > 0 && (
          <section>
            <div className="mb-5 flex items-end justify-between"><h2 className="section-title">À découvrir</h2></div>
            <DiscoverMarquee tiles={visibleTiles} onNavigate={navigate} />
          </section>
        )}
      </div>

      <div className="mt-10 space-y-16 lg:mt-14 lg:space-y-24">
        {catalogLoading ? (
          // Never the demo/mock catalog while the real one is still in
          // flight — a plain loading line here instead is what stops an
          // old/fake product from ever flashing on a first visit.
          <section className="py-16 text-center"><p className="text-sm text-ink/45">Chargement des produits…</p></section>
        ) : (
          <>
            {/* Random draw of the catalog (shuffleOnce) — named for what it
                is, not presented as personalized. */}
            <section>
              <HomeProductPreview eyebrow="Le catalogue Ezial" title="Inspirations" products={pourVous} seeAllRoute="/pour-vous" onNavigate={navigate} priority />
            </section>

            {/* Renders nothing unless at least one pick qualifies. */}
            <EditorialSelection />

            {promos.length > 0 && (
              <section className="rounded-2xl bg-burgundy/5 p-6 sm:p-10">
                <HomeProductPreview eyebrow="Promotions" title="Offres à ne pas manquer" products={promos} seeAllRoute="/promos" onNavigate={navigate} />
              </section>
            )}

            <section>
              <HomeProductPreview eyebrow="Nouveaux sur Ezial" title="Nouveautés" products={trending} seeAllRoute="/tendances" onNavigate={navigate} />
            </section>
          </>
        )}

        {featuredShops.length > 0 && (
          <section>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
              <div><p className="eyebrow mb-1.5">Boutiques à découvrir</p><h2 className="section-title">Les boutiques Ezial</h2></div>
              <button onClick={() => navigate('/boutiques')} className="flex items-center gap-1 text-sm font-medium text-burgundy hover:underline whitespace-nowrap">Voir toutes les boutiques <ChevronRight size={15} /></button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{featuredShops.map((shop) => <ShopCard key={shop.id} shop={shop} />)}</div>
          </section>
        )}

        {/* Renders nothing while no article is published. */}
        <Suspense fallback={null}><BlogHighlights /></Suspense>

        <section className="border-t border-line pt-12" aria-label="Nos engagements">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
            {reassurance.map((f) => {
              const Icon = f.icon;
              const highlighted = f.id === 'livraison';
              return (
                <div
                  key={f.id}
                  className={`flex items-start gap-3.5 ${highlighted ? 'rounded-2xl bg-burgundy p-5 text-white shadow-lg shadow-burgundy/15 sm:-my-2' : 'px-1 sm:pt-3'}`}
                >
                  <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${highlighted ? 'bg-white/15 text-champagne' : 'bg-cream text-burgundy'}`}>
                    <Icon size={19} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className={`font-display font-semibold leading-tight ${highlighted ? 'text-2xl text-white' : 'text-lg text-ink'}`}>{f.title}</h3>
                    <p className={`mt-1 text-sm ${highlighted ? 'text-white/80' : 'text-ink/55'}`}>{f.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
