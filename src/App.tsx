import { useEffect, useState, Suspense, lazy } from 'react';
import { getStaffSpace } from '@/lib/staffSpace';
import { AppProvider, useApp } from '@/store/AppContext';
import { ProProvider } from '@/pro/ProContext';
import type { Product } from '@/data/products';
import type { Shop } from '@/data/shops';
import { categoryMap, type CategoryId } from '@/data/categories';
import { findProductByKey, productPublicPath } from '@/lib/productUrl';
import {
  applyHeadTags, absoluteUrl, SITE_URL as SEO_SITE_URL, DEFAULT_OG_TITLE, DEFAULT_OG_DESCRIPTION, DEFAULT_OG_IMAGE, type HeadTags,
} from '@/lib/seoHead';
import Header from '@/components/Header';
import MobileCategoryDrawer from '@/components/MobileCategoryDrawer';
import CartDrawer from '@/components/CartDrawer';
import Footer from '@/components/Footer';
import { Loader2 } from 'lucide-react';
import HomePage from '@/pages/HomePage';

// Everything below is only ever needed once the visitor actually
// navigates there — kept out of the bundle every first-time visitor to
// the homepage had to download in full before. Ezial Pro in particular
// (admin/seller/driver) is a large, completely separate render tree from
// the public marketplace (see RouteView below) and almost nobody hits it,
// so it's the single biggest win here.
const CategoryPage = lazy(() => import('@/pages/CategoryPage'));
const SearchPage = lazy(() => import('@/pages/SearchPage'));
const ProductPage = lazy(() => import('@/pages/ProductPage'));
const ShopPage = lazy(() => import('@/pages/ShopPage'));
const FavoritesPage = lazy(() => import('@/pages/FavoritesPage'));
const CartPage = lazy(() => import('@/pages/CartPage'));
const CheckoutPage = lazy(() => import('@/pages/CheckoutPage'));
const OrderConfirmationPage = lazy(() => import('@/pages/OrderConfirmationPage'));
const OrderTrackingPage = lazy(() => import('@/pages/OrderTrackingPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const OrderDetailPage = lazy(() => import('@/pages/OrderDetailPage'));
const ProEntryPage = lazy(() => import('@/pro/pages/ProEntryPage'));
const InfoPage = lazy(() => import('@/pages/InfoPage'));
const BecomeSellerPage = lazy(() => import('@/pages/BecomeSellerPage'));
const PromoPage = lazy(() => import('@/pages/PromoPage'));
const TrendingPage = lazy(() => import('@/pages/TrendingPage'));
const ForYouPage = lazy(() => import('@/pages/ForYouPage'));
const ShopsPage = lazy(() => import('@/pages/ShopsPage'));
const SimilarProductsPage = lazy(() => import('@/pages/SimilarProductsPage'));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'));
const AuthConfirmPage = lazy(() => import('@/pages/AuthConfirmPage'));
const BlogIndexPage = lazy(() => import('@/pages/blog/BlogIndexPage'));
const BlogPostPage = lazy(() => import('@/pages/blog/BlogPostPage'));
const BlogCategoryPage = lazy(() => import('@/pages/blog/BlogCategoryPage'));

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 size={24} className="animate-spin text-ink/30" />
    </div>
  );
}

// A Supabase password-recovery link redirects back here with `type=recovery`
// in the URL (as a hash fragment or a query param, depending on the auth
// flow type configured on the project) — checked once, synchronously, on
// first mount, so this never flips mid-session and never delays the normal
// app's first paint for the common case (no recovery link).
function isPasswordRecoveryLink(): boolean {
  return /type=recovery/.test(window.location.hash) || /type=recovery/.test(window.location.search);
}

// A signup-confirmation link (customer or seller) redirects back here with
// `type=signup` in the URL — Supabase sets this regardless of whether the
// project's actual token exchange is implicit (#access_token=...) or PKCE
// (?code=...), exactly like `type=recovery` above. Checked once,
// synchronously, so AuthConfirmPage renders standalone (no AppProvider/
// ProProvider race, no premature routing) before any session exists yet.
function isEmailConfirmationLink(): boolean {
  return /type=signup/.test(window.location.hash) || /type=signup/.test(window.location.search);
}

