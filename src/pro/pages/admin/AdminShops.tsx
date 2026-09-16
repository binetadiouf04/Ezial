import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import { fetchAdminShops, type AdminShopSummary } from '@/lib/supabaseAdminData';
import { StatusChip } from '../../components/StatusChip';
import { Search, Loader2, AlertCircle } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

export default function AdminShops() {
  const { navigate } = usePro();
  const [shops, setShops] = useState<AdminShopSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setShops(await fetchAdminShops());
    } catch {
      setLoadError('Impossible de charger les boutiques. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = shops.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || (s.sellerCode ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-ink">Boutiques</h1>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
        <input className="input-field pl-9" placeholder="Rechercher une boutique" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loadError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}
        </p>
      )}

      {loading ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="card p-8 text-center"><p className="text-sm text-ink/45">Aucune boutique trouvée.</p></div>
          ) : (
            filtered.map((shop) => (
              <button key={shop.id} onClick={() => navigate(`/admin/boutiques/${shop.id}`)} className="card w-full p-4 flex items-center gap-3 text-left hover:card-shadow transition-all">
                {shop.logoUrl && <SmartImage src={shop.logoUrl} alt="" className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{shop.name}</p>
                  {shop.sellerCode && <p className="text-xs text-ink/45 font-mono mt-0.5">{shop.sellerCode}</p>}
                  <p className="text-xs text-ink/45 mt-1.5">{shop.activeProductCount} produit{shop.activeProductCount > 1 ? 's' : ''} actif{shop.activeProductCount > 1 ? 's' : ''}</p>
                </div>
                <StatusChip status={shop.status} size="md" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
