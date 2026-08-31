import { usePro } from '../ProContext';
import { Home, Truck, Wallet, User, LogOut } from 'lucide-react';
import DriverHome from '../pages/driver/DriverHome';
import DriverMissions from '../pages/driver/DriverMissions';
import DriverMissionDetail from '../pages/driver/DriverMissionDetail';
import DriverRevenue from '../pages/driver/DriverRevenue';
import DriverProfile from '../pages/driver/DriverProfile';

const navItems = [
  { route: '/driver', label: 'Accueil', icon: Home },
  { route: '/driver/livraisons', label: 'Livraisons', icon: Truck },
  { route: '/driver/revenus', label: 'Revenus', icon: Wallet },
  { route: '/driver/profil', label: 'Profil', icon: User },
];

export default function DriverLayout() {
  const { route, navigate, logout, name } = usePro();

  const clean = route.split('?')[0];
  const missionDetailMatch = clean.match(/^\/driver\/livraisons\/(.+)$/);

  const renderPage = () => {
    if (clean === '/driver') return <DriverHome />;
    if (clean === '/driver/livraisons') return <DriverMissions />;
    if (missionDetailMatch) return <DriverMissionDetail missionId={missionDetailMatch[1]} />;
    if (clean === '/driver/revenus') return <DriverRevenue />;
    if (clean === '/driver/profil') return <DriverProfile />;
    return <DriverHome />;
  };

  const isActive = (itemRoute: string) => {
    if (itemRoute === '/driver') return clean === '/driver';
    return clean.startsWith(itemRoute);
  };

  return (
    <div className="min-h-screen bg-cream/30">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur-md px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] text-ink/40 font-medium uppercase tracking-wider">Ezial Livreur</p>
          <p className="text-sm font-semibold text-ink">{name}</p>
        </div>
        <button onClick={logout} className="rounded-lg p-2 text-ink/40 hover:text-burgundy transition-colors">
          <LogOut size={18} />
        </button>
      </div>

      {/* Main content */}
      <main className="px-4 py-5 max-w-md mx-auto pb-24">
        {renderPage()}
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-line bg-white/95 backdrop-blur-md">
        <div className="flex items-stretch justify-around max-w-md mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.route);
            return (
              <button key={item.route} onClick={() => navigate(item.route)} className="flex flex-1 flex-col items-center gap-1 py-2.5">
                <Icon size={22} className={active ? 'text-burgundy' : 'text-ink/40'} strokeWidth={active ? 2.2 : 1.7} />
                <span className={`text-[10px] font-medium ${active ? 'text-burgundy' : 'text-ink/40'}`}>{item.label}</span>
              </button>
            );
          })}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}
