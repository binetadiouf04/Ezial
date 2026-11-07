import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { searchProducts, type Product } from '@/data/products';
import { getShop, type Shop } from '@/data/shops';
import { homeCircleTiles, type HomeCircleTile } from '@/data/categories';
import ProductCard from '@/components/ProductCard';
import ShopCard from '@/components/ShopCard';
import HeroCarousel, { type HeroSlide } from '@/components/HeroCarousel';
import DiscoverMarquee from '@/components/DiscoverMarquee';
import { rankProducts, rankForYou, rankForTrendingByPopularity, diversifyBySubcategory, capPerSubcategory } from '@/lib/productRanking';
import { fetchHeroSlides, fetchDiscoverTiles } from '@/lib/supabaseHomeContent';
import { useShoppingSignals } from '@/lib/useShoppingSignals';
import { useProductPopularity } from '@/lib/supabasePopularity';
import { ChevronRight } from 'lucide-react';


// Loaded on demand: renders nothing until an article is published, so its
// code stays out of the main bundle.
const BlogHighlights = lazy(() => import('@/components/BlogHighlights'));
// Phase 1: resolves "official shop" purely from Supabase shops.is_official
// (via getShop's registry) — never a hardcoded id/slug/name. Phase 2 will
// extend RankingContext with buyer-behavior signals; this function itself
// won't need to change.
const isOfficialShop = (shopId: string): boolean => getShop(shopId)?.isOfficial === true;
// Ezial Plus shops (the official Ezial shop is Ezial Plus by default).
const isPlusShop = (shopId: string): boolean => {
  const shop = getShop(shopId);
  return shop?.isPremium === true || shop?.isOfficial === true;
};

// Each automatic section shows at most this many products on the Home —
// "Voir tout" links to the full, uncapped list on its own page.
const HOME_SECTION_LIMIT = 18;
const HOME_SHOPS_LIMIT = 6;

// "À découvrir" tiles (static or admin-managed) only point at real content:
// a tile is shown when the page it opens has at least one product of the
// loaded catalog — same matching as the destination page itself
// (CategoryPage: category/subcategory; /promos: isPromo; SearchPage:
// searchProducts' exact matches) — unless it is marked alwaysShow (Tissus).
// Returns null for a route of any other kind (kept as is).
function productsForTile(tile: HomeCircleTile, products: Product[], shops: Shop[]): Product[] | null {
  const [path, query = ''] = tile.route.split('?');
  const clean = path.replace(/\/+$/, '');
  if (clean.startsWith('/categorie/')) {
    const [, , categoryId, subId] = clean.split('/');
    if (!categoryId) return null;
    return products.filter((p) => p.category === categoryId && (!subId || p.subcategory === subId));
  }
  if (clean === '/promos') return products.filter((p) => p.isPromo);
  if (clean === '/recherche') {
    const raw = query.startsWith('q=') ? query.slice(2) : '';
    let q = raw;
    try { q = decodeURIComponent(raw); } catch { /* keep the raw text */ }
    if (!q.trim()) return null;
    return searchProducts(q, products, shops).exact;
  }
  return null;
}

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
  keepOrder = false,
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
  /** The list is already ranked (personalised / popularity): keep its order,
   * only capping each subcategory, instead of round-robin diversification. */
  keepOrder?: boolean;
}) {
  const preview = keepOrder
    ? capPerSubcategory(products, HOME_SECTION_LIMIT, 4)
    : diversifyBySubcategory(products, HOME_SECTION_LIMIT);
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
    // Delivery visual → the delivery page.
    id: 'livraison',
    alt: 'Livraison à Dakar en 4 h à 48 h',
    route: '/info/livraison',
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

  const rankingContext = { isOfficialShop };
  // « Tendances »: what people like most (favorites + purchases, see
  // product_popularity), Ezial Plus shops first; recency for the rest.
  const popularity = useProductPopularity();
  const trending = useMemo(() => rankForTrendingByPopularity(products, popularity, isPlusShop), [products, popularity]);
  const promos = rankProducts(products.filter((p) => p.isPromo), rankingContext);
  // « Vous aimerez »: from the visitor's own habits (purchases, favorites,
  // cart, recently viewed). Re-ranked when the catalog or the purchase
  // history arrives — not on every favorite/cart toggle, so the section
  // never reshuffles under the visitor's finger.
  const signals = useShoppingSignals();
  const signalsRef = useRef(signals);
  signalsRef.current = signals;
  const purchasedCount = signals.purchasedIds.length;
  const vousAimerez = useMemo(
    () => rankForYou(products, signalsRef.current, { isOfficialShop }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
    [products, purchasedCount],
  );
  // "Les boutiques Ezial": only active shops (catalogShops is already
  // filtered to status 'active') with at least one product in the public
  // catalog — never an empty storefront.
  const featuredShops = useMemo(() => {
    const shopIdsWithProducts = new Set(products.map((p) => p.shopId));
    return displayShops.filter((shop) => shopIdsWithProducts.has(shop.id)).slice(0, HOME_SHOPS_LIMIT);
  }, [displayShops, products]);
  // Filtered once the real catalog is known — never while it loads, so a
  // tile is never shown and then withdrawn.
  // A tile without its own image shows the photo of a real product of its
  // destination (e.g. Huiles & brumes).
  const visibleTiles = useMemo(() => {
    if (catalogLoading) return [];
    return discoverTiles.flatMap((tile) => {
      const matches = productsForTile(tile, products, displayShops);
      if (matches !== null && matches.length === 0 && !tile.alwaysShow) return [];
      if (tile.image) return [tile];
      const photo = matches?.map((p) => p.thumbnailUrl || p.images[0]).find(Boolean);
      return photo ? [{ ...tile, image: photo }] : [];
    });
  }, [catalogLoading, discoverTiles, products, displayShops]);

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
            <section>
              <HomeProductPreview eyebrow="Selon vos envies" title="Vous aimerez" products={vousAimerez} seeAllRoute="/pour-vous" onNavigate={navigate} priority keepOrder />
            </section>

            {promos.length > 0 && (
              <section className="rounded-2xl bg-burgundy/5 p-6 sm:p-10">
                <HomeProductPreview eyebrow="Promotions" title="Offres à ne pas manquer" products={promos} seeAllRoute="/promos" onNavigate={navigate} />
              </section>
            )}

            <section>
              <HomeProductPreview eyebrow="Les plus aimés" title="Tendances" products={trending} seeAllRoute="/tendances" onNavigate={navigate} keepOrder />
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

      </div>
    </div>
  );
}