function RouteView() {
  const { route } = useApp();
  const clean = route.split('?')[0];

  // EZIAL PRO entry — render outside marketplace layout. Ezial Pro's own
  // sub-route (seller/admin/driver pages) lives after "/pro" in this same
  // hash (see ProContext's proSubRouteFromHash) so a refresh on any of
  // those pages still matches here instead of falling through to Home.
  if (getStaffSpace() || clean === '/pro' || clean.startsWith('/pro/')) return <ProEntryPage />;

  // Home
  if (clean === '/' || clean === '') return <HomePage />;

  // Category: /categorie/:id or /categorie/:id/:sub
  if (clean.startsWith('/categorie/')) {
    const parts = clean.split('/');
    const categoryId = parts[2];
    const subId = parts[3];
    if (categoryId) return <CategoryPage categoryId={categoryId} subId={subId} />;
  }

  // « Devenir vendeur »: public presentation of selling on Ezial
  if (clean === '/devenir-vendeur') return <BecomeSellerPage />;

  // Promos: /promos
  if (clean === '/promos') return <PromoPage />;

  // Trending: /tendances
  if (clean === '/tendances') return <TrendingPage />;

  // For you: /pour-vous
  if (clean === '/pour-vous') return <ForYouPage />;

  // Search: /recherche?q=...
  if (clean.startsWith('/recherche')) {
    const q = route.split('?q=')[1] ? decodeURIComponent(route.split('?q=')[1]) : '';
    return <SearchPage query={q} />;
  }

  // Similar products: /produit/:id/similaires (must be checked before the
  // plain /produit/:id route below)
  if (clean.startsWith('/produit/') && clean.endsWith('/similaires')) {
    const productId = clean.split('/')[2];
    if (productId) return <SimilarProductsPage productId={productId} />;
  }

  // Product: /produit/:id
  if (clean.startsWith('/produit/')) {
    const productId = clean.split('/')[2];
    if (productId) return <ProductPage productId={productId} />;
  }

  // Shop: /boutique/:id
  if (clean.startsWith('/boutique/')) {
    const shopId = clean.split('/')[2];
    if (shopId) return <ShopPage shopId={shopId} />;
  }

  // Shops listing: /boutiques — the former /boutiques-premium page is
  // gone; old links to it land on the regular listing.
  if (clean === '/boutiques' || clean === '/boutiques-premium') return <ShopsPage />;

  // Static pages
  if (clean === '/favoris') return <FavoritesPage />;
  if (clean === '/panier') return <CartPage />;
  if (clean === '/checkout') return <CheckoutPage />;
  if (clean === '/profil') return <ProfilePage />;
  if (clean === '/commandes') return <ProfilePage />;

  // Order confirmation: /commande/:id
  if (clean.startsWith('/commande/')) {
    const orderId = clean.split('/')[2];
    if (orderId) return <OrderConfirmationPage orderId={orderId} />;
  }

  // Order tracking: /suivi/:id
  if (clean.startsWith('/suivi/')) {
    const orderId = clean.split('/')[2];
    if (orderId) return <OrderTrackingPage orderId={orderId} />;
  }

  // Order detail from account: /compte/commande/:id
  if (clean.startsWith('/compte/commande/')) {
    const orderId = clean.split('/')[3];
    if (orderId) return <OrderDetailPage orderId={orderId} />;
  }

  // Info pages: /info/:slug
  if (clean.startsWith('/info/')) {
    const slug = clean.split('/')[2];
    if (slug) return <InfoPage slug={slug} />;
  }

  // Blog: /blog, /blog/categorie/:slug, /blog/:slug
  if (clean === '/blog') return <BlogIndexPage />;
  if (clean.startsWith('/blog/categorie/')) {
    const slug = clean.split('/')[3];
    if (slug) return <BlogCategoryPage slug={slug} />;
  }
  if (clean.startsWith('/blog/')) {
    const slug = clean.split('/')[2];
    if (slug) return <BlogPostPage slug={slug} />;
  }

  // Fallback
  return <HomePage />;
}

const SITE_TITLE = 'Ezial';
// Same text as index.html's meta description (what the homepage serves).
const DEFAULT_DESCRIPTION = "Ezial est une marketplace qui réunit des boutiques de mode, beauté, cheveux, bijoux et parfums à Dakar, avec livraison ou retrait en boutique.";
const DEFAULT_TITLE = `${SITE_TITLE} — Mode, beauté & lifestyle à Dakar`;

