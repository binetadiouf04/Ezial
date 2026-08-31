import { useState } from 'react';
import { usePro } from '../../ProContext';
import { formatFCFA, formatDateTime } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { ArrowLeft, Store, MapPin, CreditCard, CheckCircle2, Circle, AlertTriangle, X } from 'lucide-react';

export default function AdminOrderDetail({ orderId }: { orderId: string }) {
  const { allOrders, allProducts, navigate, missions, getSubOrderStatus, cancelOrder, refundOrder, cancelledOrders, refundedOrders } = usePro();
  const [showCancel, setShowCancel] = useState(false);
  const [showRefund, setShowRefund] = useState(false);

  const order = allOrders.find((o) => o.id === orderId);
  if (!order) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-ink/55">Commande introuvable</p>
        <button onClick={() => navigate('/admin/commandes')} className="btn-outline mt-4">Retour</button>
      </div>
    );
  }

  const mission = missions.find((m) => m.orderId === order.id);
  const productTotal = order.total - order.deliveryFee;

  const isCancelled = cancelledOrders.includes(order.id);
  const isRefunded = refundedOrders.includes(order.id);

  // Build timeline events
  const timeline: { label: string; done: boolean; date?: string }[] = [
    { label: 'Commande confirmée', done: true, date: order.date },
  ];

  order.subOrders.forEach((sub) => {
    const status = getSubOrderStatus(order.id, sub.shopId, sub.status);
    timeline.push({
      label: `${sub.shopName} — ${status === 'ready' ? 'Prête' : status === 'preparing' ? 'En préparation' : status === 'confirmed' ? 'Confirmée' : status === 'delivered' ? 'Livrée' : status}`,
      done: status === 'ready' || status === 'delivered' || status === 'out_for_delivery',
    });
  });

  if (order.fulfillment === 'delivery') {
    timeline.push({ label: 'Collecte', done: !!mission && mission.collections.every((c) => c.collected) });
    timeline.push({ label: 'En livraison', done: order.status === 'out_for_delivery' || order.status === 'delivered' });
    timeline.push({ label: 'Livrée', done: order.status === 'delivered' });
  } else {
    timeline.push({ label: 'Prête à récupérer', done: order.status === 'ready' || order.status === 'delivered' });
    timeline.push({ label: 'Récupérée', done: order.status === 'delivered' });
  }

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/admin/commandes')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={16} /> Commandes
      </button>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-display text-xl font-semibold text-ink">{order.id}</h1>
        <StatusChip status={order.status} size="md" />
      </div>

      {/* Order info */}
      <div className="card p-5 space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-ink/45">Client</p>
            <p className="text-sm font-medium text-ink">{order.customerName}</p>
          </div>
          <div>
            <p className="text-xs text-ink/45">Date</p>
            <p className="text-sm font-medium text-ink">{formatDateTime(order.date)}</p>
          </div>
          <div>
            <p className="text-xs text-ink/45">Paiement</p>
            <p className="text-sm font-medium text-ink flex items-center gap-1.5">
              <CreditCard size={14} className="text-ink/40" />
              {order.paymentMethod === 'wave' ? 'Wave' : 'Orange Money'}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink/45">Mode</p>
            <p className="text-sm font-medium text-ink">{order.fulfillment === 'pickup' ? 'Retrait boutique' : 'Livraison Ezial'}</p>
          </div>
        </div>
        <div className="border-t border-line pt-3 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-ink/55">Total produits</span>
            <span className="font-medium text-ink">{formatFCFA(productTotal)}</span>
          </div>
          {order.fulfillment === 'delivery' && (
            <div className="flex justify-between text-sm">
              <span className="text-ink/55">Livraison Ezial</span>
              <span className="font-medium text-ink">{formatFCFA(order.deliveryFee)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm pt-1.5 border-t border-line">
            <span className="font-semibold text-ink">Total payé</span>
            <span className="font-semibold text-ink">{formatFCFA(order.total)}</span>
          </div>
        </div>
      </div>

      {/* Products */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink mb-3">Produits</h2>
        <div className="space-y-3">
          {order.subOrders.flatMap((sub) =>
            sub.items.map((item, i) => {
              const product = allProducts.find((p) => p.id === item.productId);
              return (
                <div key={`${sub.shopId}-${i}`} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink">{item.productName}</p>
                    {product && <p className="text-xs text-ink/40 font-mono">Réf. {product.reference}</p>}
                    <p className="text-xs text-ink/45 flex items-center gap-1"><Store size={11} /> {sub.shopName}</p>
                    {Object.keys(item.variants).length > 0 && (
                      <p className="text-xs text-ink/35 mt-0.5">{Object.entries(item.variants).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
                    )}
                  </div>
                  <span className="text-sm text-ink/60 flex-shrink-0">x{item.quantity}</span>
                </div>
              );
            }),
          )}
        </div>
      </div>

      {/* Seller portions */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink mb-3">Préparation des boutiques</h2>
        <div className="space-y-3">
          {order.subOrders.map((sub) => {
            const status = getSubOrderStatus(order.id, sub.shopId, sub.status);
            const subTotal = sub.items.reduce((sum, item) => {
              const product = order.subOrders.flatMap((s) => s.items).find((i) => i.productId === item.productId);
              return sum + (product ? 0 : 0);
            }, 0);
            const shop = order.subOrders.find((s) => s.shopId === sub.shopId);
            return (
              <div key={sub.shopId} className="flex items-center justify-between p-3 rounded-lg bg-cream/40">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{sub.shopName}</p>
                  <p className="text-xs text-ink/45">{sub.items.length} article{sub.items.length > 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <StatusChip status={status} />
                  <button onClick={() => navigate(`/admin/boutiques/${sub.shopId}`)} className="text-xs text-burgundy font-medium hover:underline">Voir</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Timeline */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink mb-4">Suivi commande</h2>
        <div className="space-y-3">
          {timeline.map((event, i) => (
            <div key={i} className="flex items-center gap-3">
              {event.done ? (
                <CheckCircle2 size={18} className="text-green-600 flex-shrink-0" />
              ) : (
                <Circle size={18} className="text-ink/20 flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className={`text-sm ${event.done ? 'text-ink' : 'text-ink/40'}`}>{event.label}</p>
                {event.date && <p className="text-xs text-ink/35">{formatDateTime(event.date)}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Delivery link */}
      {mission && (
        <button onClick={() => navigate(`/admin/livraisons/${mission.id}`)} className="card w-full p-4 flex items-center gap-3 text-left hover:card-shadow transition-all">
          <MapPin size={18} className="text-burgundy flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-ink">Livraison {mission.id}</p>
            <p className="text-xs text-ink/45">{mission.collections.length} collectes · → {mission.destination}</p>
          </div>
          <span className="text-xs text-burgundy font-medium">Voir</span>
        </button>
      )}

      {/* Incident banner */}
      {mission?.incident && (
        <div className="rounded-lg bg-orange-50 border border-orange-200 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="text-orange-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-orange-700">Incident signalé</p>
              <p className="text-xs text-orange-600 mt-1">{mission.incident.reason}</p>
              {mission.incident.comment && <p className="text-xs text-orange-500 mt-0.5">« {mission.incident.comment} »</p>}
              <button onClick={() => navigate(`/admin/livraisons/${mission.id}`)} className="text-xs font-medium text-orange-700 hover:underline mt-1.5">Voir la livraison</button>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {!isCancelled && !isRefunded && order.status !== 'delivered' && (
        <div className="flex gap-3">
          <button onClick={() => setShowRefund(true)} className="btn-outline flex-1">Marquer un remboursement</button>
          <button onClick={() => setShowCancel(true)} className="flex-1 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors">Annuler la commande</button>
        </div>
      )}

      {/* Cancel confirmation */}
      {showCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setShowCancel(false)}>
          <div className="card max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg font-semibold text-ink">Annuler la commande</h3>
              <button onClick={() => setShowCancel(false)}><X size={18} className="text-ink/40" /></button>
            </div>
            <p className="text-sm text-ink/55 mb-5">Êtes-vous sûr de vouloir annuler cette commande ?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowCancel(false)} className="btn-outline flex-1">Retour</button>
              <button onClick={() => { cancelOrder(order.id); setShowCancel(false); }} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors">Confirmer l'annulation</button>
            </div>
          </div>
        </div>
      )}

      {/* Refund confirmation */}
      {showRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setShowRefund(false)}>
          <div className="card max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg font-semibold text-ink">Remboursement</h3>
              <button onClick={() => setShowRefund(false)}><X size={18} className="text-ink/40" /></button>
            </div>
            <p className="text-sm text-ink/55 mb-5">Marquer cette commande comme remboursée ? (simulation)</p>
            <div className="flex gap-3">
              <button onClick={() => setShowRefund(false)} className="btn-outline flex-1">Retour</button>
              <button onClick={() => { refundOrder(order.id); setShowRefund(false); }} className="btn-primary flex-1">Confirmer le remboursement</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
