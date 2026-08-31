import { usePro } from '../ProContext';
import { Home, ShoppingBag, Package, Wallet, Store, LogOut, ArrowLeft } from 'lucide-react';
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

  const clean = route.split('?')[0];

  // Order detail: /seller/commandes/:id
  const orderDetailMatch = clean.match(/^\/seller\/commandes\/(.+)$/);
  // Product edit: /seller/produits/modifier/:id
  const productEditMatch = clean.match(/^\/seller\/produits\/modifier\/(.+)$/);
  // Product add: /seller/produits/ajouter
  const isProductAdd = clean === '/seller/produits/ajouter';

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
          <button onClick={() => { window.location.hash = '/'; }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink/50 hover:bg-cream hover:text-ink transition-colors">
            <ArrowLeft size={18} /> Retourner sur Ezial
          </button>
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink/50 hover:bg-burgundy/5 hover:text-burgundy transition-colors">
            <LogOut size={18} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-20 border-b border-line bg-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {sellerShop && <SmartImage src={sellerShop.logo} alt="" className="h-8 w-8 rounded-lg object-cover" />}
          <span className="text-sm font-semibold text-ink">{sellerShop?.name ?? name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => { window.location.hash = '/'; }} aria-label="Retourner sur Ezial" title="Retourner sur Ezial" className="rounded-lg p-2 text-ink/40 hover:text-burgundy transition-colors">
            <ArrowLeft size={18} />
          </button>
          <button onClick={logout} aria-label="Déconnexion" title="Déconnexion" className="rounded-lg p-2 text-ink/40 hover:text-burgundy transition-colors">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <main className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto pb-24 lg:pb-8">
          {renderPage()}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-20 border-t border-line bg-white/95 backdrop-blur-md">
        <div className="flex items-stretch justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.route);
            return (
              <button key={item.route} onClick={() => navigate(item.route)} className="flex flex-1 flex-col items-center gap-1 py-2.5">
                <Icon size={20} className={active ? 'text-burgundy' : 'text-ink/45'} strokeWidth={active ? 2 : 1.7} />
                <span className={`text-[10px] font-medium ${active ? 'text-burgundy' : 'text-ink/45'}`}>{item.label}</span>
              </button>
            );
          })}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}
