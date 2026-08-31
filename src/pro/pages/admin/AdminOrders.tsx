import { useState } from 'react';
import { usePro } from '../../ProContext';
import { formatFCFA, formatDate } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { Search, ChevronRight } from 'lucide-react';

type Filter = 'all' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'pickup' | 'incident';

const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Toutes' },
  { id: 'confirmed', label: 'Confirmées' },
  { id: 'preparing', label: 'En préparation' },
  { id: 'ready', label: 'Prêtes' },
  { id: 'out_for_delivery', label: 'En livraison' },
  { id: 'delivered', label: 'Livrées' },
  { id: 'pickup', label: 'Retrait' },
  { id: 'incident', label: 'Avec incident' },
];

export default function AdminOrders() {
  const { allOrders, navigate, missions, resolvedIncidents } = usePro();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const incidentOrderIds = new Set(
    missions.filter((m) => m.incident && !resolvedIncidents.includes(m.id)).map((m) => m.orderId),
  );

  const filtered = allOrders.filter((o) => {
    if (filter === 'incident') {
      return incidentOrderIds.has(o.id) || o.status === 'return_requested';
    }
    if (filter === 'pickup') return o.fulfillment === 'pickup';
    if (filter === 'all') return true;
    return o.status === filter;
  }).filter((o) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return o.id.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.subOrders.some((s) => s.shopName.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-ink">Commandes</h1>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
        <input
          className="input-field pl-9"
          placeholder="Rechercher (n° commande, client, boutique)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${filter === f.id ? 'bg-burgundy text-white' : 'bg-white border border-line text-ink/60 hover:border-ink/20'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Orders list */}
      <div className="card divide-y divide-line">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink/45">Aucune commande trouvée</p>
        ) : (
          filtered.map((order) => (
            <button key={order.id} onClick={() => navigate(`/admin/commandes/${order.id}`)} className="flex items-center gap-3 p-4 w-full text-left hover:bg-cream/40 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-mono text-sm font-semibold text-ink">{order.id}</p>
                  {order.fulfillment === 'pickup' && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-ink/5 text-ink/50">Retrait</span>}
                  {incidentOrderIds.has(order.id) && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-50 text-orange-600">Incident</span>}
                </div>
                <p className="text-xs text-ink/45 mt-0.5">{order.customerName} · {order.subOrders.length} boutique{order.subOrders.length > 1 ? 's' : ''} · {formatDate(order.date)}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-ink">{formatFCFA(order.total)}</p>
                <div className="mt-1"><StatusChip status={order.status} /></div>
              </div>
              <ChevronRight size={16} className="text-ink/20 flex-shrink-0" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
