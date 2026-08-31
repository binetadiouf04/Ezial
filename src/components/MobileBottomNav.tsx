import { Home, Grid2x2, Heart, User } from 'lucide-react';
import { useApp } from '@/store/AppContext';

export default function MobileBottomNav() {
  const { navigate, route, setCategoryDrawerOpen } = useApp();
  const items = [
    { id: 'home', label: 'Accueil', icon: Home, action: () => navigate('/') },
    { id: 'cat', label: 'Catégories', icon: Grid2x2, action: () => setCategoryDrawerOpen(true) },
    { id: 'fav', label: 'Favoris', icon: Heart, action: () => navigate('/favoris') },
    { id: 'profile', label: 'Profil', icon: User, action: () => navigate('/profil') },
  ];
  const isActive = (id: string) => { if (id === 'home') return route === '/' || route === ''; if (id === 'fav') return route === '/favoris'; if (id === 'profile') return route === '/profil'; return false; };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-line bg-white/95 backdrop-blur-md lg:hidden">
      <div className="flex items-stretch justify-around">
        {items.map((item) => { const active = isActive(item.id); const Icon = item.icon; return (
          <button key={item.id} onClick={item.action} className="relative flex flex-1 flex-col items-center gap-1 py-2.5">
            <span className="relative"><Icon size={21} className={active ? 'text-burgundy' : 'text-ink/50'} strokeWidth={active ? 2 : 1.7} /></span>
            <span className={`text-[10px] font-medium ${active ? 'text-burgundy' : 'text-ink/50'}`}>{item.label}</span>
          </button>
        ); })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
