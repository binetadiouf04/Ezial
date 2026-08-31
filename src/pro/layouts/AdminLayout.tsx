import { usePro } from '../ProContext';
import { LayoutDashboard, ShoppingBag, Package, Store, Truck, Users, Wallet, LogOut, ArrowLeft } from 'lucide-react';
import AdminDashboard from '../pages/admin/AdminDashboard';
import AdminOrders from '../pages/admin/AdminOrders';
import AdminOrderDetail from '../pages/admin/AdminOrderDetail';
import AdminProducts from '../pages/admin/AdminProducts';
import AdminProductDetail from '../pages/admin/AdminProductDetail';
import AdminShops from '../pages/admin/AdminShops';
import AdminShopDetail from '../pages/admin/AdminShopDetail';
import AdminDeliveries from '../pages/admin/AdminDeliveries';
import AdminDeliveryDetail from '../pages/admin/AdminDeliveryDetail';
import AdminDrivers from '../pages/admin/AdminDrivers';
import AdminDriverDetail from '../pages/admin/AdminDriverDetail';
import AdminFinances from '../pages/admin/AdminFinances';

const navItems = [
  { route: '/admin', label: 'Tableau de bord', icon: LayoutDashboard },
  { route: '/admin/commandes', label: 'Commandes', icon: ShoppingBag },
  { route: '/admin/produits', label: 'Produits', icon: Package },
  { route: '/admin/boutiques', label: 'Boutiques', icon: Store },
  { route: '/admin/livraisons', label: 'Livraisons', icon: Truck },
  { route: '/admin/livreurs', label: 'Livreurs', icon: Users },
  { route: '/admin/finances', label: 'Finances', icon: Wallet },
];

export default function AdminLayout() {
  const { route, navigate, logout } = usePro();

  const clean = route.split('?')[0];
  const orderDetailMatch = clean.match(/^\/admin\/commandes\/(.+)$/);
  const productDetailMatch = clean.match(/^\/admin\/produits\/(.+)$/);
  const shopDetailMatch = clean.match(/^\/admin\/boutiques\/(.+)$/);
  const deliveryDetailMatch = clean.match(/^\/admin\/livraisons\/(.+)$/);
  const driverDetailMatch = clean.match(/^\/admin\/livreurs\/(.+)$/);

  const renderPage = () => {
    if (clean === '/admin') return <AdminDashboard />;
    if (clean === '/admin/commandes') return <AdminOrders />;
    if (orderDetailMatch) return <AdminOrderDetail orderId={orderDetailMatch[1]} />;
    if (clean === '/admin/produits') return <AdminProducts />;
    if (productDetailMatch) return <AdminProductDetail productId={productDetailMatch[1]} />;
    if (clean === '/admin/boutiques') return <AdminShops />;
    if (shopDetailMatch) return <AdminShopDetail shopId={shopDetailMatch[1]} />;
    if (clean === '/admin/livraisons') return <AdminDeliveries />;
    if (deliveryDetailMatch) return <AdminDeliveryDetail missionId={deliveryDetailMatch[1]} />;
    if (clean === '/admin/livreurs') return <AdminDrivers />;
    if (driverDetailMatch) return <AdminDriverDetail driverId={driverDetailMatch[1]} />;
    if (clean === '/admin/finances') return <AdminFinances />;
    return <AdminDashboard />;
  };

  const isActive = (itemRoute: string) => {
    if (itemRoute === '/admin') return clean === '/admin';
    return clean.startsWith(itemRoute);
  };

  return (
    <div className="min-h-screen bg-cream/30 lg:flex">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 flex-col border-r border-line bg-white">
        <div className="p-5 border-b border-line">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-burgundy text-white">
              <LayoutDashboard size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Ezial Admin</p>
              <p className="text-xs text-ink/40">Supervision</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
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
            <ArrowLeft size={18} /> Marketplace
          </button>
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink/50 hover:bg-burgundy/5 hover:text-burgundy transition-colors">
            <LogOut size={18} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-20 border-b border-line bg-white px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">Ezial Admin</span>
        <button onClick={logout} className="text-ink/40 hover:text-burgundy"><LogOut size={18} /></button>
      </div>

      <div className="flex-1 min-w-0">
        <main className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto pb-24 lg:pb-8">
          {renderPage()}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-20 border-t border-line bg-white/95 backdrop-blur-md">
        <div className="flex items-stretch justify-around overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.route);
            return (
              <button key={item.route} onClick={() => navigate(item.route)} className="flex flex-col items-center gap-1 py-2.5 px-2 flex-shrink-0">
                <Icon size={20} className={active ? 'text-burgundy' : 'text-ink/45'} strokeWidth={active ? 2 : 1.7} />
                <span className={`text-[9px] font-medium ${active ? 'text-burgundy' : 'text-ink/45'}`}>{item.label}</span>
              </button>
            );
          })}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}
