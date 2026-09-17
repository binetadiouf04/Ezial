import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import { fetchAdminOrders, type AdminOrderSummary } from '@/lib/supabaseAdminData';
import { formatFCFA } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { Search, ChevronRight, Loader2, AlertCircle } from 'lucide-react';

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

type Filter = 'all' | 'delivering';

export default function AdminOrders() {
  const { navigate } = usePro();
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setOrders(await fetchAdminOrders());
    } catch {
      setLoadError('Impossible de charger les commandes. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = orders
    .filter((o) => (filter === 'delivering' ? o.hasActiveDelivery : true))
    .filter((o) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return o.orderNumber.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q);
    });

  const deliveringCount = orders.filter((o) => o.hasActiveDelivery).length;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-ink">Commandes</h1>

      {/* Filter: all orders vs. deliveries still in progress (not yet
          "Livrée") — folds delivery tracking into Commandes instead of a
          separate main section. */}
      <div className="flex gap-2">
        <button onClick={() => setFilter('all')} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${filter === 'all' ? 'bg-burgundy text-white' : 'bg-white border border-line text-ink/60 hover:border-ink/20'}`}>
          Toutes
        </button>
        <button onClick={() => setFilter('delivering')} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${filter === 'delivering' ? 'bg-burgundy text-white' : 'bg-white border border-line text-ink/60 hover:border-ink/20'}`}>
          Livraisons en cours{deliveringCount > 0 ? ` (${deliveringCount})` : ''}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
        <input
          className="input-field pl-9"
          placeholder="Rechercher (n° commande, client)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loadError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}
        </p>
      )}

      {loading ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : (
        <div className="card divide-y divide-line">
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-ink/45">Aucune commande trouvée</p>
          ) : (
            filtered.map((order) => (
              <button key={order.id} onClick={() => navigate(`/admin/commandes/${order.id}`)} className="flex items-center gap-3 p-4 w-full text-left hover:bg-cream/40 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm font-semibold text-ink">{order.orderNumber}</p>
                    {order.fulfillmentType === 'pickup' && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-ink/5 text-ink/50">Retrait</span>}
                  </div>
                  <p className="text-xs text-ink/45 mt-0.5">{order.customerName} · {formatDate(order.createdAt)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-ink">{formatFCFA(order.totalAmount)}</p>
                  <div className="mt-1"><StatusChip status={order.status} /></div>
                </div>
                <ChevronRight size={16} className="text-ink/20 flex-shrink-0" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
