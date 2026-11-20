import { useEffect, useState } from 'react';
import { useApp, type DeliveryStepStatus, type PickupStepStatus, type Order } from '@/store/AppContext';
import { getShop } from '@/data/shops';
import { ensureOrderDeliveryCode, fetchOrderDeliveryMissionStatus } from '@/lib/supabaseOrders';
import { DeliveryTimeline, PickupTimeline } from '@/components/OrderTimeline';
import { deliveryStatusLabels, pickupStepLabels, computeDeliveryStepStatus } from '@/data/orderStatusLabels';
import { Package, KeySquare, AlertTriangle, RotateCcw } from 'lucide-react';
import ClaimModal from '@/components/ClaimModal';
import InvoiceCard from '@/components/InvoiceCard';
import OrangeMoneyPayment from '@/components/OrangeMoneyPayment';
import PaymentStatusBadge from '@/components/PaymentStatusBadge';
import { DeliveryCodeCard, PickupPlace } from '@/components/OrderParts';

const deliveryStatusColors: Record<DeliveryStepStatus, string> = {
  confirmed: 'bg-blue-50 text-blue-700', preparing: 'bg-amber-50 text-amber-700', ready: 'bg-green-50 text-green-700',
  picked_up: 'bg-violet-50 text-violet-700', delivering: 'bg-violet-50 text-violet-700', delivered: 'bg-ink/5 text-ink/60',
};
const pickupStepColors: Record<PickupStepStatus, string> = {
  preparing: 'bg-amber-50 text-amber-700', ready_for_pickup: 'bg-green-50 text-green-700', picked_up: 'bg-ink/5 text-ink/60',
};

function getOrderStatus(order: Order, effectiveStatus: DeliveryStepStatus): { label: string; color: string } {
  const hasPickup = order.shopFulfillments.some((f) => f.type === 'pickup');
  const hasDelivery = order.shopFulfillments.some((f) => f.type === 'delivery');
  if (hasPickup && !hasDelivery) {
    const order_ = Object.keys(pickupStepLabels);
    const worst = order.shopFulfillments.filter((f) => f.type === 'pickup').map((f) => f.pickupStatus ?? 'preparing')
      .sort((a, b) => order_.indexOf(a) - order_.indexOf(b))[0];
    return { label: pickupStepLabels[worst] ?? pickupStepLabels.preparing, color: pickupStepColors[worst] ?? deliveryStatusColors.confirmed };
  }
  return { label: deliveryStatusLabels[effectiveStatus] ?? deliveryStatusLabels.confirmed, color: deliveryStatusColors[effectiveStatus] ?? deliveryStatusColors.confirmed };
}

// Détail d'une commande (depuis « Mes commandes »). Même ordre que la confirmation :
// où en est-elle, le code, l'adresse, le reçu ; l'aide reste discrète en bas.
export default function OrderDetailPage({ orderId }: { orderId: string }) {
  const { orders, navigate, customerUser } = useApp();
  const order = orders.find((o) => o.id === orderId);
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  const [missionStatus, setMissionStatus] = useState<string | null>(null);
  const [claimModal, setClaimModal] = useState<'retour_echange' | 'probleme' | null>(null);

  // Commande Orange Money pas encore payée, ou annulée : ni code de livraison ni facture.
  const awaitingOnlinePayment = !!order?.paymentRequired && order.paymentStatus !== 'paid';
  const cancelled = order?.orderStatus === 'cancelled';
  useEffect(() => {
    if (!order?.supabaseOrderId || cancelled) return;
    if (!awaitingOnlinePayment) void ensureOrderDeliveryCode(order.supabaseOrderId).then(setDeliveryCode);
    void fetchOrderDeliveryMissionStatus(order.supabaseOrderId).then(setMissionStatus);
  }, [order?.supabaseOrderId, awaitingOnlinePayment, cancelled]);

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
  const confirmed = !awaitingOnlinePayment && !cancelled;
  const status = getOrderStatus(order, effectiveStatus);
  const date = new Date(order.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="container-pro max-w-xl py-6">
      <header className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-2xl font-semibold text-ink">Commande {order.id}</h1>
          {cancelled
            ? <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">Annulée</span>
            : awaitingOnlinePayment
              ? <PaymentStatusBadge order={order} className="px-3 py-1" />
              : <span className={`rounded-full px-3 py-1 text-xs font-medium ${status.color}`}>{status.label}</span>}
        </div>
        <p className="mt-1 text-sm text-ink/55">{date}</p>
      </header>

      {order.paymentRequired && <OrangeMoneyPayment order={order} autoStart autoOpen={typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('payer') === '1'} />}

      {cancelled && !order.paymentRequired && (
        <p className="card mb-4 p-4 text-sm text-ink/70">Cette commande a été annulée. Elle ne sera pas livrée.</p>
      )}

      <div className="space-y-4">
          {confirmed && hasDelivery && deliveryCode && effectiveStatus !== 'delivered' && <DeliveryCodeCard code={deliveryCode} />}

          {confirmed && hasDelivery && (
            <section className="card p-5" aria-labelledby="ou-en-est">
              <h2 id="ou-en-est" className="mb-4 font-display text-xl font-semibold text-ink">Où en est ma commande ?</h2>
              <DeliveryTimeline status={effectiveStatus} />
            </section>
          )}

          {confirmed && pickupFulfillments.map((sf) => (
            <section key={sf.shopId} className="card p-5">
              <h2 className="mb-1 font-display text-xl font-semibold text-ink">Retrait chez {getShop(sf.shopId)?.name ?? 'la boutique'}</h2>
              <div className="mb-4"><PickupPlace shopId={sf.shopId} /></div>
              <PickupTimeline status={sf.pickupStatus ?? 'preparing'} />
              {sf.pickupStatus === 'ready_for_pickup' && sf.pickupCode && (
                <div className="mt-4 rounded-xl bg-burgundy px-4 py-4 text-center text-cream">
                  <p className="flex items-center justify-center gap-1.5 text-xs uppercase tracking-[0.2em] text-cream/75"><KeySquare size={14} /> Code de retrait</p>
                  <p className="mt-1 font-mono text-3xl font-bold tracking-[0.3em] text-white">{sf.pickupCode}</p>
                  <p className="mt-1 text-sm text-cream/85">Présentez-le à la boutique.</p>
                </div>
              )}
            </section>
          ))}

          <InvoiceCard order={order} draft={awaitingOnlinePayment || cancelled} showDelivery={confirmed && hasDelivery} />

          {/* Retours / signalement — jamais bloqués par un délai côté interface. */}
          {order.supabaseOrderId && customerUser && !awaitingOnlinePayment && (
            <section className="card p-5" aria-labelledby="un-souci">
              <h2 id="un-souci" className="text-sm font-semibold text-ink">Un souci avec cette commande ?</h2>
              <div className="mt-2 divide-y divide-line">
                <button onClick={() => setClaimModal('retour_echange')} className="flex w-full items-center gap-2 py-2.5 text-left text-sm text-ink/75 hover:text-burgundy">
                  <RotateCcw size={15} className="text-ink/40" /> Demander un retour ou un échange
                </button>
                <button onClick={() => setClaimModal('probleme')} className="flex w-full items-center gap-2 py-2.5 text-left text-sm text-ink/75 hover:text-burgundy">
                  <AlertTriangle size={15} className="text-ink/40" /> Signaler un problème
                </button>
              </div>
            </section>
          )}
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
