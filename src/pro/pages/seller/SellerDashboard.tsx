import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import { supabase } from '@/lib/supabaseClient';
import { fetchSellerFinances } from '@/lib/supabaseSellerFinances';
import { fetchSellerOrders, type SellerOrderSummary } from '@/lib/supabaseSellerOrders';
import { fetchSellerProducts } from '@/lib/supabaseSellerProducts';
import { fetchShopOnboarding } from '@/lib/supabaseSellerShop';
import { fetchSellerSubscription, fetchSubscriptionPayments, summarizeCurrentPlan, type CurrentPlanSummary, type SellerGiftInfo } from '@/lib/supabaseSellerSubscription';
import { formatFCFA, formatDateTime, formatDate } from '../../data';
import SummaryCard from '../../components/SummaryCard';
import { StatusChip } from '../../components/StatusChip';
import GiftAccessNotice from '../../components/GiftAccessNotice';
import NotificationOptIn from '@/components/NotificationOptIn';
import NotificationGateModal from '@/components/NotificationGateModal';
import { ShoppingBag, Package, Wallet, Clock, ChevronRight, Truck, Store, Loader2, ArrowRight, Crown } from 'lucide-react';

export default function SellerDashboard() {
  const { navigate, sellerSupabaseShopId, sellerShopIsOfficial } = usePro();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<SellerOrderSummary[]>([]);
  const [activeProducts, setActiveProducts] = useState(0);
  // Was hardcoded to 25 here — stale from before the Free(10)/Premium(30)
  // product-limit redesign, so every seller saw "X / 25" regardless of
  // their actual plan. Now the same real per-shop limit "Mon abonnement"
  // already shows (fetchSellerSubscription().productLimit), not a second,
  // independently-wrong number.
  const [productLimit, setProductLimit] = useState(10);
  const [planSummary, setPlanSummary] = useState<CurrentPlanSummary | null>(null);
  const [gift, setGift] = useState<SellerGiftInfo | null>(null);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [shopDraft, setShopDraft] = useState(false);
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setAuthUserId(data.user?.id ?? null)); }, []);

  const load = useCallback(async (shopId: string, isOfficial: boolean) => {
    setLoading(true);
    const [sellerOrders, products, finances, onboarding, subscription, subscriptionPayments] = await Promise.all([
      fetchSellerOrders(shopId),
      fetchSellerProducts(shopId),
      fetchSellerFinances(shopId),
      fetchShopOnboarding(shopId),
      fetchSellerSubscription(shopId, { isOfficial }),
      fetchSubscriptionPayments(shopId),
    ]);
    setOrders(sellerOrders);
    setActiveProducts(products.filter((p) => p.status === 'active').length);
    setAvailableBalance(finances.availableBalance);
    setShopDraft(onboarding?.status === 'draft');
    setProductLimit(subscription.productLimit);
    setGift(subscription.gift);
    setPlanSummary(summarizeCurrentPlan(subscription, subscriptionPayments));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (sellerSupabaseShopId) void load(sellerSupabaseShopId, sellerShopIsOfficial);
  }, [sellerSupabaseShopId, sellerShopIsOfficial, load]);

  if (!sellerSupabaseShopId || loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Accueil</h1>
          <p className="mt-1 text-sm text-ink/55">Vue d'ensemble de votre activité</p>
        </div>
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      </div>
    );
  }

  const newOrders = orders.filter((o) => o.status === 'confirmed').length;
  const preparing = orders.filter((o) => o.status === 'preparing').length;
  const ready = orders.filter((o) => o.status === 'ready' || o.status === 'ready_for_pickup').length;
  const recentOrders = orders.slice(0, 5);
  const planDetails = planSummary
    ? [
      planSummary.amountLabel,
      planSummary.periodLabel,
      planSummary.expiresAt ? `${planSummary.isExpired ? 'expiré le' : 'jusqu’au'} ${formatDate(planSummary.expiresAt)}` : null,
    ].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Accueil</h1>
        <p className="mt-1 text-sm text-ink/55">Vue d'ensemble de votre activité</p>
      </div>

      {/* No admin approval gates a new signup any more — this is the one
          real blocker left before the shop goes live on its own
          (activate_shop_if_ready() checks these exact fields), so it's
          the single most useful thing to surface right here. */}
      {shopDraft && (
        <button onClick={() => navigate('/seller/boutique')} className="flex w-full items-center justify-between gap-3 rounded-xl border border-burgundy/20 bg-burgundy/5 p-4 text-left transition-colors hover:bg-burgundy/10">
          <div className="flex items-center gap-3">
            <Store size={20} className="flex-shrink-0 text-burgundy" />
            <div>
              <p className="text-sm font-semibold text-ink">Complétez votre boutique pour passer en ligne</p>
              <p className="mt-0.5 text-xs text-ink/55">Description, téléphone et quartier ou adresse — votre boutique s'active automatiquement dès que c'est fait.</p>
            </div>
          </div>
          <ArrowRight size={16} className="flex-shrink-0 text-burgundy" />
        </button>
      )}

      {authUserId && (
        <>
          <NotificationGateModal userId={authUserId} label="Notifications de nouvelles commandes" />
          <NotificationOptIn userId={authUserId} label="Notifications de nouvelles commandes" />
        </>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Nouvelles commandes" value={newOrders} icon={<ShoppingBag size={16} />} onClick={() => navigate('/seller/commandes')} />
        <SummaryCard label="En préparation" value={preparing} icon={<Clock size={16} />} onClick={() => navigate('/seller/commandes')} />
        <SummaryCard label="Prêtes" value={ready} icon={<Package size={16} />} onClick={() => navigate('/seller/commandes')} />
        <SummaryCard label="Produits actifs" value={sellerShopIsOfficial ? activeProducts : `${activeProducts} / ${productLimit}`} icon={<Package size={16} />} onClick={() => navigate('/seller/produits')} />
      </div>

      <SummaryCard label="Solde disponible" value={formatFCFA(availableBalance)} icon={<Wallet size={16} />} accent onClick={() => navigate('/seller/finances')} />

      {/* Current plan — the official Ezial shop shows "Ezial Plus — boutique officielle". */}
      {gift && (
        <div className="space-y-2">
          <GiftAccessNotice gift={gift} />
          <button onClick={() => navigate('/seller/abonnement')} className="flex items-center gap-1 text-xs font-medium text-burgundy hover:underline">
            Voir mon abonnement <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      {planSummary && !gift && (
        <button onClick={() => navigate('/seller/abonnement')} className="card flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-cream/30">
          <div className="flex min-w-0 items-start gap-3">
            <Crown size={18} className={`mt-0.5 flex-shrink-0 ${planSummary.name === 'Ezial Free' ? 'text-ink/30' : 'text-burgundy'}`} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{planSummary.name}</p>
              {planDetails && <p className="mt-0.5 text-xs text-ink/55">{planDetails}</p>}
            </div>
          </div>
          <ChevronRight size={16} className="flex-shrink-0 text-ink/30" />
        </button>
      )}

      {/* Recent orders */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink">Commandes récentes</h2>
          <button onClick={() => navigate('/seller/commandes')} className="text-xs font-medium text-burgundy hover:underline">Voir tout</button>
        </div>
        <div className="card divide-y divide-line">
          {recentOrders.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink/45">Aucune commande récente</p>
          ) : (
            recentOrders.map((order) => (
              <button key={order.orderShopId} onClick={() => navigate(`/seller/commandes/${order.orderShopId}`)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-cream/30 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-ink">{order.orderNumber}</span>
                    <StatusChip status={order.status} />
                  </div>
                  <p className="mt-1 text-xs text-ink/45">{formatDateTime(order.createdAt)}</p>
                  <p className="mt-0.5 text-xs text-ink/55 flex items-center gap-1">
                    {order.fulfillmentType === 'pickup' ? <><Store size={11} /> Retrait</> : <><Truck size={11} /> Livraison Ezial</>}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-ink">{formatFCFA(order.shopSubtotal)}</p>
                  <ChevronRight size={16} className="ml-auto mt-1 text-ink/20" />
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
