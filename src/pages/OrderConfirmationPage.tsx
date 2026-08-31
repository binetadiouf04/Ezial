import { useApp } from '@/store/AppContext';
import { getProduct, formatFCFA } from '@/data/products';
import { getShop } from '@/data/shops';
import { paymentLabels } from '@/data/payments';
import { CheckCircle2, Truck, Store, MapPin, Smartphone, Clock } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

const paymentIcons: Record<string, typeof Smartphone> = { wave: Smartphone, orange: Smartphone };

export default function OrderConfirmationPage({ orderId }: { orderId: string }) {
  const { orders, navigate } = useApp();
  const order = orders.find((o) => o.id === orderId);

  if (!order) {
    return (
      <div className="container-pro py-20 text-center">
        <CheckCircle2 size={42} className="mx-auto text-burgundy" />
        <p className="mt-4 text-sm text-ink/60">Commande confirmée !</p>
        <p className="mt-1 text-xs text-ink/40">ID: {orderId}</p>
        <button onClick={() => navigate('/')} className="btn-outline mt-6">Retour à l'accueil</button>
      </div>
    );
  }

  const PaymentIcon = paymentIcons[order.payment] ?? Smartphone;
  const hasDelivery = order.shopFulfillments.some((f) => f.type === 'delivery');
  const pickupShops = order.shopFulfillments.filter((f) => f.type === 'pickup');

  return (
    <div className="container-pro py-10 max-w-2xl">
      <div className="text-center mb-8 fade-in">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-burgundy/10">
          <CheckCircle2 size={36} className="text-burgundy" />
        </div>
        <h1 className="mt-4 font-display text-2xl font-semibold text-ink">Commande confirmée</h1>
        <p className="mt-1.5 text-sm text-ink/55">Merci pour votre commande.</p>
        <p className="mt-1 text-xs text-ink/45">N° de commande : <span className="font-mono font-semibold text-ink">{order.id}</span></p>
      </div>

      {/* Product-first items list */}
      <div className="card p-5 mb-5">
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

      {/* Delivery info */}
      {hasDelivery && (
        <div className="card p-5 mb-5">
          <h2 className="text-sm font-semibold text-ink mb-2 flex items-center gap-1.5"><Truck size={15} className="text-burgundy" /> Livraison Ezial</h2>
          <div className="space-y-1 text-sm text-ink/60">
            <p>{order.customer.firstName} {order.customer.lastName}</p>
            <p>{order.customer.quartier}{order.customer.landmark && ` · ${order.customer.landmark}`}</p>
            <p>{order.customer.phone}</p>
            {order.customer.instructions && <p className="text-ink/45 italic">« {order.customer.instructions} »</p>}
            {order.preference?.type === 'preferred' && (
              <p className="flex items-center gap-1.5 text-ink/55"><Clock size={13} /> Préférence : {order.preference.date} · {order.preference.window}</p>
            )}
          </div>
        </div>
      )}

      {/* Pickup info per shop */}
      {pickupShops.map((sf) => {
        const shop = getShop(sf.shopId);
        if (!shop) return null;
        return (
          <div key={sf.shopId} className="card p-5 mb-5">
            <h2 className="text-sm font-semibold text-ink mb-2 flex items-center gap-1.5"><Store size={15} className="text-burgundy" /> Retrait en boutique</h2>
            <div className="space-y-1 text-sm text-ink/60">
              <p>{shop.name}</p>
              <p className="flex items-center gap-1.5"><MapPin size={13} className="text-ink/40" /> {shop.address}</p>
              <p className="flex items-center gap-1.5"><Clock size={13} className="text-ink/40" /> {shop.pickupEta}</p>
            </div>
          </div>
        );
      })}

      {/* Payment info */}
      <div className="card p-5 mb-5">
        <h2 className="text-sm font-semibold text-ink mb-2">Paiement</h2>
        <div className="flex items-center gap-2 text-sm text-ink/70">
          <PaymentIcon size={16} className="text-ink/40" />
          <span>{paymentLabels[order.payment] ?? order.payment}</span>
          <span className="text-ink/30">·</span>
          <span className="font-medium text-ink">{formatFCFA(order.total)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button onClick={() => navigate(`/suivi/${order.id}`)} className="btn-primary flex-1">Suivre ma commande</button>
        <button onClick={() => navigate('/')} className="btn-outline flex-1">Continuer mes achats</button>
      </div>
    </div>
  );
}
