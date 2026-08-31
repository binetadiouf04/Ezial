import { usePro } from '../../ProContext';
import { orders, productsByShop, formatFCFA, formatDateTime, commissionAmount, netAmount } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { ArrowLeft, Truck, Store, Phone, Check, Clock, Package } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

export default function SellerOrderDetail({ orderId }: { orderId: string }) {
  const { navigate, getSubOrderStatus, advanceSubOrder } = usePro();
  const shopId = 'maison-fatou';
  const shopProducts = productsByShop(shopId);

  const order = orders.find((o) => o.id === orderId);
  const sub = order?.subOrders.find((s) => s.shopId === shopId);

  if (!order || !sub) {
    return (
      <div className="text-center py-16">
        <Package size={36} className="mx-auto text-ink/20" />
        <p className="mt-3 text-sm text-ink/55">Commande introuvable</p>
        <button onClick={() => navigate('/seller/commandes')} className="btn-outline mt-4">Retour aux commandes</button>
      </div>
    );
  }

  const status = getSubOrderStatus(order.id, shopId, sub.status);
  const isDelivery = order.fulfillment === 'delivery';
  const isPickup = order.fulfillment === 'pickup';

  const sellerSubtotal = sub.items.reduce((sum, item) => {
    const p = shopProducts.find((pp) => pp.id === item.productId);
    return sum + (p ? p.price * item.quantity : 0);
  }, 0);

  const commission = commissionAmount(sellerSubtotal);
  const net = netAmount(sellerSubtotal);

  const statusLabels: Record<string, string> = {
    confirmed: 'Nouvelle commande',
    preparing: 'En préparation',
    ready: 'Prête',
    ready_for_pickup: 'Prête à récupérer',
    picked_up: 'Récupérée',
    delivered: 'Livrée',
  };

  const actionLabel = (): string | null => {
    if (isDelivery) {
      if (status === 'confirmed') return 'Commencer la préparation';
      if (status === 'preparing') return 'Marquer comme prête';
    } else {
      if (status === 'confirmed') return 'Commencer la préparation';
      if (status === 'preparing') return 'Marquer comme prête à récupérer';
      if (status === 'ready_for_pickup') return 'Confirmer le retrait';
    }
    return null;
  };

  const action = actionLabel();

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/seller/commandes')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors">
        <ArrowLeft size={16} /> Commandes
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Commande {order.id}</h1>
          <p className="mt-1 text-sm text-ink/55">{formatDateTime(order.date)}</p>
        </div>
        <StatusChip status={status} size="md" />
      </div>

      {/* Products */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink mb-4">Articles</h2>
        <div className="space-y-4">
          {sub.items.map((item, i) => {
            const p = shopProducts.find((pp) => pp.id === item.productId);
            return (
              <div key={i} className="flex gap-3">
                {p && <SmartImage src={p.image} alt="" className="h-16 w-14 rounded-lg object-cover flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">{item.productName}</p>
                  {p && <p className="text-xs text-ink/40 mt-0.5 font-mono">Réf. {p.reference}</p>}
                  {Object.entries(item.variants).length > 0 && (
                    <p className="text-xs text-ink/50 mt-0.5">{Object.entries(item.variants).map(([k, v]) => `${k} : ${v}`).join(' · ')}</p>
                  )}
                  <p className="text-xs text-ink/50 mt-0.5">Quantité : {item.quantity}</p>
                  {p && <p className="text-xs text-ink/40 mt-0.5">Prix unitaire : {formatFCFA(p.price)}</p>}
                </div>
                <span className="text-sm font-semibold text-ink flex-shrink-0">{formatFCFA(p ? p.price * item.quantity : 0)}</span>
              </div>
            );
          })}
        </div>
        <div className="border-t border-line mt-4 pt-3 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-ink/60">Sous-total vendeur</span><span className="font-medium">{formatFCFA(sellerSubtotal)}</span></div>
          <div className="flex justify-between"><span className="text-ink/60">Commission Ezial (8%)</span><span className="font-medium text-ink/50">-{formatFCFA(commission)}</span></div>
          <div className="border-t border-line pt-1.5 flex justify-between"><span className="font-medium text-ink">Net vendeur</span><span className="font-semibold text-ink">{formatFCFA(net)}</span></div>
        </div>
      </div>

      {/* Fulfillment info */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-1.5">
          {isDelivery ? <><Truck size={15} className="text-burgundy" /> Livraison Ezial</> : <><Store size={15} className="text-burgundy" /> Retrait en boutique</>}
        </h2>
        {isDelivery ? (
          <div className="space-y-2 text-sm text-ink/60">
            <p>Ezial prend en charge la livraison de cette commande.</p>
            <p>Client : {order.customerName.split(' ')[0]}</p>
            <p className="text-xs text-ink/40">Une fois la commande prête, Ezial collectera le colis.</p>
          </div>
        ) : (
          <div className="space-y-2 text-sm text-ink/60">
            <p>Client : {order.customerName.split(' ')[0]}</p>
            <p className="flex items-center gap-1.5"><Phone size={13} className="text-ink/40" /> {order.customerPhone}</p>
            <p className="flex items-center gap-1.5"><Store size={13} className="text-ink/40" /> Retrait en boutique</p>
          </div>
        )}
      </div>

      {/* Status & action */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink mb-3">Statut</h2>
        <p className="text-sm text-ink/60 mb-4">{statusLabels[status] ?? status}</p>

        {status === 'ready' && isDelivery && (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3">
            <Check size={16} className="text-green-600" />
            <p className="text-sm font-medium text-green-700">Commande prête pour collecte Ezial</p>
          </div>
        )}

        {status === 'picked_up' && (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3">
            <Check size={16} className="text-green-600" />
            <p className="text-sm font-medium text-green-700">Commande récupérée par le client</p>
          </div>
        )}

        {status === 'delivered' && (
          <div className="flex items-center gap-2 rounded-lg bg-ink/5 p-3">
            <Check size={16} className="text-ink/40" />
            <p className="text-sm font-medium text-ink/60">Commande livrée</p>
          </div>
        )}

        {action && (
          <button onClick={() => advanceSubOrder(order.id, shopId, order.fulfillment)} className="btn-primary w-full mt-2">
            {action}
          </button>
        )}
      </div>
    </div>
  );
}
