import { useEffect, useState } from 'react';
import { AppProvider, useApp } from '@/store/AppContext';
import { ProProvider } from '@/pro/ProContext';
import { getProduct } from '@/data/products';
import { getShop } from '@/data/shops';
import { categoryMap, type CategoryId } from '@/data/categories';
import Header from '@/components/Header';
import MobileCategoryDrawer from '@/components/MobileCategoryDrawer';
import CartDrawer from '@/components/CartDrawer';
import HomePage from '@/pages/HomePage';
import CategoryPage from '@/pages/CategoryPage';
import SearchPage from '@/pages/SearchPage';
import ProductPage from '@/pages/ProductPage';
import ShopPage from '@/pages/ShopPage';
import FavoritesPage from '@/pages/FavoritesPage';
import CartPage from '@/pages/CartPage';
import CheckoutPage from '@/pages/CheckoutPage';
import OrderConfirmationPage from '@/pages/OrderConfirmationPage';
import OrderTrackingPage from '@/pages/OrderTrackingPage';
import ProfilePage from '@/pages/ProfilePage';
import OrderDetailPage from '@/pages/OrderDetailPage';
import ProEntryPage from '@/pro/pages/ProEntryPage';
import Footer from '@/components/Footer';
import InfoPage from '@/pages/InfoPage';
import PromoPage from '@/pages/PromoPage';
import TrendingPage from '@/pages/TrendingPage';
import ForYouPage from '@/pages/ForYouPage';
import ShopsPage from '@/pages/ShopsPage';
import SimilarProductsPage from '@/pages/SimilarProductsPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';

// A Supabase password-recovery link redirects back here with `type=recovery`
// in the URL (as a hash fragment or a query param, depending on the auth
// flow type configured on the project) — checked once, synchronously, on
// first mount, so this never flips mid-session and never delays the normal
// app's first paint for the common case (no recovery link).
function isPasswordRecoveryLink(): boolean {
  return /type=recovery/.test(window.location.hash) || /type=recovery/.test(window.location.search);
}

function RouteView() {
  const { route } = useApp();
  const clean = route.split('?')[0];

  // EZIAL PRO entry — render outside marketplace layout
  if (clean === '/pro') return <ProEntryPage />;

  // Home
  if (clean === '/' || clean === '') return <HomePage />;

  // Category: /categorie/:id or /categorie/:id/:sub
  if (clean.startsWith('/categorie/')) {
    const parts = clean.split('/');
    const categoryId = parts[2];
    const subId = parts[3];
    if (categoryId) return <CategoryPage categoryId={categoryId} subId={subId} />;
  }

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

  // Shops listing: /boutiques
  if (clean === '/boutiques') return <ShopsPage />;

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

  // Fallback
  return <HomePage />;
}

const SITE_TITLE = 'Ezial';
const DEFAULT_DESCRIPTION = "Ezial est une marketplace qui réunit des boutiques de mode, beauté, bijoux et parfums à Dakar, avec livraison ou retrait en boutique.";

function setMetaDescription(content: string) {
  let tag = document.querySelector('meta[name="description"]');
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', 'description');
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function pageMetaFor(route: string): { title: string; description: string } {
  const clean = route.split('?')[0];
  if (clean === '/pro') return { title: `Ezial Pro — Espace de gestion`, description: "L'espace privé pour les administrateurs, vendeurs et livreurs de la marketplace Ezial." };
  if (clean.startsWith('/produit/')) {
    const p = getProduct(clean.split('/')[2]);
    if (p) return { title: `${p.name} — ${SITE_TITLE}`, description: p.description.slice(0, 155) };
  }
  if (clean.startsWith('/boutique/')) {
    const s = getShop(clean.split('/')[2]);
    if (s) return { title: `${s.name} — Boutique ${SITE_TITLE}`, description: s.description.slice(0, 155) };
  }
  if (clean.startsWith('/categorie/')) {
    const cat = categoryMap[clean.split('/')[2] as CategoryId];
    if (cat) return { title: `${cat.label} — ${SITE_TITLE}`, description: `Découvrez ${cat.label.toLowerCase()} sur Ezial, la marketplace mode et beauté à Dakar.` };
  }
  if (clean === '/panier') return { title: `Panier — ${SITE_TITLE}`, description: DEFAULT_DESCRIPTION };
  if (clean === '/checkout') return { title: `Commande — ${SITE_TITLE}`, description: DEFAULT_DESCRIPTION };
  if (clean.startsWith('/commande/')) return { title: `Confirmation de commande — ${SITE_TITLE}`, description: DEFAULT_DESCRIPTION };
  if (clean.startsWith('/suivi/')) return { title: `Suivi de commande — ${SITE_TITLE}`, description: DEFAULT_DESCRIPTION };
  if (clean.startsWith('/compte/commande/')) return { title: `Détail de commande — ${SITE_TITLE}`, description: DEFAULT_DESCRIPTION };
  if (clean === '/favoris') return { title: `Favoris — ${SITE_TITLE}`, description: DEFAULT_DESCRIPTION };
  if (clean === '/profil' || clean === '/commandes') return { title: `Mon compte — ${SITE_TITLE}`, description: DEFAULT_DESCRIPTION };
  if (clean === '/promos') return { title: `Promotions — ${SITE_TITLE}`, description: 'Toutes les offres et promotions en cours sur Ezial.' };
  if (clean === '/tendances') return { title: `Tendances — ${SITE_TITLE}`, description: 'Les produits tendances du moment sur Ezial.' };
  if (clean === '/pour-vous') return { title: `Sélection pour vous — ${SITE_TITLE}`, description: 'Notre sélection de produits personnalisée sur Ezial.' };
  if (clean === '/boutiques') return { title: `Boutiques — ${SITE_TITLE}`, description: 'Toutes les boutiques actives sur Ezial.' };
  if (clean.startsWith('/recherche')) return { title: `Recherche — ${SITE_TITLE}`, description: DEFAULT_DESCRIPTION };
  return { title: `${SITE_TITLE} — Mode, beauté & lifestyle à Dakar`, description: DEFAULT_DESCRIPTION };
}

function Layout() {
  const { route } = useApp();
  const clean = route.split('?')[0];
  const isHome = clean === '/' || clean === '';
  const isPro = clean === '/pro';
  const isCheckout = clean === '/checkout';
  const isOrderConfirm = clean.startsWith('/commande/');

  useEffect(() => {
    const { title, description } = pageMetaFor(route);
    document.title = title;
    setMetaDescription(description);
  }, [route]);

  // PRO page renders standalone — no marketplace header/nav
  if (isPro) {
    return (
      <ProProvider>
        <div className="min-h-screen bg-white">
          <RouteView />
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
          <RouteView />
        </main>
      ) : fullWidth ? (
        <main>
          <RouteView />
        </main>
      ) : (
        <main className="flex-1">
          <RouteView />
        </main>
      )}

      <Footer />
    </div>
  );
}

export default function App() {
  const [isRecovery] = useState(isPasswordRecoveryLink);
  if (isRecovery) return <ResetPasswordPage />;

  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  );
}
