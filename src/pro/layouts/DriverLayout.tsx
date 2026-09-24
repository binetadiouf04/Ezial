import { usePro } from '../ProContext';
import { Home, Truck, History, User, LogOut, ArrowLeft, X } from 'lucide-react';
import DriverHome from '../pages/driver/DriverHome';
import DriverMissions from '../pages/driver/DriverMissions';
import DriverMissionDetail from '../pages/driver/DriverMissionDetail';
import DriverHistory from '../pages/driver/DriverHistory';
import DriverProfile from '../pages/driver/DriverProfile';

const navItems = [
  { route: '/driver', label: 'Accueil', icon: Home },
  { route: '/driver/livraisons', label: 'Livraisons', icon: Truck },
  { route: '/driver/historique', label: 'Historique', icon: History },
  { route: '/driver/profil', label: 'Profil', icon: User },
];

export default function DriverLayout() {
  const { route, navigate, logout, name, isDriverMissionsLoading, driverVisibleMissions, driverActionError, clearDriverActionError } = usePro();

  const clean = route.split('?')[0];
  const missionDetailMatch = clean.match(/^\/driver\/livraisons\/(.+)$/);

  const renderPage = () => {
    // Only block the very first load with a skeleton — a background
    // refetch after a mutation must never hide already-visible missions.
    if (isDriverMissionsLoading && driverVisibleMissions.length === 0) {
      return (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-24 animate-pulse bg-ink/5" />
          ))}
        </div>
      );
    }
    if (clean === '/driver') return <DriverHome />;
    if (clean === '/driver/livraisons') return <DriverMissions />;
    if (missionDetailMatch) return <DriverMissionDetail missionId={missionDetailMatch[1]} />;
    if (clean === '/driver/historique') return <DriverHistory />;
    if (clean === '/driver/profil') return <DriverProfile />;
    return <DriverHome />;
  };

  const isActive = (itemRoute: string) => {
    if (itemRoute === '/driver') return clean === '/driver';
    return clean.startsWith(itemRoute);
  };

  return (
    <div className="min-h-screen bg-cream/30">
      {/* Top bar — no side menu on this layout, so both actions are shown
          directly as explicit text, never a bare ambiguous icon. */}
      <div className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur-md px-4 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-ink/40 font-medium uppercase tracking-wider">Ezial Livreur</p>
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            onClick={() => { window.location.hash = '/'; }}
            className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink/60 hover:border-burgundy/30 hover:text-burgundy transition-colors"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">Retourner sur Ezial Marketplace</span>
            <span className="sm:hidden">Marketplace</span>
          </button>
          <button onClick={logout} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-burgundy hover:bg-burgundy/5 transition-colors">
            <LogOut size={14} /> Déconnexion
          </button>
        </div>
      </div>

      {/* Real mutation errors (RLS/network) — surfaced once, globally, so
          every driver action (accept/collect/start) shows a failure even
          though its onClick doesn't await the result. */}
      {driverActionError && (
        <div className="mx-4 mt-3 max-w-md sm:mx-auto rounded-lg bg-burgundy/5 border border-burgundy/20 p-3 flex items-start justify-between gap-2">
          <p className="text-sm text-burgundy">{driverActionError}</p>
          <button onClick={clearDriverActionError} className="flex-shrink-0 text-burgundy/60 hover:text-burgundy">
            <X size={16} />
          </button>
        </div>
      )}

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
