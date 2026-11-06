import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import ShopCard from '@/components/ShopCard';
import { ChevronRight, Crown } from 'lucide-react';

// The "Ezial Plus uniquement" toggle narrows the list to shops with an
// active paid plan (server-computed isPremium); it changes neither order
// nor placement — every shop is listed the same way.
export default function ShopsPage() {
  const { navigate, catalogShops } = useApp();
  const [filterPlus, setFilterPlus] = useState(false);

  const shops = filterPlus ? catalogShops.filter((s) => s.isPremium) : catalogShops;

  return (
    <div className="container-pro py-6">
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-ink/40">
        <button onClick={() => navigate('/')} className="hover:text-burgundy">Accueil</button>
        <ChevronRight size={12} />
        <span className="text-ink/70">Boutiques</span>
      </nav>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">Toutes les boutiques</h1>
          <p className="mt-2 text-sm text-ink/55">{shops.length} boutique{shops.length > 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setFilterPlus((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${filterPlus ? 'border-burgundy bg-burgundy text-white' : 'border-line text-ink/60'}`}
        >
          <Crown size={13} /> Ezial Plus uniquement
        </button>
      </div>
      {shops.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center"><p className="text-sm text-ink/50">{filterPlus ? 'Aucune boutique Ezial Plus pour le moment.' : 'Aucune boutique trouvée.'}</p></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shops.map((shop) => <ShopCard key={shop.id} shop={shop} />)}
        </div>
      )}
    </div>
  );
}
