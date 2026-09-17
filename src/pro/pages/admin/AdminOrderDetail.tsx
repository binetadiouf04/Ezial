import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import { fetchAdminOrderDetail, type AdminOrderDetail as AdminOrderDetailData } from '@/lib/supabaseAdminData';
import { formatFCFA } from '../../data';
import { paymentLabels } from '@/data/payments';
import { StatusChip } from '../../components/StatusChip';
import { ArrowLeft, Store, CreditCard, Phone, Loader2, Truck, Clock, Gift } from 'lucide-react';

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminOrderDetail({ orderId }: { orderId: string }) {
  const { navigate } = usePro();
  const [order, setOrder] = useState<AdminOrderDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const detail = await fetchAdminOrderDetail(orderId);
      setOrder(detail);
      if (!detail) setLoadError('Commande introuvable.');
    } catch {
      setLoadError('Impossible de charger la commande. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <div className="py-16 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>;
  }

  if (loadError || !order) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-ink/55">{loadError || 'Commande introuvable'}</p>
        <button onClick={() => navigate('/admin/commandes')} className="btn-outline mt-4">Retour</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/admin/commandes')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={16} /> Commandes
      </button>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-display text-xl font-semibold text-ink break-all">{order.orderNumber}</h1>
        <StatusChip status={order.status} size="md" />
      </div>

      {/* Order info */}
      <div className="card p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-ink/45">Client</p>
            <p className="text-sm font-medium text-ink">{order.customerName}</p>
            {order.customerPhone && <p className="text-xs text-ink/45 flex items-center gap-1 mt-0.5"><Phone size={11} /> {order.customerPhone}</p>}
          </div>
          <div>
            <p className="text-xs text-ink/45">Date</p>
            <p className="text-sm font-medium text-ink">{formatDateTime(order.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs text-ink/45">Paiement</p>
            <p className="text-sm font-medium text-ink flex items-center gap-1.5">
              <CreditCard size={14} className="text-ink/40" /> {paymentLabels[order.paymentMethod] ?? order.paymentMethod ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink/45">Mode</p>
            <p className="text-sm font-medium text-ink">{order.fulfillmentType === 'pickup' ? 'Retrait boutique' : 'Livraison Ezial'}</p>
          </div>
        </div>
        <div className="border-t border-line pt-3 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-ink/55">Total produits</span>
            <span className="font-medium text-ink">{formatFCFA(order.productsSubtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-ink/55">Livraison Ezial</span>
            <span className="font-medium text-ink">{order.deliveryFee > 0 ? formatFCFA(order.deliveryFee) : 'Gratuit'}</span>
          </div>
          {order.giftWrap && (
            <div className="flex justify-between text-sm">
              <span className="text-ink/55">Emballage cadeau</span>
              <span className="font-medium text-ink">{formatFCFA(order.giftWrapFee)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm pt-1.5 border-t border-line">
            <span className="font-semibold text-ink">Total payé</span>
            <span className="font-semibold text-ink">{formatFCFA(order.totalAmount)}</span>
          </div>
        </div>
      </div>

      {/* Gift order — recipient info stays separate from the buyer's own
          (shown above); the message is surfaced here so the seller/admin
          can prepare the package accordingly. */}
      {order.isGift && (
        <div className="card p-5 space-y-2 border-burgundy/20 bg-burgundy/5">
          <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5"><Gift size={15} className="text-burgundy" /> Commande cadeau</h2>
          {order.giftRecipientName && <p className="text-sm text-ink">Destinataire : <span className="font-medium">{order.giftRecipientName}</span></p>}
          {order.giftRecipientPhone && <p className="text-xs text-ink/55 flex items-center gap-1"><Phone size={11} /> {order.giftRecipientPhone}</p>}
          {order.giftWrap && <p className="text-xs text-ink/55">Emballage cadeau demandé.</p>}
          {order.giftMessage && <p className="text-sm text-ink/70 italic mt-1">"{order.giftMessage}"</p>}
        </div>
      )}

      {/* Delivery info — only relevant for delivery orders; per-shop status
          already shown below via StatusChip covers the delivery state
          itself (picked_up/delivering/delivered...). */}
      {order.fulfillmentType === 'delivery' && (order.deliveryNeighborhood || order.deliveryAddress || order.deliveryNotes || order.preferredDeliveryDate || order.preferredDeliverySlot) && (
        <div className="card p-5 space-y-2">
          <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5"><Truck size={15} className="text-ink/40" /> Livraison</h2>
          {(order.deliveryAddress || order.deliveryNeighborhood) && (
            <p className="text-sm text-ink">{[order.deliveryAddress, order.deliveryNeighborhood].filter(Boolean).join(', ')}</p>
          )}
          {(order.preferredDeliveryDate || order.preferredDeliverySlot) && (
            <p className="text-sm text-ink/70 flex items-center gap-1.5"><Clock size={13} className="text-ink/40" /> {[order.preferredDeliveryDate, order.preferredDeliverySlot].filter(Boolean).join(' · ')}</p>
          )}
          {order.deliveryNotes && <p className="text-sm text-ink/55 italic">"{order.deliveryNotes}"</p>}
        </div>
      )}

      {/* Shops (order_shops) & items */}
      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">Boutiques concernées</h2>
        <div className="space-y-3">
          {order.shops.map((shop) => (
            <div key={shop.orderShopId} className="card p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <button onClick={() => navigate(`/admin/boutiques/${shop.shopId}`)} className="flex items-center gap-1.5 text-sm font-semibold text-ink hover:text-burgundy">
                  <Store size={14} className="text-ink/40" /> {shop.shopName}
                </button>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-ink/5 text-ink/50">{shop.fulfillmentType === 'pickup' ? 'Retrait' : 'Livraison'}</span>
                  <StatusChip status={shop.status} />
                </div>
              </div>
              <div className="space-y-2">
                {shop.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink">{item.productName}</p>
                      {Object.entries(item.selectedOptions).length > 0 && (
                        <p className="text-xs text-ink/40">{Object.entries(item.selectedOptions).map(([k, v]) => `${k} : ${v}`).join(' · ')}</p>
                      )}
                    </div>
                    <span className="text-xs text-ink/50 flex-shrink-0">x{item.quantity}</span>
                    <span className="text-sm font-medium text-ink flex-shrink-0 w-20 text-right">{formatFCFA(item.lineTotal)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-line mt-3 pt-2 flex justify-between text-sm">
                <span className="text-ink/55">Sous-total boutique</span>
                <span className="font-semibold text-ink">{formatFCFA(shop.subtotal)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
