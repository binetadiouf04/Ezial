import { useEffect, useState } from 'react';
import { useApp, type DeliveryStepStatus, type PickupStepStatus, type Order } from '@/store/AppContext';
import { getShop } from '@/data/shops';
import { ensureOrderDeliveryCode, fetchOrderDeliveryMissionStatus } from '@/lib/supabaseOrders';
import { DeliveryTimeline, PickupTimeline } from '@/components/OrderTimeline';
import { deliveryStatusLabels, pickupStepLabels, computeDeliveryStepStatus } from '@/data/orderStatusLabels';
import { paymentLabels } from '@/data/payments';
import { Package, Truck, Store, MapPin, Smartphone, Clock, KeySquare, CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react';
import ClaimModal from '@/components/ClaimModal';
import InvoiceCard from '@/components/InvoiceCard';
import OrangeMoneyPayment from '@/components/OrangeMoneyPayment';
import PaymentStatusBadge from '@/components/PaymentStatusBadge';

const deliveryStatusColors: Record<DeliveryStepStatus, string> = {
  confirmed: 'bg-blue-50 text-blue-700', preparing: 'bg-amber-50 text-amber-700', ready: 'bg-green-50 text-green-700',
  picked_up: 'bg-violet-50 text-violet-700', delivering: 'bg-violet-50 text-violet-700', delivered: 'bg-ink/5 text-ink/60',
};
const pickupStepColors: Record<PickupStepStatus, string> = {
  preparing: 'bg-amber-50 text-amber-700', ready_for_pickup: 'bg-green-50 text-green-700', picked_up: 'bg-ink/5 text-ink/60',
};

function getOrderStatusLabel(order: Order, effectiveStatus: DeliveryStepStatus): string {
  const hasPickup = order.shopFulfillments.some((f) => f.type === 'pickup');
  const hasDelivery = order.shopFulfillments.some((f) => f.type === 'delivery');
  if (hasPickup && !hasDelivery) {
    const pickupStatuses = order.shopFulfillments.filter((f) => f.type === 'pickup').map((f) => f.pickupStatus ?? 'preparing');
    const worst = pickupStatuses.sort((a, b) => Object.keys(pickupStepLabels).indexOf(a) - Object.keys(pickupStepLabels).indexOf(b))[0];
    return pickupStepLabels[worst] ?? pickupStepLabels.preparing;
  }
  return deliveryStatusLabels[effectiveStatus] ?? deliveryStatusLabels.confirmed;
}

function getOrderStatusColor(order: Order, effectiveStatus: DeliveryStepStatus): string {
  const hasPickup = order.shopFulfillments.some((f) => f.type === 'pickup');
  const hasDelivery = order.shopFulfillments.some((f) => f.type === 'delivery');
  if (hasPickup && !hasDelivery) {
    const pickupStatuses = order.shopFulfillments.filter((f) => f.type === 'pickup').map((f) => f.pickupStatus ?? 'preparing');
    const worst = pickupStatuses.sort((a, b) => Object.keys(pickupStepColors).indexOf(a) - Object.keys(pickupStepColors).indexOf(b))[0];
    return pickupStepColors[worst] ?? deliveryStatusColors.confirmed;
  }
  return deliveryStatusColors[effectiveStatus] ?? deliveryStatusColors.confirmed;
}

export default function OrderDetailPage({ orderId }: { orderId: string }) {
  const { orders, navigate, customerUser } = useApp();
  const order = orders.find((o) => o.id === orderId);
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  const [missionStatus, setMissionStatus] = useState<string | null>(null);
  const [claimModal, setClaimModal] = useState<'retour_echange' | 'probleme' | null>(null);

  // Generated right at order confirmation (like Uber's ride PIN) — shown
  // immediately, never gated on delivery progress.
  // Commande Orange Money pas encore payée : ni code de livraison ni facture (rien ne part avant paiement).
  const awaitingOnlinePayment = !!order?.paymentRequired && order.paymentStatus !== 'paid';
  useEffect(() => {
    if (!order?.supabaseOrderId) return;
    if (!awaitingOnlinePayment) void ensureOrderDeliveryCode(order.supabaseOrderId).then(setDeliveryCode);
    void fetchOrderDeliveryMissionStatus(order.supabaseOrderId).then(setMissionStatus);
  }, [order?.supabaseOrderId, awaitingOnlinePayment]);

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
  const effectiveStatus = computeDeliveryStepStatus(order, missionStatus);
  const isDelivered = effectiveStatus === 'delivered';

  return (
    <div className="container-pro py-8 max-w-3xl">
      {/* Order header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Commande {order.id}</h1>
          <p className="mt-1 text-sm text-ink/55">{new Date(order.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        {awaitingOnlinePayment
          ? <PaymentStatusBadge order={order} className="px-3.5 py-1.5" />
          : <span className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${getOrderStatusColor(order, effectiveStatus)}`}>{getOrderStatusLabel(order, effectiveStatus)}</span>}
      </div>

      {order.paymentRequired && <OrangeMoneyPayment order={order} autoStart autoOpen={typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('payer') === '1'} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          {/* Facture en tête : articles et total (pas encore payée : simple récapitulatif, sans facture) */}
          <InvoiceCard order={order} draft={awaitingOnlinePayment} />

          {/* Delivery code — shown immediately at confirmation, like Uber's
              ride PIN, never gated on how far the delivery has progressed. */}
          {hasDelivery && deliveryCode && !awaitingOnlinePayment && (
            <div className="rounded-2xl p-6 text-center" style={{ background: 'linear-gradient(135deg, rgba(128,23,37,0.06), rgba(128,23,37,0.12))' }}>
              <div className="flex items-center justify-center gap-2 mb-2">
                <KeySquare size={18} className="text-burgundy" />
                <p className="text-sm font-semibold uppercase tracking-wider text-burgundy">Votre code de livraison</p>
              </div>
              <p className="font-mono text-5xl font-bold tracking-[0.3em] text-burgundy">{deliveryCode}</p>
              <p className="mt-3 text-sm font-medium text-ink/70">Communiquez ce code au livreur uniquement au moment où il vous remet votre colis.</p>
            </div>
          )}

          {/* Tracking */}
          {hasDelivery && (
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-1.5"><Truck size={15} className="text-burgundy" /> Suivi — Livraison Ezial</h2>
              <DeliveryTimeline status={effectiveStatus} />
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
            <PaymentStatusBadge order={order} />
          </div>

          {/* Retours / signalement — jamais bloqués par un délai côté
              interface : le délai légal de 48h n'est qu'une recommandation
              de service, jamais un verrou. */}
          {order.supabaseOrderId && customerUser && (
            <div className="card p-5 space-y-2">
              <h2 className="text-sm font-semibold text-ink">Un souci avec cette commande ?</h2>
              <button onClick={() => setClaimModal('retour_echange')} className="btn-outline w-full justify-start gap-2">
                <RotateCcw size={15} /> Demander un retour ou un échange
              </button>
              <button onClick={() => setClaimModal('probleme')} className="btn-outline w-full justify-start gap-2">
                <AlertTriangle size={15} /> Signaler un problème
              </button>
            </div>
          )}

          {/* Actions */}
          <button onClick={() => navigate('/profil')} className="btn-outline w-full">Retour aux commandes</button>
        </div>
      </div>

      {claimModal && customerUser && (
        <ClaimModal
          order={order}
          claimType={claimModal}
          customerId={customerUser.id}
          onClose={() => setClaimModal(null)}
        />
      )}
    </div>
  );
}
