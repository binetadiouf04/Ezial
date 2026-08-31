import { AppProvider, useApp } from '@/store/AppContext';
import { ProProvider } from '@/pro/ProContext';
import Header from '@/components/Header';
import MobileBottomNav from '@/components/MobileBottomNav';
import MobileCategoryDrawer from '@/components/MobileCategoryDrawer';
import CartDrawer from '@/components/CartDrawer';
import CategorySidebar from '@/components/CategorySidebar';
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

  // Search: /recherche?q=...
  if (clean.startsWith('/recherche')) {
    const q = route.split('?q=')[1] ? decodeURIComponent(route.split('?q=')[1]) : '';
    return <SearchPage query={q} />;
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

function Layout() {
  const { route } = useApp();
  const clean = route.split('?')[0];
  const isHome = clean === '/' || clean === '';
  const isPro = clean === '/pro';
  const isCheckout = clean === '/checkout';
  const isOrderConfirm = clean.startsWith('/commande/');

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
        <div className="container-page flex gap-8 py-6">
          <CategorySidebar />
          <div className="min-w-0 flex-1">
            <RouteView />
          </div>
        </div>
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

      {/* Mobile bottom padding for nav */}
      <div className="h-16 lg:hidden" />
      <MobileBottomNav />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  );
}