// A route without a page of its own for search engines (cart, account,
// Ezial Pro...): the same tags as a fresh load of index.html, i.e. the
// homepage canonical and the default Open Graph card.
function plainTags(title: string, description: string): HeadTags {
  return {
    title, description, canonical: `${SEO_SITE_URL}/`,
    ogTitle: DEFAULT_OG_TITLE, ogDescription: DEFAULT_OG_DESCRIPTION, ogImage: DEFAULT_OG_IMAGE, ogType: 'website',
  };
}

// A page that has its own indexable URL: Open Graph mirrors title and
// description, exactly like the static pages from scripts/prerender-seo.mjs.
function pageTags(title: string, description: string, path: string, ogImage = DEFAULT_OG_IMAGE, ogType: HeadTags['ogType'] = 'website'): HeadTags {
  return { title, description, canonical: `${SEO_SITE_URL}${path}`, ogTitle: title, ogDescription: description, ogImage, ogType };
}

interface CatalogForHead { catalogProducts: Product[]; catalogShops: Shop[] }

// null = leave the <head> as it is. A product or shop missing from the
// loaded catalog is either gone (its page then sets noindex itself) or the
// catalog failed to load — in both cases the tags already served for that
// URL are a better answer than the homepage's.
function headTagsFor(route: string, { catalogProducts, catalogShops }: CatalogForHead): HeadTags | null {
  const clean = route.split('?')[0];
  const parts = clean.split('/');

  if (clean === '/' || clean === '') {
    return plainTags(DEFAULT_TITLE, DEFAULT_DESCRIPTION);
  }
  if (clean === '/pro' || clean.startsWith('/pro/')) return plainTags(`Ezial Pro — Espace de gestion`, "L'espace privé pour les administrateurs, vendeurs et livreurs de la marketplace Ezial.");

  // Blog pages set their own tags once their article / category is loaded.
  if (clean === '/blog' || clean.startsWith('/blog/')) return null;

  // /produit/:slug (or a legacy /produit/:id) — not /produit/:key/similaires,
  // which has no page of its own.
  if (parts[1] === 'produit' && parts[2] && parts.length === 3) {
    const p = findProductByKey(catalogProducts, parts[2]);
    if (p) {
      const title = `${p.name} — ${p.price.toLocaleString('fr-FR')} FCFA | ${SITE_TITLE}`;
      const description = (p.description || `${p.name} disponible sur Ezial, marketplace mode, beauté et accessoires au Sénégal.`).slice(0, 160);
      return pageTags(title, description, productPublicPath(p), p.images[0] ? absoluteUrl(p.images[0]) : DEFAULT_OG_IMAGE, 'product');
    }
    return null;
  }

  if (parts[1] === 'boutique' && parts[2]) {
    const s = catalogShops.find((item) => item.id === parts[2]);
    if (s) {
      const description = (s.description || `Découvrez la boutique ${s.name} sur Ezial.`).slice(0, 160);
      const logo = /^https?:\/\//.test(s.logo) ? s.logo : DEFAULT_OG_IMAGE;
      return pageTags(`${s.name} — Boutique ${SITE_TITLE}`, description, `/boutique/${s.id}/`, logo);
    }
    return null;
  }

  if (parts[1] === 'categorie' && parts[2]) {
    const cat = categoryMap[parts[2] as CategoryId];
    if (cat) {
      const subId = parts[3];
      const sub = subId ? (cat.subcategories.find((item) => item.id === subId)?.label ?? subId) : null;
      const title = sub ? `${sub} — ${cat.label} au Sénégal | ${SITE_TITLE}` : `${cat.label} au Sénégal | ${SITE_TITLE}`;
      const description = `Découvrez les produits ${sub ? `${sub.toLowerCase()} de la catégorie ${cat.label.toLowerCase()}` : cat.label.toLowerCase()} sur Ezial, marketplace mode, beauté et accessoires au Sénégal.`.slice(0, 160);
      return pageTags(title, description, sub ? `/categorie/${cat.id}/${subId}/` : `/categorie/${cat.id}/`);
    }
    return plainTags(DEFAULT_TITLE, DEFAULT_DESCRIPTION);
  }

  if (clean === '/boutiques' || clean === '/boutiques-premium') {
    return pageTags(`Toutes les boutiques | ${SITE_TITLE}`, 'Toutes les boutiques actives sur Ezial, la marketplace mode, beauté et accessoires au Sénégal.', '/boutiques/');
  }

  // Info pages set their own tags (InfoPage), like the blog — their texts
  // stay out of the main bundle. Same for « Devenir vendeur ».
  if (parts[1] === 'info' || clean === '/devenir-vendeur') return null;

  if (clean === '/panier') return plainTags(`Panier — ${SITE_TITLE}`, DEFAULT_DESCRIPTION);
  if (clean === '/checkout') return plainTags(`Commande — ${SITE_TITLE}`, DEFAULT_DESCRIPTION);
  if (clean.startsWith('/commande/')) return plainTags(`Confirmation de commande — ${SITE_TITLE}`, DEFAULT_DESCRIPTION);
  if (clean.startsWith('/suivi/')) return plainTags(`Suivi de commande — ${SITE_TITLE}`, DEFAULT_DESCRIPTION);
  if (clean.startsWith('/compte/commande/')) return plainTags(`Détail de commande — ${SITE_TITLE}`, DEFAULT_DESCRIPTION);
  if (clean === '/favoris') return plainTags(`Favoris — ${SITE_TITLE}`, DEFAULT_DESCRIPTION);
  if (clean === '/profil' || clean === '/commandes') return plainTags(`Mon compte — ${SITE_TITLE}`, DEFAULT_DESCRIPTION);
  if (clean === '/promos') return plainTags(`Promotions — ${SITE_TITLE}`, 'Toutes les offres et promotions en cours sur Ezial.');
  if (clean === '/tendances') return plainTags(`Tendances — ${SITE_TITLE}`, 'Les produits les plus aimés sur Ezial.');
  if (clean === '/pour-vous') return plainTags(`Vous aimerez — ${SITE_TITLE}`, 'Des produits choisis selon vos envies parmi le catalogue Ezial.');
  if (clean.startsWith('/recherche')) return plainTags(`Recherche — ${SITE_TITLE}`, DEFAULT_DESCRIPTION);
  return plainTags(DEFAULT_TITLE, DEFAULT_DESCRIPTION);
}

