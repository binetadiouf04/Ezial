import { useState, useEffect } from 'react';
import { usePro } from '../ProContext';
import { navigateTo } from '@/store/AppContext';
import { LayoutDashboard, ShoppingBag, Package, Store, Wallet, LogOut, ArrowLeft, Layers, Truck, AlertTriangle, Star, Megaphone, Menu, X } from 'lucide-react';
import AdminDashboard from '../pages/admin/AdminDashboard';
import AdminContent from '../pages/admin/AdminContent';
import AdminOrders from '../pages/admin/AdminOrders';
import AdminOrderDetail from '../pages/admin/AdminOrderDetail';
import AdminClaims from '../pages/admin/AdminClaims';
import AdminClaimDetail from '../pages/admin/AdminClaimDetail';
import AdminReviews from '../pages/admin/AdminReviews';
import AdminPushCampaigns from '../pages/admin/AdminPushCampaigns';
import AdminProducts from '../pages/admin/AdminProducts';
import AdminShops from '../pages/admin/AdminShops';
import AdminShopDetail from '../pages/admin/AdminShopDetail';
import AdminDeliveries from '../pages/admin/AdminDeliveries';
import AdminDeliveryDetail from '../pages/admin/AdminDeliveryDetail';
import AdminDrivers from '../pages/admin/AdminDrivers';
import AdminDriverDetail from '../pages/admin/AdminDriverDetail';
import AdminFinances from '../pages/admin/AdminFinances';
import AdminShopFinanceDetail from '../pages/admin/AdminShopFinanceDetail';
import AdminBlog from '../pages/admin/AdminBlog';
import AdminBlogForm from '../pages/admin/AdminBlogForm';
import AdminBlogPreview from '../pages/admin/AdminBlogPreview';
import AdminBlogCategories from '../pages/admin/AdminBlogCategories';
import AdminNotificationBell from '../components/AdminNotificationBell';

const navItems = [
  { route: '/admin', label: 'Tableau de bord', icon: LayoutDashboard },
  { route: '/admin/commandes', label: 'Commandes', icon: ShoppingBag },
  { route: '/admin/reclamations', label: 'Réclamations', icon: AlertTriangle },
  { route: '/admin/produits', label: 'Produits', icon: Package },
  { route: '/admin/avis', label: 'Avis', icon: Star },
  { route: '/admin/notifications-promo', label: 'Promo', icon: Megaphone },
  { route: '/admin/boutiques', label: 'Boutiques', icon: Store },
  { route: '/admin/livreurs', label: 'Livreurs', icon: Truck },
  { route: '/admin/contenu', label: 'Contenu', icon: Layers },
  { route: '/admin/finances', label: 'Finances', icon: Wallet },
];

