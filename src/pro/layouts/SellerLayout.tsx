import { useState } from 'react';
import { usePro } from '../ProContext';
import { Home, ShoppingBag, Package, Wallet, Store, LogOut, ArrowLeft, Menu, X } from 'lucide-react';
import SellerDashboard from '../pages/seller/SellerDashboard';
import SellerOrders from '../pages/seller/SellerOrders';
import SellerOrderDetail from '../pages/seller/SellerOrderDetail';
import SellerProducts from '../pages/seller/SellerProducts';
import SellerProductForm from '../pages/seller/SellerProductForm';
import SellerFinances from '../pages/seller/SellerFinances';
import SellerShop from '../pages/seller/SellerShop';
import SmartImage from '@/components/SmartImage';

const navItems = [
  { route: '/seller', label: 'Accueil', icon: Home },
  { route: '/seller/commandes', label: 'Commandes', icon: ShoppingBag },
  { route: '/seller/produits', label: 'Produits', icon: Package },
  { route: '/seller/finances', label: 'Finances', icon: Wallet },
  { route: '/seller/boutique', label: 'Ma boutique', icon: Store },
];

export default function SellerLayout() {
  const { route, navigate, logout, name, identifier, sellerShop } = usePro();
  const [menuOpen, setMenuOpen] = useState(false);

  const clean = route.split('?')[0];
  const goTo = (r: string) => { setMenuOpen(false); navigate(r); };

  // Order detail: /seller/commandes/:id
  const orderDetailMatch = clean.match(/^\/seller\/commandes\/(.+)$/);
  // Product edit: /seller/produits/modifier/:id
  const productEditMatch = clean.match(/^\/seller\/produits\/modifier\/(.+)$/);
  // Product add: /seller/produits/ajouter
  const isProductAdd = clean === '/seller/produits/ajouter';
  // Add/Modifier un produit already has its own contextual "Produits" back
  // action — "Retourner sur Ezial Marketplace" here made no sense mid-edit
  // (it left Ezial Pro entirely) and contradicted that in-page control. On
  // this page only, this control becomes a plain "Retour" to the product
  // list instead — same destination as the in-page one, never the public
  // marketplace, and routed through navigate() (SPA, no reload) like every
  // other nav item here, instead of a raw hash assignment.
  const isOnProductForm = isProductAdd || Boolean(productEditMatch);

  const renderPage = () => {
    if (clean === '/seller') return <SellerDashboard />;
    if (clean === '/seller/commandes') return <SellerOrders />;
    if (orderDetailMatch) return <SellerOrderDetail orderId={orderDetailMatch[1]} />;
    if (clean === '/seller/produits') return <SellerProducts />;
    if (isProductAdd) return <SellerProductForm />;
    if (productEditMatch) return <SellerProductForm productId={productEditMatch[1]} />;
    if (clean === '/seller/finances') return <SellerFinances />;
    if (clean === '/seller/boutique') return <SellerShop />;
    return <SellerDashboard />;
  };

  const isActive = (itemRoute: string) => {
    if (itemRoute === '/seller') return clean === '/seller';
    return clean.startsWith(itemRoute);
  };

  return (
    <div className="min-h-screen bg-cream/30 lg:flex">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 flex-col border-r border-line bg-white">
        <div className="p-5 border-b border-line">
          <div className="flex items-center gap-3">
            {sellerShop && <SmartImage src={sellerShop.logo} alt="" className="h-10 w-10 rounded-lg object-cover" />}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink truncate">{sellerShop?.name ?? name}</p>
              <p className="text-xs text-ink/40 font-mono">{identifier}</p>
            </div>
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
          <button onClick={() => (isOnProductForm ? navigate('/seller/produits') : navigate('/'))} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink/50 hover:bg-cream hover:text-ink transition-colors">
            <ArrowLeft size={18} /> {isOnProductForm ? 'Retour' : 'Retourner sur Ezial Marketplace'}
          </button>
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink/50 hover:bg-burgundy/5 hover:text-burgundy transition-colors">
            <LogOut size={18} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* Mobile top bar — the marketplace-return control lives here (visible
          at every width, compact text on phone); Déconnexion lives as an
          explicit text entry in the mobile menu drawer below, never as a
          bare icon anyone could miss. */}
      <div className="lg:hidden sticky top-0 z-20 border-b border-line bg-white px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu" className="-ml-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-ink hover:bg-cream">
            <Menu size={22} />
          </button>
          {sellerShop && <SmartImage src={sellerShop.logo} alt="" className="h-8 w-8 flex-shrink-0 rounded-lg object-cover" />}
          <span className="truncate text-sm font-semibold text-ink">{sellerShop?.name ?? name}</span>
        </div>
        <button
          onClick={() => (isOnProductForm ? navigate('/seller/produits') : navigate('/'))}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink/60 hover:border-burgundy/30 hover:text-burgundy transition-colors"
        >
          <ArrowLeft size={14} />
          {isOnProductForm ? (
            <span>Retour</span>
          ) : (
            <>
              <span className="hidden sm:inline">Retourner sur Ezial Marketplace</span>
              <span className="sm:hidden">Marketplace</span>
            </>
          )}
        </button>
      </div>

      {/* Mobile menu drawer — replaces the old fixed bottom nav; carries the
          same 5 destinations (Accueil, Commandes, Produits, Finances, Ma
          boutique), opened on demand instead of pinned on screen so it can
          never cover page content or interfere with scrolling. */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/30 fade-in" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[82%] max-w-xs bg-white slide-up flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-4 py-4">
              <div className="flex min-w-0 items-center gap-3">
                {sellerShop && <SmartImage src={sellerShop.logo} alt="" className="h-9 w-9 rounded-lg object-cover" />}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{sellerShop?.name ?? name}</p>
                  <p className="truncate text-xs text-ink/40 font-mono">{identifier}</p>
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
                onClick={() => { setMenuOpen(false); navigate(isOnProductForm ? '/seller/produits' : '/'); }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink/60 hover:bg-cream hover:text-ink transition-colors"
              >
                <ArrowLeft size={18} /> {isOnProductForm ? 'Retour' : 'Retourner sur Ezial Marketplace'}
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
        <main className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto pb-8">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