function Layout() {
  const { route, catalogProducts, catalogShops, catalogLoading } = useApp();
  const clean = route.split('?')[0];
  const isHome = clean === '/' || clean === '';
  const isPro = getStaffSpace() !== null || clean === '/pro' || clean.startsWith('/pro/');
  const isCheckout = clean === '/checkout';
  const isOrderConfirm = clean.startsWith('/commande/');

  // Until the real catalog has loaded, the <head> is left exactly as
  // served — on a prerendered product/shop page that is already the right
  // content, and guessing before the data arrives is what used to replace
  // it with the generic site title.
  useEffect(() => {
    if (catalogLoading) return;
    const tags = headTagsFor(route, { catalogProducts, catalogShops });
    if (tags) applyHeadTags(tags);
  }, [route, catalogProducts, catalogShops, catalogLoading]);

  // PRO page renders standalone — no marketplace header/nav
  if (isPro) {
    return (
      <ProProvider>
        <div className="min-h-screen bg-white">
          <Suspense fallback={<RouteFallback />}><RouteView /></Suspense>
        </div>
      </ProProvider>
    );
  }

  const fullWidth = isCheckout || isOrderConfirm;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />
      <MobileCategoryDrawer />
      <CartDrawer />

      {isHome ? (
        <main className="container-page flex-1 pt-2 pb-6">
          <Suspense fallback={<RouteFallback />}><RouteView /></Suspense>
        </main>
      ) : fullWidth ? (
        <main>
          <Suspense fallback={<RouteFallback />}><RouteView /></Suspense>
        </main>
      ) : (
        <main className="flex-1">
          <Suspense fallback={<RouteFallback />}><RouteView /></Suspense>
        </main>
      )}

      <Footer />
    </div>
  );
}

export default function App() {
  const [isRecovery] = useState(isPasswordRecoveryLink);
  const [isEmailConfirm] = useState(isEmailConfirmationLink);

  if (isRecovery) return <Suspense fallback={<RouteFallback />}><ResetPasswordPage /></Suspense>;
  // Standalone, exactly like ResetPasswordPage above — no AppProvider/
  // ProProvider mounted yet, so nothing (the hash router, the catalog
  // fetch, a hashchange listener) can race ahead and repaint the plain
  // homepage before the session is actually established and routed.
  if (isEmailConfirm) return <Suspense fallback={<RouteFallback />}><AuthConfirmPage /></Suspense>;

  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  );
}