export default function AdminLayout() {
  const { route, navigate, logout } = usePro();
  const [menuOpen, setMenuOpen] = useState(false);

  const clean = route.split('?')[0];
  const goTo = (r: string) => { setMenuOpen(false); navigate(r); };
  const goToMarketplace = () => { navigateTo('/'); };
  const onNotificationNavigate = (url: string) => { setMenuOpen(false); navigate(url.replace(/^\/pro/, '')); };

  const orderDetailMatch = clean.match(/^\/admin\/commandes\/(.+)$/);
  const claimDetailMatch = clean.match(/^\/admin\/reclamations\/(.+)$/);
  const shopDetailMatch = clean.match(/^\/admin\/boutiques\/(.+)$/);
  const deliveryDetailMatch = clean.match(/^\/admin\/livraisons\/(.+)$/);
  const driverDetailMatch = clean.match(/^\/admin\/livreurs\/(.+)$/);
  const financeDetailMatch = clean.match(/^\/admin\/finances\/(.+)$/);
  const blogEditMatch = clean.match(/^\/admin\/blog\/modifier\/(.+)$/);
  const blogPreviewMatch = clean.match(/^\/admin\/blog\/apercu\/(.+)$/);

  // null = route inconnue de l'espace admin.
  const renderPage = () => {
    if (clean === '/admin') return <AdminDashboard />;
    if (clean === '/admin/commandes') return <AdminOrders />;
    if (orderDetailMatch) return <AdminOrderDetail orderId={orderDetailMatch[1]} />;
    if (clean === '/admin/reclamations') return <AdminClaims />;
    if (claimDetailMatch) return <AdminClaimDetail claimId={claimDetailMatch[1]} />;
    if (clean === '/admin/produits') return <AdminProducts />;
    if (clean === '/admin/avis') return <AdminReviews />;
    if (clean === '/admin/notifications-promo') return <AdminPushCampaigns />;
    if (clean === '/admin/boutiques') return <AdminShops />;
    if (shopDetailMatch) return <AdminShopDetail shopId={shopDetailMatch[1]} />;
    if (clean === '/admin/contenu') return <AdminContent />;
    if (clean === '/admin/blog') return <AdminBlog />;
    if (clean === '/admin/blog/categories') return <AdminBlogCategories />;
    if (clean === '/admin/blog/nouveau') return <AdminBlogForm />;
    if (blogEditMatch) return <AdminBlogForm postId={blogEditMatch[1]} />;
    if (blogPreviewMatch) return <AdminBlogPreview postId={blogPreviewMatch[1]} />;
    if (clean === '/admin/livraisons') return <AdminDeliveries />;
    if (deliveryDetailMatch) return <AdminDeliveryDetail missionId={deliveryDetailMatch[1]} />;
    if (clean === '/admin/livreurs') return <AdminDrivers />;
    if (driverDetailMatch) return <AdminDriverDetail driverId={driverDetailMatch[1]} />;
    if (clean === '/admin/finances') return <AdminFinances />;
    if (financeDetailMatch) return <AdminShopFinanceDetail shopId={financeDetailMatch[1]} />;
    return null;
  };

  const page = renderPage();
  const isUnknownRoute = page === null;

  // Route inconnue (section retirée comme /admin/abonnements ou
  // /admin/selection, encore présente dans d'anciennes notifications, ou
  // lien erroné) : le tableau de bord s'affiche immédiatement, puis l'URL
  // est remplacée par /pro/admin — replaceState et non pushState, pour que
  // le bouton Retour ne ramène pas sur la route inconnue en boucle. Le
  // popstate synthétique resynchronise ProContext et AppContext, comme le
  // fait déjà navigateTo().
  useEffect(() => {
    if (!isUnknownRoute) return;
    // Jamais de retour forcé dans l'admin si l'URL a déjà quitté Ezial Pro
    // (ex. « Retourner sur Ezial Marketplace »).
    if (!window.location.pathname.startsWith('/pro')) return;
    window.history.replaceState(null, '', '/pro/admin');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [isUnknownRoute]);

  const isActive = (itemRoute: string) => {
    if (itemRoute === '/admin') return clean === '/admin' || isUnknownRoute;
    // The blog screens belong to « Contenu ».
    if (itemRoute === '/admin/contenu' && clean.startsWith('/admin/blog')) return true;
    return clean.startsWith(itemRoute);
  };

  return (
    <div className="min-h-screen bg-cream/30 lg:flex">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 flex-col border-r border-line bg-white">
        <div className="p-5 border-b border-line">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-burgundy text-white">
              <LayoutDashboard size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink truncate">Ezial Admin</p>
              <p className="text-xs text-ink/40">Supervision</p>
            </div>
            <AdminNotificationBell onNavigate={onNotificationNavigate} />
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.route}
                onClick={() => navigate(item.route)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive(item.route) ? 'bg-burgundy/10 text-burgundy' : 'text-ink/60 hover:bg-cream hover:text-ink'}`}
              >
                <Icon size={18} /> {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-line space-y-1">
          <button onClick={goToMarketplace} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink/50 hover:bg-cream hover:text-ink transition-colors">
            <ArrowLeft size={18} /> Retourner sur Ezial Marketplace
          </button>
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink/50 hover:bg-burgundy/5 hover:text-burgundy transition-colors">
            <LogOut size={18} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* Mobile / tablet top bar — same pattern as the seller space: menu
          button on the left, notification bell and the marketplace-return
          control (compact text on phone) on the right. Déconnexion lives as
          an explicit text entry in the menu drawer below. */}
      <div className="lg:hidden sticky top-0 z-20 border-b border-line bg-white px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu" className="-ml-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-ink hover:bg-cream">
            <Menu size={22} />
          </button>
          <span className="truncate text-sm font-semibold text-ink">Ezial Admin</span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <AdminNotificationBell onNavigate={onNotificationNavigate} />
          <button
            onClick={goToMarketplace}
            className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink/60 hover:border-burgundy/30 hover:text-burgundy transition-colors"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">Retourner sur Ezial Marketplace</span>
            <span className="sm:hidden">Marketplace</span>
          </button>
        </div>
      </div>

      {/* Mobile / tablet menu drawer — replaces the old fixed bottom tab bar;
          carries every admin section, opened on demand from the left. */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/30 fade-in" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[82%] max-w-xs bg-white slide-up flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-4 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-burgundy text-white">
                  <LayoutDashboard size={18} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">Ezial Admin</p>
                  <p className="truncate text-xs text-ink/40">Supervision</p>
                </div>
              </div>
              <button onClick={() => setMenuOpen(false)} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full hover:bg-cream" aria-label="Fermer le menu">
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.route);
                return (
                  <button
                    key={item.route}
                    onClick={() => goTo(item.route)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${active ? 'bg-burgundy/10 text-burgundy' : 'text-ink/60 hover:bg-cream hover:text-ink'}`}
                  >
                    <Icon size={18} /> {item.label}
                  </button>
                );
              })}
            </nav>
            {/* Explicit text entries — never hidden, never icon-only — so
                both actions are always reachable from the mobile menu. */}
            <div className="border-t border-line p-3 space-y-1">
              <button
                onClick={() => { setMenuOpen(false); goToMarketplace(); }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink/60 hover:bg-cream hover:text-ink transition-colors"
              >
                <ArrowLeft size={18} /> Retourner sur Ezial Marketplace
              </button>
              <button
                onClick={() => { setMenuOpen(false); logout(); }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-burgundy hover:bg-burgundy/5 transition-colors"
              >
                <LogOut size={18} /> Déconnexion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <main className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto pb-8">
          {page ?? <AdminDashboard />}
        </main>
      </div>
    </div>
  );
}
