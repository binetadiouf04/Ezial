import { useApp, type DeliveryStepStatus, type PickupStepStatus, type Order } from '@/store/AppContext';
import { getProduct, formatFCFA } from '@/data/products';
import { getShop } from '@/data/shops';
import { DeliveryTimeline, PickupTimeline } from '@/components/OrderTimeline';
import { paymentLabels } from '@/data/payments';
import { Package, Truck, Store, MapPin, Smartphone, Clock, Check, KeySquare, ArrowLeft, CheckCircle2 } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

const deliveryStatusLabels: Record<DeliveryStepStatus, string> = {
  confirmed: 'Commande confirmée', preparing: 'En préparation', ready: 'Prête',
  picked_up: 'En livraison', delivering: 'En livraison', delivered: 'Livrée',
};
const deliveryStatusColors: Record<DeliveryStepStatus, string> = {
  confirmed: 'bg-blue-50 text-blue-700', preparing: 'bg-amber-50 text-amber-700', ready: 'bg-green-50 text-green-700',
  picked_up: 'bg-violet-50 text-violet-700', delivering: 'bg-violet-50 text-violet-700', delivered: 'bg-ink/5 text-ink/60',
};
const pickupStepLabels: Record<PickupStepStatus, string> = {
  preparing: 'En préparation', ready_for_pickup: 'Prête à récupérer', picked_up: 'Récupérée',
};
const pickupStepColors: Record<PickupStepStatus, string> = {
  preparing: 'bg-amber-50 text-amber-700', ready_for_pickup: 'bg-green-50 text-green-700', picked_up: 'bg-ink/5 text-ink/60',
};

function getOrderStatusLabel(order: Order): string {
  const hasPickup = order.shopFulfillments.some((f) => f.type === 'pickup');
  const hasDelivery = order.shopFulfillments.some((f) => f.type === 'delivery');
  if (hasPickup && !hasDelivery) {
    const pickupStatuses = order.shopFulfillments.filter((f) => f.type === 'pickup').map((f) => f.pickupStatus ?? 'preparing');
    const worst = pickupStatuses.sort((a, b) => Object.keys(pickupStepLabels).indexOf(a) - Object.keys(pickupStepLabels).indexOf(b))[0];
    return pickupStepLabels[worst] ?? 'En préparation';
  }
  return deliveryStatusLabels[order.status] ?? 'Commande confirmée';
}

function getOrderStatusColor(order: Order): string {
  const hasPickup = order.shopFulfillments.some((f) => f.type === 'pickup');
  const hasDelivery = order.shopFulfillments.some((f) => f.type === 'delivery');
  if (hasPickup && !hasDelivery) {
    const pickupStatuses = order.shopFulfillments.filter((f) => f.type === 'pickup').map((f) => f.pickupStatus ?? 'preparing');
    const worst = pickupStatuses.sort((a, b) => Object.keys(pickupStepColors).indexOf(a) - Object.keys(pickupStepColors).indexOf(b))[0];
    return pickupStepColors[worst] ?? deliveryStatusColors.confirmed;
  }
  return deliveryStatusColors[order.status] ?? deliveryStatusColors.confirmed;
}

