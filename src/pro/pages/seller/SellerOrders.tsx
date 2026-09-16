import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import { fetchSellerOrders, type SellerOrderSummary } from '@/lib/supabaseSellerOrders';
import { formatFCFA } from '@/data/products';
import { StatusChip } from '../../components/StatusChip';
import { Truck, Store, ChevronRight, Search, Loader2, AlertCircle } from 'lucide-react';

type Filter = 'all' | 'confirmed' | 'preparing' | 'ready' | 'done';

const filterLabels: Record<Filter, string> = {
  all: 'Toutes',
  confirmed: 'Nouvelles',
  preparing: 'En préparation',
  ready: 'Prêtes',
  done: 'Terminées',
};

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function SellerOrders() {
  const { navigate, sellerSupabaseShopId } = usePro();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState<SellerOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    if (!sellerSupabaseShopId) { setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    try {
      const rows = await fetchSellerOrders(sellerSupabaseShopId);
      setOrders(rows);
    } catch {
      setLoadError("Impossible de charger les commandes. Réessayez.");
    } finally {
      setLoading(false);
    }
  }, [sellerSupabaseShopId]);

  useEffect(() => { void load(); }, [load]);

  const filtered = orders.filter((o) => {
    if (filter === 'confirmed' && o.status !== 'confirmed') return false;
    if (filter === 'preparing' && o.status !== 'preparing') return false;
    if (filter === 'ready' && o.status !== 'ready' && o.status !== 'ready_for_pickup') return false;
    if (filter === 'done' && !['picked_up', 'delivering', 'delivered', 'collected'].includes(o.status)) return false;
    if (search && !o.orderNumber.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Commandes</h1>
        <p className="mt-1 text-sm text-ink/55">Les commandes contenant vos produits</p>
      </div>

      {!sellerSupabaseShopId ? (
        <div className="card p-10 text-center">
          <p className="text-sm text-ink/45">Disponible une fois votre boutique connectée à votre compte vendeur.</p>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" />
            <input className="input-field pl-10" placeholder="Rechercher par n° de commande..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto">
            {(Object.keys(filterLabels) as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${filter === f ? 'bg-burgundy text-white' : 'bg-white border border-line text-ink/60 hover:border-ink/20'}`}
              >
                {filterLabels[f]}
              </button>
            ))}
          </div>

          {loadError && (
            <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}
            </p>
          )}

          {/* Order list */}
          {loading ? (
            <div className="card p-10 text-center">
              <Loader2 size={20} className="mx-auto animate-spin text-ink/30" />
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.length === 0 ? (
                <div className="card p-10 text-center">
                  <p className="text-sm text-ink/45">Aucune commande pour le moment.</p>
                </div>
              ) : (
                filtered.map((order) => (
                  <button key={order.orderShopId} onClick={() => navigate(`/seller/commandes/${order.orderShopId}`)} className="card w-full p-4 text-left transition-all hover:border-ink/20 hover:card-shadow">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-ink">{order.orderNumber}</span>
                          <StatusChip status={order.status} />
                        </div>
                        <p className="mt-1 text-xs text-ink/45">{formatDateTime(order.createdAt)} · {order.customerName}</p>
                      </div>
                      <span className="text-xs text-ink/50 flex items-center gap-1 flex-shrink-0">
                        {order.fulfillmentType === 'pickup' ? <><Store size={12} /> Retrait</> : <><Truck size={12} /> Livraison Ezial</>}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-line pt-3">
                      <span className="text-xs text-ink/50">{order.itemCount} article{order.itemCount > 1 ? 's' : ''}</span>
                      <span className="text-sm font-semibold text-ink">{formatFCFA(order.shopSubtotal)}</span>
                      <span className="flex items-center gap-1 text-xs font-medium text-burgundy">Voir <ChevronRight size={14} /></span>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
