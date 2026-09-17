import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import {
  fetchSellerOrderDetail, advanceOrderShopStatus, nextSellerStatus, sellerActionLabel,
  type SellerOrderDetail as SellerOrderDetailData,
} from '@/lib/supabaseSellerOrders';
import { formatFCFA } from '@/data/products';
import { StatusChip } from '../../components/StatusChip';
import { ArrowLeft, Truck, Store, Phone, Check, Package, Loader2, AlertCircle, Clock, MessageSquare, Gift } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatPreferredDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function SellerOrderDetail({ orderId }: { orderId: string }) {
  const { navigate, sellerSupabaseShopId } = usePro();
  const [order, setOrder] = useState<SellerOrderDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [advancing, setAdvancing] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    if (!sellerSupabaseShopId) { setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    try {
      const detail = await fetchSellerOrderDetail(sellerSupabaseShopId, orderId);
      setOrder(detail);
      if (!detail) setLoadError('Commande introuvable.');
    } catch {
      setLoadError('Impossible de charger la commande. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, [sellerSupabaseShopId, orderId]);

  useEffect(() => { void load(); }, [load]);

  const handleAdvance = async () => {
    if (!order) return;
    const next = nextSellerStatus(order.fulfillmentType, order.status);
    if (!next) return;
    setAdvancing(true);
    setActionError('');
    const result = await advanceOrderShopStatus(order.orderShopId, next);
    setAdvancing(false);
    if (result.error) { setActionError(result.error); return; }
    setOrder({ ...order, status: next });
  };

  if (!sellerSupabaseShopId) {
    return (
      <div className="text-center py-16">
        <Package size={36} className="mx-auto text-ink/20" />
        <p className="mt-3 text-sm text-ink/55">Disponible une fois votre boutique connectée à votre compte vendeur.</p>
        <button onClick={() => navigate('/seller/commandes')} className="btn-outline mt-4">Retour aux commandes</button>
      </div>
    );
  }

  if (loading) {
    return <div className="py-16 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>;
  }

  if (loadError || !order) {
    return (
      <div className="text-center py-16">
        <Package size={36} className="mx-auto text-ink/20" />
        <p className="mt-3 text-sm text-ink/55">{loadError || 'Commande introuvable'}</p>
        <button onClick={() => navigate('/seller/commandes')} className="btn-outline mt-4">Retour aux commandes</button>
      </div>
    );
  }

  const isDelivery = order.fulfillmentType === 'delivery';
  const action = sellerActionLabel(order.fulfillmentType, order.status);
  const preferredDate = formatPreferredDate(order.preferredDate);

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/seller/commandes')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors">
        <ArrowLeft size={16} /> Commandes
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink break-all">Commande {order.orderNumber}</h1>
          <p className="mt-1 text-sm text-ink/55">{formatDateTime(order.createdAt)}</p>
        </div>
        <StatusChip status={order.status} size="md" />
      </div>

      {/* Products — this shop's items only */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink mb-4">Articles</h2>
        <div className="space-y-4">
          {order.items.map((item) => (
            <div key={item.id} className="flex gap-3">
              {item.imageUrl && <SmartImage src={item.imageUrl} alt="" className="h-16 w-14 rounded-lg object-cover flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink">{item.productName}</p>
                {Object.entries(item.selectedOptions).length > 0 && (
                  <p className="text-xs text-ink/50 mt-0.5">{Object.entries(item.selectedOptions).map(([k, v]) => `${k} : ${v}`).join(' · ')}</p>
                )}
                <p className="text-xs text-ink/50 mt-0.5">Quantité : {item.quantity}</p>
                <p className="text-xs text-ink/40 mt-0.5">Prix unitaire : {formatFCFA(item.unitPrice)}</p>
              </div>
              <span className="text-sm font-semibold text-ink flex-shrink-0">{formatFCFA(item.lineTotal)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-line mt-4 pt-3 flex justify-between text-sm">
          <span className="font-medium text-ink">Sous-total boutique</span>
          <span className="font-semibold text-ink">{formatFCFA(order.shopSubtotal)}</span>
        </div>
      </div>

      {/* Customer & fulfillment info */}
      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5">
          {isDelivery ? <><Truck size={15} className="text-burgundy" /> Livraison Ezial</> : <><Store size={15} className="text-burgundy" /> Retrait en boutique</>}
        </h2>
        <div className="space-y-1.5 text-sm text-ink/60">
          <p>Client : {order.customerName}</p>
          {order.customerPhone && <p className="flex items-center gap-1.5"><Phone size={13} className="text-ink/40" /> {order.customerPhone}</p>}
          {isDelivery && (
            <p className="text-xs text-ink/40">Ezial prend en charge la livraison — une fois la commande prête, le livreur collectera le colis.</p>
          )}
          {order.neighborhood && <p className="text-xs text-ink/40">Quartier : {order.neighborhood}</p>}
        </div>
        {(preferredDate || order.preferredSlot) && (
          <p className="flex items-start gap-1.5 text-sm text-ink/60">
            <Clock size={14} className="mt-0.5 flex-shrink-0 text-ink/40" />
            Créneau demandé : {[preferredDate, order.preferredSlot].filter(Boolean).join(' · ')}
          </p>
        )}
        {order.deliveryNotes && (
          <p className="flex items-start gap-1.5 text-sm text-ink/60">
            <MessageSquare size={14} className="mt-0.5 flex-shrink-0 text-ink/40" />
            {order.deliveryNotes}
          </p>
        )}
        {order.pickupCode && !isDelivery && (
          <p className="text-xs text-ink/40">Code de retrait : <span className="font-mono font-semibold text-ink">{order.pickupCode}</span></p>
        )}
      </div>

      {/* Gift order — surfaced so the seller can prepare the package
          accordingly (recipient is separate from the buyer shown above). */}
      {order.isGift && (
        <div className="card p-5 space-y-2 border-burgundy/20 bg-burgundy/5">
          <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5"><Gift size={15} className="text-burgundy" /> Commande cadeau</h2>
          {order.giftRecipientName && <p className="text-sm text-ink">Destinataire : <span className="font-medium">{order.giftRecipientName}</span></p>}
          {order.giftRecipientPhone && <p className="text-xs text-ink/55 flex items-center gap-1"><Phone size={11} /> {order.giftRecipientPhone}</p>}
          {order.giftWrap && <p className="text-xs text-ink/55">Emballage cadeau demandé — {formatFCFA(order.giftWrapFee)}.</p>}
          {order.giftMessage && <p className="text-sm text-ink/70 italic mt-1">"{order.giftMessage}"</p>}
        </div>
      )}

      {/* Status & action */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink mb-3">Statut</h2>

        {order.status === 'ready' && isDelivery && (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 mb-3">
            <Check size={16} className="text-green-600" />
            <p className="text-sm font-medium text-green-700">Commande prête pour collecte Ezial</p>
          </div>
        )}
        {order.status === 'ready_for_pickup' && !isDelivery && (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 mb-3">
            <Check size={16} className="text-green-600" />
            <p className="text-sm font-medium text-green-700">Commande prête, en attente du client</p>
          </div>
        )}
        {['picked_up', 'delivering', 'delivered', 'collected'].includes(order.status) && (
          <div className="flex items-center gap-2 rounded-lg bg-ink/5 p-3 mb-3">
            <Check size={16} className="text-ink/40" />
            <p className="text-sm font-medium text-ink/60">Prise en charge par le livreur ou le client — plus d'action de votre part.</p>
          </div>
        )}

        {actionError && (
          <p className="mb-3 flex items-start gap-1.5 text-sm text-burgundy"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> {actionError}</p>
        )}

        {action && (
          <button onClick={() => void handleAdvance()} disabled={advancing} className="btn-primary w-full">
            {advancing ? <><Loader2 size={16} className="animate-spin" /> Mise à jour...</> : action}
          </button>
        )}
      </div>
    </div>
  );
}