export default function OrderDetailPage({ orderId }: { orderId: string }) {
  const { orders, navigate } = useApp();
  const order = orders.find((o) => o.id === orderId);

  if (!order) {
    return (
      <div className="container-pro py-20 text-center">
        <Package size={42} className="mx-auto text-ink/20" />
        <p className="mt-4 text-sm text-ink/60">Commande introuvable.</p>
        <button onClick={() => navigate('/profil')} className="btn-outline mt-6">Mes commandes</button>
      </div>
    );
  }

  const hasDelivery = order.shopFulfillments.some((f) => f.type === 'delivery');
  const pickupFulfillments = order.shopFulfillments.filter((f) => f.type === 'pickup');
  const isDelivered = order.status === 'delivered';

  return (
    <div className="container-pro py-8 max-w-3xl">
      {/* Back link */}
      <button onClick={() => navigate('/profil')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors mb-6">
        <ArrowLeft size={16} /> Mes commandes
      </button>

      {/* Order header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Commande {order.id}</h1>
          <p className="mt-1 text-sm text-ink/55">{new Date(order.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <span className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${getOrderStatusColor(order)}`}>{getOrderStatusLabel(order)}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          {/* Products — product-first */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink mb-4">Articles</h2>
            <div className="space-y-4">
              {order.items.map((item, i) => {
                const p = getProduct(item.productId);
                if (!p) return null;
                const price = item.unitPrice ?? p.price;
                const shop = getShop(item.shopId);
                const sf = order.shopFulfillments.find((f) => f.shopId === item.shopId);
                const isPickup = sf?.type === 'pickup';
                return (
                  <div key={i} className="flex gap-3">
                    <SmartImage src={p.images[0]} alt="" className="h-16 w-14 rounded-lg object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink line-clamp-1">{p.name}</p>
                      {Object.entries(item.variants).length > 0 && (
                        <p className="text-xs text-ink/50 mt-0.5">{Object.entries(item.variants).map(([k, v]) => `${k} : ${v}`).join(' · ')}</p>
                      )}
                      <p className="text-xs text-ink/50">Quantité : {item.quantity}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {shop && <p className="text-[11px] text-ink/35">Vendu par {shop.name}</p>}
                        {isPickup && <span className="text-[11px] text-ink/40 flex items-center gap-0.5"><Store size={10} /> Retrait</span>}
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-ink flex-shrink-0">{formatFCFA(price * item.quantity)}</span>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-line mt-4 pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-ink/60">Produits</span><span className="font-medium">{formatFCFA(order.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-ink/60">Livraison Ezial</span><span className="font-medium">{order.delivery > 0 ? formatFCFA(order.delivery) : 'Gratuit'}</span></div>
              <div className="border-t border-line pt-1.5 flex justify-between"><span className="font-medium text-ink">Total</span><span className="font-semibold text-ink">{formatFCFA(order.total)}</span></div>
            </div>
          </div>

          {/* Tracking */}
          {hasDelivery && (
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-1.5"><Truck size={15} className="text-burgundy" /> Suivi — Livraison Ezial</h2>
              <DeliveryTimeline status={order.status} />
              {isDelivered && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-green-50 p-3">
                  <CheckCircle2 size={16} className="text-green-600" />
                  <p className="text-sm font-medium text-green-700">Votre commande a été livrée</p>
                </div>
              )}
            </div>
          )}

          {pickupFulfillments.map((sf) => {
            const shop = getShop(sf.shopId);
            return (
              <div key={sf.shopId} className="card p-6">
                <h2 className="text-sm font-semibold text-ink mb-2 flex items-center gap-1.5"><Store size={15} className="text-burgundy" /> Suivi — Retrait {shop?.name}</h2>
                <p className="text-xs text-ink/45 mb-4">{shop?.address}</p>
                <PickupTimeline status={sf.pickupStatus ?? 'preparing'} />

                {sf.pickupStatus === 'ready_for_pickup' && sf.pickupCode && (
                  <div className="mt-4 rounded-xl p-4 text-center" style={{ background: 'linear-gradient(135deg, rgba(128,23,37,0.04), rgba(128,23,37,0.08))' }}>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <KeySquare size={16} className="text-burgundy" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">Code de retrait</p>
                    </div>
                    <p className="font-mono text-3xl font-bold tracking-[0.3em] text-burgundy">{sf.pickupCode}</p>
                    <p className="mt-2 text-xs text-ink/50">Présentez ce code à la boutique lors du retrait.</p>
                  </div>
                )}
                <div className="mt-3 flex items-center gap-1.5 text-xs text-ink/40">
                  <Clock size={11} /> {shop?.pickupEta}
                </div>
                {sf.pickupStatus === 'picked_up' && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 p-3">
                    <CheckCircle2 size={16} className="text-green-600" />
                    <p className="text-sm font-medium text-green-700">Commande récupérée</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Sidebar: delivery + payment */}
        <div className="space-y-4">
          {/* Delivery info */}
          {hasDelivery && (
            <div className="card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5"><Truck size={14} className="text-burgundy" /> Livraison Ezial</h2>
              <div className="space-y-1.5 text-sm text-ink/60">
                <p className="font-medium text-ink">{order.customer.firstName} {order.customer.lastName}</p>
                <p className="flex items-center gap-1.5"><Smartphone size={13} className="text-ink/40" /> {order.customer.phone}</p>
                <p className="flex items-start gap-1.5"><MapPin size={13} className="mt-0.5 text-ink/40 flex-shrink-0" /> <span>{order.customer.quartier}{order.customer.landmark && ` · ${order.customer.landmark}`}</span></p>
                {order.customer.instructions && <p className="text-ink/45 italic text-xs">« {order.customer.instructions} »</p>}
              </div>
              {order.preference?.type === 'preferred' && (
                <div className="border-t border-line pt-3 space-y-1.5">
                  <p className="text-xs font-semibold text-ink/60">Préférence de livraison</p>
                  <p className="flex items-center gap-1.5 text-sm text-ink/60"><Clock size={13} className="text-ink/40" /> Date : {order.preference.date}</p>
                  <p className="flex items-center gap-1.5 text-sm text-ink/60"><Clock size={13} className="text-ink/40" /> Créneau : {order.preference.window}</p>
                  <p className="text-xs text-ink/40 italic">Nous ferons notre possible pour respecter votre préférence. Le créneau n'est pas garanti.</p>
                </div>
              )}
            </div>
          )}

          {/* Pickup info */}
          {pickupFulfillments.map((sf) => {
            const shop = getShop(sf.shopId);
            return (
              <div key={sf.shopId} className="card p-5 space-y-2">
                <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5"><Store size={14} className="text-burgundy" /> Retrait</h2>
                <p className="text-sm font-medium text-ink">{shop?.name}</p>
                <p className="flex items-center gap-1.5 text-sm text-ink/60"><MapPin size={13} className="text-ink/40" /> {shop?.address}</p>
                <p className="flex items-center gap-1.5 text-sm text-ink/60"><Clock size={13} className="text-ink/40" /> {shop?.pickupEta}</p>
              </div>
            );
          })}

          {/* Payment info */}
          <div className="card p-5 space-y-2">
            <h2 className="text-sm font-semibold text-ink">Paiement</h2>
            <div className="flex items-center gap-2 text-sm text-ink/70">
              <Smartphone size={16} className="text-ink/40" />
              <span>{paymentLabels[order.payment] ?? order.payment}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 flex items-center gap-1">
                <Check size={11} /> Payé
              </span>
              <span className="text-sm font-semibold text-ink">{formatFCFA(order.total)}</span>
            </div>
          </div>

          {/* Actions */}
          <button onClick={() => navigate('/profil')} className="btn-outline w-full">Retour aux commandes</button>
        </div>
      </div>
    </div>
  );
}
