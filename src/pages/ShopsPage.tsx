import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import ShopCard from '@/components/ShopCard';
import { ChevronRight, Crown } from 'lucide-react';

// premiumOnly renders the dedicated "Boutiques Premium" page (/boutiques-premium)
// — same component, same real catalogShops, just pre-filtered and with no
// toggle of its own (it's already the Premium-only view). The general
// listing (/boutiques) keeps the toggle so a visitor can narrow to Premium
// without leaving it.
export default function ShopsPage({ premiumOnly = false }: { premiumOnly?: boolean }) {
  const { navigate, catalogShops } = useApp();
  const [filterPremium, setFilterPremium] = useState(premiumOnly);

  const shops = (premiumOnly || filterPremium) ? catalogShops.filter((s) => s.isPremium) : catalogShops;

  return (
    <div className="container-pro py-6">
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-ink/40">
        <button onClick={() => navigate('/')} className="hover:text-burgundy">Accueil</button>
        <ChevronRight size={12} />
        <span className="text-ink/70">{premiumOnly ? 'Boutiques Premium' : 'Boutiques'}</span>
      </nav>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">{premiumOnly ? 'Boutiques Premium' : 'Toutes les boutiques'}</h1>
          <p className="mt-2 text-sm text-ink/55">{shops.length} boutique{shops.length > 1 ? 's' : ''}</p>
        </div>
        {!premiumOnly && (
          <button
            onClick={() => setFilterPremium((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${filterPremium ? 'border-burgundy bg-burgundy text-white' : 'border-line text-ink/60'}`}
          >
            <Crown size={13} /> Premium uniquement
          </button>
        )}
      </div>
      {shops.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center"><p className="text-sm text-ink/50">{premiumOnly || filterPremium ? 'Aucune boutique Premium pour le moment.' : 'Aucune boutique trouvée.'}</p></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shops.map((shop) => <ShopCard key={shop.id} shop={shop} />)}
        </div>
      )}
    </div>
  );
}
