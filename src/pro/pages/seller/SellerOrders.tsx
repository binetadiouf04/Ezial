import { useState } from 'react';
import { usePro } from '../../ProContext';
import { orders, productsByShop, formatFCFA, formatDateTime } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { Truck, Store, ChevronRight, Search } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

type Filter = 'all' | 'confirmed' | 'preparing' | 'ready' | 'done';

const filterLabels: Record<Filter, string> = {
  all: 'Toutes',
  confirmed: 'Nouvelles',
  preparing: 'En préparation',
  ready: 'Prêtes',
  done: 'Terminées',
};

export default function SellerOrders() {
  const { navigate, getSubOrderStatus } = usePro();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const shopId = 'maison-fatou';
  const shopProducts = productsByShop(shopId);

  const sellerOrders = orders
    .map((o) => {
      const sub = o.subOrders.find((s) => s.shopId === shopId);
      if (!sub) return null;
      return {
        id: o.id,
        customerName: o.customerName,
        date: o.date,
        fulfillment: o.fulfillment,
        subStatus: getSubOrderStatus(o.id, shopId, sub.status),
        items: sub.items,
      };
    })
    .filter(Boolean) as { id: string; customerName: string; date: string; fulfillment: 'delivery' | 'pickup'; subStatus: string; items: { productId: string; productName: string; quantity: number; variants: Record<string, string> }[] }[];

  const filtered = sellerOrders.filter((o) => {
    if (filter === 'confirmed' && o.subStatus !== 'confirmed') return false;
    if (filter === 'preparing' && o.subStatus !== 'preparing') return false;
    if (filter === 'ready' && o.subStatus !== 'ready' && o.subStatus !== 'ready_for_pickup') return false;
    if (filter === 'done' && o.subStatus !== 'delivered' && o.subStatus !== 'picked_up') return false;
    if (search && !o.id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const sellerSubtotal = (items: { productId: string; quantity: number }[]) =>
    items.reduce((sum, item) => {
      const p = shopProducts.find((pp) => pp.id === item.productId);
      return sum + (p ? p.price * item.quantity : 0);
    }, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Commandes</h1>
        <p className="mt-1 text-sm text-ink/55">Les commandes contenant vos produits</p>
      </div>

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

      {/* Order list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="text-sm text-ink/45">Aucune commande pour le moment.</p>
          </div>
        ) : (
          filtered.map((order) => {
            const subtotal = sellerSubtotal(order.items);
            return (
              <button key={order.id} onClick={() => navigate(`/seller/commandes/${order.id}`)} className="card w-full p-4 text-left transition-all hover:border-ink/20 hover:card-shadow">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-ink">{order.id}</span>
                      <StatusChip status={order.subStatus} />
                    </div>
                    <p className="mt-1 text-xs text-ink/45">{formatDateTime(order.date)}</p>
                  </div>
                  <span className="text-xs text-ink/50 flex items-center gap-1 flex-shrink-0">
                    {order.fulfillment === 'pickup' ? <><Store size={12} /> Retrait</> : <><Truck size={12} /> Livraison Ezial</>}
                  </span>
                </div>
                {/* Products */}
                <div className="space-y-2">
                  {order.items.map((item, i) => {
                    const p = shopProducts.find((pp) => pp.id === item.productId);
                    return (
                      <div key={i} className="flex items-center gap-2.5">
                        {p && <SmartImage src={p.image} alt="" className="h-10 w-9 rounded object-cover flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-ink line-clamp-1">{item.productName}</p>
                          {Object.entries(item.variants).length > 0 && (
                            <p className="text-[11px] text-ink/45">{Object.entries(item.variants).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
                          )}
                          <p className="text-[11px] text-ink/45">Quantité : {item.quantity}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between border-t border-line mt-3 pt-3">
                  <span className="text-sm font-semibold text-ink">{formatFCFA(subtotal)}</span>
                  <span className="flex items-center gap-1 text-xs font-medium text-burgundy">Voir la commande <ChevronRight size={14} /></span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
