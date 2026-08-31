import { usePro } from '../../ProContext';
import { orders, productsByShop, formatFCFA, formatDateTime, commissionAmount, netAmount } from '../../data';
import SummaryCard from '../../components/SummaryCard';
import { StatusChip } from '../../components/StatusChip';
import { ShoppingBag, Package, Wallet, Clock, ChevronRight, Truck, Store } from 'lucide-react';

export default function SellerDashboard() {
  const { identifier, navigate, getSubOrderStatus } = usePro();
  const shopId = 'maison-fatou';

  // Derive seller's order portions from global orders
  const sellerOrders = orders
    .map((o) => {
      const sub = o.subOrders.find((s) => s.shopId === shopId);
      if (!sub) return null;
      return { ...o, subStatus: getSubOrderStatus(o.id, shopId, sub.status), items: sub.items };
    })
    .filter(Boolean) as { id: string; customerName: string; date: string; fulfillment: 'delivery' | 'pickup'; subStatus: string; items: { productId: string; productName: string; quantity: number; variants: Record<string, string> }[] }[];

  const newOrders = sellerOrders.filter((o) => o.subStatus === 'confirmed').length;
  const preparing = sellerOrders.filter((o) => o.subStatus === 'preparing').length;
  const ready = sellerOrders.filter((o) => o.subStatus === 'ready' || o.subStatus === 'ready_for_pickup').length;

  const shopProducts = productsByShop(shopId);
  const activeProducts = shopProducts.filter((p) => p.status === 'published').length;

  // Calculate available balance from delivered orders
  const deliveredOrders = sellerOrders.filter((o) => o.subStatus === 'delivered' || o.subStatus === 'picked_up');
  const sellerSubtotals = deliveredOrders.map((o) => {
    return o.items.reduce((sum, item) => {
      const p = shopProducts.find((pp) => pp.id === item.productId);
      return sum + (p ? p.price * item.quantity : 0);
    }, 0);
  });
  const availableBalance = sellerSubtotals.reduce((sum, gross) => sum + netAmount(gross), 0);

  const recentOrders = sellerOrders.slice(0, 5);

  const sellerSubtotal = (items: { productId: string; quantity: number }[]) => {
    return items.reduce((sum, item) => {
      const p = shopProducts.find((pp) => pp.id === item.productId);
      return sum + (p ? p.price * item.quantity : 0);
    }, 0);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Accueil</h1>
        <p className="mt-1 text-sm text-ink/55">Vue d'ensemble de votre activité</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Nouvelles commandes" value={newOrders} icon={<ShoppingBag size={16} />} onClick={() => navigate('/seller/commandes')} />
        <SummaryCard label="En préparation" value={preparing} icon={<Clock size={16} />} onClick={() => navigate('/seller/commandes')} />
        <SummaryCard label="Prêtes" value={ready} icon={<Package size={16} />} onClick={() => navigate('/seller/commandes')} />
        <SummaryCard label="Produits actifs" value={`${activeProducts} / 25`} icon={<Package size={16} />} onClick={() => navigate('/seller/produits')} />
      </div>

      <SummaryCard label="Solde disponible" value={formatFCFA(availableBalance)} icon={<Wallet size={16} />} accent onClick={() => navigate('/seller/finances')} />

      {/* Recent orders */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink">Commandes récentes</h2>
          <button onClick={() => navigate('/seller/commandes')} className="text-xs font-medium text-burgundy hover:underline">Voir tout</button>
        </div>
        <div className="card divide-y divide-line">
          {recentOrders.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink/45">Aucune commande récente</p>
          ) : (
            recentOrders.map((order) => {
              const subtotal = sellerSubtotal(order.items);
              return (
                <button key={order.id} onClick={() => navigate(`/seller/commandes/${order.id}`)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-cream/30 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-ink">{order.id}</span>
                      <StatusChip status={order.subStatus} />
                    </div>
                    <p className="mt-1 text-xs text-ink/45">{formatDateTime(order.date)}</p>
                    <p className="mt-0.5 text-xs text-ink/55 flex items-center gap-1">
                      {order.fulfillment === 'pickup' ? <><Store size={11} /> Retrait</> : <><Truck size={11} /> Livraison Ezial</>}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-ink">{formatFCFA(subtotal)}</p>
                    <ChevronRight size={16} className="ml-auto mt-1 text-ink/20" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
