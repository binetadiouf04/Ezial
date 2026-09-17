import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import { fetchAdminShops, updateShopStatus, type AdminShopSummary } from '@/lib/supabaseAdminData';
import { StatusChip } from '../../components/StatusChip';
import { Search, Loader2, AlertCircle, Check, X, Ban, MapPin, Phone } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminShops() {
  const { navigate } = usePro();
  const [shops, setShops] = useState<AdminShopSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [acting, setActing] = useState<string | null>(null);

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

  const act = async (shopId: string, status: 'active' | 'suspended' | 'rejected') => {
    setActing(shopId);
    const result = await updateShopStatus(shopId, status);
    setActing(null);
    if (!result.error) setShops((prev) => prev.map((s) => s.id === shopId ? { ...s, status } : s));
  };

  const pending = shops.filter((s) => s.status === 'pending');
  const filtered = shops.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || (s.sellerCode ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-ink">Boutiques</h1>

      {loadError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}
        </p>
      )}

      {loading ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : (
        <>
          {/* Demandes en attente — un bouton, pas un processus compliqué */}
          {pending.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-ink">Demandes en attente ({pending.length})</h2>
              {pending.map((shop) => (
                <div key={shop.id} className="card p-4 border-amber-200 bg-amber-50/30 space-y-3">
                  <div className="flex items-center gap-3">
                    {shop.logoUrl && <SmartImage src={shop.logoUrl} alt="" className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <button onClick={() => navigate(`/admin/boutiques/${shop.id}`)} className="text-sm font-semibold text-ink hover:text-burgundy truncate">{shop.name}</button>
                      {shop.sellerCode && <p className="text-xs text-ink/45 font-mono mt-0.5">{shop.sellerCode}</p>}
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink/45">
                        {shop.phone && <span className="flex items-center gap-1"><Phone size={10} /> {shop.phone}</span>}
                        {shop.neighborhood && <span className="flex items-center gap-1"><MapPin size={10} /> {shop.neighborhood}</span>}
                        {shop.createdAt && <span>Demande le {formatDate(shop.createdAt)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => void act(shop.id, 'active')} disabled={acting === shop.id} className="btn-primary flex-1"><Check size={15} /> Approuver</button>
                    <button onClick={() => void act(shop.id, 'rejected')} disabled={acting === shop.id} className="btn-outline flex-1"><X size={15} /> Refuser</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
            <input className="input-field pl-9" placeholder="Rechercher une boutique" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="card p-8 text-center"><p className="text-sm text-ink/45">Aucune boutique trouvée.</p></div>
            ) : (
              filtered.map((shop) => (
                <div key={shop.id} className="card w-full p-4 flex items-center gap-3">
                  <button onClick={() => navigate(`/admin/boutiques/${shop.id}`)} className="flex flex-1 min-w-0 items-center gap-3 text-left">
                    {shop.logoUrl && <SmartImage src={shop.logoUrl} alt="" className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{shop.name}</p>
                      {shop.sellerCode && <p className="text-xs text-ink/45 font-mono mt-0.5">{shop.sellerCode}</p>}
                      <p className="text-xs text-ink/45 mt-1.5">{shop.activeProductCount} produit{shop.activeProductCount > 1 ? 's' : ''} actif{shop.activeProductCount > 1 ? 's' : ''}</p>
                    </div>
                  </button>
                  <StatusChip status={shop.status} size="md" />
                  {shop.status === 'active' && (
                    <button onClick={() => void act(shop.id, 'suspended')} disabled={acting === shop.id} title="Suspendre" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-ink/40 hover:bg-burgundy/5 hover:text-burgundy"><Ban size={16} /></button>
                  )}
                  {shop.status === 'suspended' && (
                    <button onClick={() => void act(shop.id, 'active')} disabled={acting === shop.id} title="Réactiver" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-ink/40 hover:bg-green-50 hover:text-green-700"><Check size={16} /></button>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
