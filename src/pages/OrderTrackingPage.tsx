import { useApp, type DeliveryStepStatus, type PickupStepStatus } from '@/store/AppContext';
import { getProduct, formatFCFA } from '@/data/products';
import { getShop } from '@/data/shops';
import { DeliveryTimeline, PickupTimeline } from '@/components/OrderTimeline';
import { paymentLabels } from '@/data/payments';
import { Phone, MapPin, Package, Store, Check, Clock, KeySquare, Truck, Smartphone } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

const shopPrepLabels: Record<string, string> = { preparing: 'En préparation', ready: 'Prête', collected: 'Prête' };
const shopPrepColors: Record<string, string> = { preparing: 'bg-amber-50 text-amber-700', ready: 'bg-green-50 text-green-700', collected: 'bg-green-50 text-green-700' };

const deliveryStatusLabels: Record<DeliveryStepStatus, string> = {
  confirmed: 'Commande confirmée', preparing: 'En préparation', ready: 'Prête',
  picked_up: 'En livraison', delivering: 'En livraison', delivered: 'Livrée',
};
const pickupStepLabels: Record<PickupStepStatus, string> = {
  preparing: 'En préparation', ready_for_pickup: 'Prête à récupérer', picked_up: 'Récupérée',
};

export default function OrderTrackingPage({ orderId }: { orderId: string }) {
  const { orders, navigate } = useApp();
  const order = orders.find((o) => o.id === orderId);

  if (!order) {
    return <div className="container-pro py-20 text-center"><Package size={42} className="mx-auto text-ink/20" /><p className="mt-4 text-sm text-ink/60">Commande introuvable.</p><button onClick={() => navigate('/profil')} className="btn-outline mt-6">Mes commandes</button></div>;
  }

  const hasPickup = order.shopFulfillments.some((f) => f.type === 'pickup');
  const hasDelivery = order.shopFulfillments.some((f) => f.type === 'delivery');
  const pickupFulfillments = order.shopFulfillments.filter((f) => f.type === 'pickup');

  return (
    <div className="container-pro py-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Suivi de commande</h1>
        <p className="mt-1 text-sm text-ink/55">Commande <span className="font-mono font-semibold text-ink">{order.id}</span></p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          {/* Overall delivery timeline (if any delivery) */}
          {hasDelivery && (
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-1.5"><Truck size={15} className="text-burgundy" /> Livraison Ezial</h2>
              <DeliveryTimeline status={order.status} />
            </div>
          )}

          {/* Pickup timelines */}
          {pickupFulfillments.map((sf) => {
            const shop = getShop(sf.shopId);
            const shopItems = order.items.filter((i) => i.shopId === sf.shopId);
            return (
              <div key={sf.shopId} className="card p-6">
                <h2 className="text-sm font-semibold text-ink mb-2 flex items-center gap-1.5"><Store size={15} className="text-burgundy" /> Retrait — {shop?.name}</h2>
                <p className="text-xs text-ink/45 mb-4">{shop?.address}</p>
                <PickupTimeline status={sf.pickupStatus ?? 'preparing'} />

                {/* Pickup code */}
                {sf.pickupStatus === 'ready_for_pickup' && sf.pickupCode && (
                  <div className="mt-4 rounded-xl p-4 text-center" style={{ background: 'linear-gradient(135deg, rgba(128,23,37,0.04), rgba(128,23,37,0.08))' }}>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <KeySquare size={16} className="text-burgundy" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">Code de retrait</p>
                    </div>
                    <p className="font-mono text-3xl font-bold tracking-[0.3em] text-burgundy">{sf.pickupCode}</p>
                    <p className="mt-2 text-xs text-ink/50">Présentez ce code à la boutique lors du retrait.</p>
                    <div className="mt-2 text-xs text-ink/45">
                      <p className="flex items-center justify-center gap-1"><Store size={11} /> {shop?.name} · {shop?.address}</p>
                    </div>
                  </div>
                )}
                <div className="mt-3 flex items-center gap-1.5 text-xs text-ink/40">
                  <Clock size={11} /> {shop?.pickupEta}
                </div>
              </div>
            );
          })}

          {/* Shop preparation statuses */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink mb-4">Préparation par boutique</h2>
            <div className="space-y-4">
              {order.shopFulfillments.map((sf) => {
                const shop = getShop(sf.shopId);
                const shopItems = order.items.filter((i) => i.shopId === sf.shopId);
                const isPickup = sf.type === 'pickup';
                return (
                  <div key={sf.shopId} className="flex items-start gap-3">
                    <SmartImage src={shop?.logo ?? ''} alt="" className="h-10 w-10 rounded-full object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-ink">{shop?.name}</p>
                        <span className="text-xs text-ink/40 flex items-center gap-1">
                          {isPickup ? <><Store size={11} /> Retrait</> : <><MapPin size={11} /> Livraison</>}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${isPickup ? 'bg-amber-50 text-amber-700' : shopPrepColors[sf.status]}`}>
                          {isPickup ? pickupStepLabels[sf.pickupStatus ?? 'preparing'] : (sf.status === 'ready' ? <><Check size={10} className="inline mr-1" />{shopPrepLabels[sf.status]}</> : shopPrepLabels[sf.status])}
                        </span>
                        <span className="text-xs text-ink/40">{shopItems.length} article{shopItems.length > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Product-first summary */}
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink mb-3">Vos articles</h2>
            <div className="space-y-3">
              {order.items.map((item, i) => {
                const p = getProduct(item.productId);
                if (!p) return null;
                const price = item.unitPrice ?? p.price;
                const shop = getShop(item.shopId);
                return (
                  <div key={i} className="flex gap-2.5">
                    <SmartImage src={p.images[0]} alt="" className="h-12 w-10 rounded object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-ink line-clamp-1">{p.name}</p>
                      {Object.entries(item.variants).length > 0 && (
                        <p className="text-[11px] text-ink/45">{Object.entries(item.variants).map(([k, v]) => `${k} : ${v}`).join(' · ')}</p>
                      )}
                      <p className="text-[11px] text-ink/35">Vendu par {shop?.name}</p>
                    </div>
                    <span className="text-xs font-medium text-ink flex-shrink-0">{formatFCFA(price * item.quantity)}</span>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-line mt-3 pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-ink/60">Produits</span><span className="font-medium">{formatFCFA(order.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-ink/60">Livraison Ezial</span><span className="font-medium">{order.delivery > 0 ? formatFCFA(order.delivery) : 'Gratuit'}</span></div>
              <div className="border-t border-line pt-1.5 flex justify-between"><span className="font-medium text-ink">Total</span><span className="font-semibold text-ink">{formatFCFA(order.total)}</span></div>
            </div>
          </div>
          {hasDelivery && (
            <div className="card p-5 space-y-2">
              <h2 className="text-sm font-semibold text-ink mb-1 flex items-center gap-1.5"><Truck size={14} className="text-burgundy" /> Livraison</h2>
              <div className="flex items-start gap-2 text-sm text-ink/60"><MapPin size={15} className="mt-0.5 text-ink/40" /><span>{order.customer.firstName} {order.customer.lastName}<br />{order.customer.quartier}<br /><Phone size={11} className="inline mr-1" />{order.customer.phone}</span></div>
              {order.preference?.type === 'preferred' && (
                <div className="border-t border-line pt-2 space-y-1">
                  <div className="flex items-start gap-2 text-sm text-ink/60"><Clock size={15} className="mt-0.5 text-ink/40" /><span>Préférence : {order.preference.date} · {order.preference.window}</span></div>
                  <p className="text-xs text-ink/40 italic">Nous ferons notre possible pour respecter votre préférence. Le créneau n'est pas garanti.</p>
                </div>
              )}
            </div>
          )}
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
          <button onClick={() => navigate('/profil')} className="btn-outline w-full">Mes commandes</button>
        </div>
      </div>
    </div>
  );
}
