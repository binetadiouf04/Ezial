import { useApp } from '@/store/AppContext';
import ShopCard from '@/components/ShopCard';
import { ChevronRight } from 'lucide-react';

export default function ShopsPage() {
  const { navigate, catalogShops } = useApp();

  return (
    <div className="container-pro py-6">
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-ink/40">
        <button onClick={() => navigate('/')} className="hover:text-burgundy">Accueil</button>
        <ChevronRight size={12} />
        <span className="text-ink/70">Boutiques</span>
      </nav>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">Toutes les boutiques</h1>
        <p className="mt-2 text-sm text-ink/55">{catalogShops.length} boutique{catalogShops.length > 1 ? 's' : ''}</p>
      </div>
      {catalogShops.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center"><p className="text-sm text-ink/50">Aucune boutique trouvée.</p></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {catalogShops.map((shop) => <ShopCard key={shop.id} shop={shop} />)}
        </div>
      )}
    </div>
  );
}
