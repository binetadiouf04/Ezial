import { useState, useEffect } from 'react';
import { useApp } from '@/store/AppContext';
import { ensureOrderDeliveryCode } from '@/lib/supabaseOrders';
import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import InvoiceCard from '@/components/InvoiceCard';
import OnlinePayment from '@/components/OnlinePayment';
import { DeliveryCodeCard } from '@/components/OrderParts';
import { paymentPhase } from '@/lib/orderPayment';

// Page affichée juste après la commande (et au retour de Max It), volontairement courte :
// « Commande validée » + numéro, le code de livraison, la facture (avec l'adresse de livraison).
// Tant qu'Orange Money n'a pas confirmé le paiement : le paiement et le récapitulatif seulement.
export default function OrderConfirmationPage({ orderId }: { orderId: string }) {
  const { orders, navigate } = useApp();
  const order = orders.find((o) => o.id === orderId);
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);

  const awaitingOnlinePayment = !!order?.paymentRequired && order.paymentStatus !== 'paid';
  const cancelled = order?.orderStatus === 'cancelled';
  useEffect(() => {
    if (!order?.supabaseOrderId || awaitingOnlinePayment || cancelled) return;
    void ensureOrderDeliveryCode(order.supabaseOrderId).then(setDeliveryCode);
  }, [order?.supabaseOrderId, awaitingOnlinePayment, cancelled]);

  if (!order) {
    return (
      <div className="container-pro py-20 text-center">
        <CheckCircle2 size={42} className="mx-auto text-burgundy" />
        <p className="mt-4 text-sm text-ink/60">Commande enregistrée.</p>
        <button onClick={() => navigate('/profil')} className="btn-outline mt-6">Mes commandes</button>
      </div>
    );
  }

  const phase = paymentPhase(order, Date.now());
  const hasDelivery = order.shopFulfillments.some((f) => f.type === 'delivery');
  const confirmed = !awaitingOnlinePayment && !cancelled;

  const hero = cancelled
    ? { icon: <AlertTriangle size={30} className="text-burgundy" />, title: 'Commande annulée' }
    : phase === 'awaiting'
      ? { icon: <Clock size={30} className="text-burgundy" />, title: 'Plus qu’une étape : le paiement' }
      : phase === 'verifying'
        ? { icon: <Clock size={30} className="text-burgundy" />, title: 'Vérification du paiement' }
        : { icon: <CheckCircle2 size={32} className="text-burgundy" />, title: 'Commande validée' };

  return (
    <div className="container-pro max-w-xl py-8">
      <header className="fade-in mb-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-burgundy/10">{hero.icon}</div>
        <h1 className="mt-3 font-display text-[1.75rem] font-semibold leading-tight text-ink">{hero.title}</h1>
        <p className="mt-1 text-sm text-ink/55">N° <span className="font-mono">{order.id}</span></p>
      </header>

      <div className="space-y-4">
        {order.paymentRequired && <OnlinePayment order={order} autoStart autoOpen />}

        {confirmed && hasDelivery && deliveryCode && <DeliveryCodeCard code={deliveryCode} />}

        <InvoiceCard order={order} draft={awaitingOnlinePayment || cancelled} showDelivery={confirmed && hasDelivery} />

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          {confirmed && <button onClick={() => navigate(`/compte/commande/${order.id}`)} className="btn-primary flex-1">Suivre ma commande</button>}
          <button onClick={() => navigate('/')} className="btn-outline flex-1">Continuer mes achats</button>
        </div>
      </div>
    </div>
  );
}
