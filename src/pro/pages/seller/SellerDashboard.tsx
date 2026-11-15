import { useState, useEffect, useCallback } from 'react';
import ShopLinkCard from '../../components/ShopLinkCard';
import { usePro } from '../../ProContext';
import { supabase } from '@/lib/supabaseClient';
import { fetchSellerFinances } from '@/lib/supabaseSellerFinances';
import { fetchSellerOrders, type SellerOrderSummary } from '@/lib/supabaseSellerOrders';
import { fetchSellerProducts } from '@/lib/supabaseSellerProducts';
import { fetchShopOnboarding } from '@/lib/supabaseSellerShop';
import { fetchSellerSubscription, fetchSubscriptionPayments, summarizeCurrentPlan, type CurrentPlanSummary, type SellerGiftInfo } from '@/lib/supabaseSellerSubscription';
import { formatFCFA, formatDateTime, formatDate } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import GiftAccessNotice from '../../components/GiftAccessNotice';
import NotificationOptIn from '@/components/NotificationOptIn';
import NotificationGateModal from '@/components/NotificationGateModal';
import { ShoppingBag, Package, Wallet, ChevronRight, Truck, Store, Loader2, ArrowRight, Crown, Plus } from 'lucide-react';

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

  const header = (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">Accueil</h1>
      <p className="mt-0.5 text-sm text-ink/55">Vue d'ensemble de votre activité</p>
    </div>
  );

  if (!sellerSupabaseShopId || loading) {
    return (
      <div className="space-y-4">
        {header}
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
  const toHandle = [
    { label: 'Nouvelles', value: newOrders, highlight: newOrders > 0 },
    { label: 'En préparation', value: preparing, highlight: false },
    { label: 'Prêtes', value: ready, highlight: false },
  ];
  const quickActions = [
    { label: 'Ajouter un produit', short: 'Ajouter', icon: Plus, route: '/seller/produits/ajouter' },
    { label: 'Mes commandes', short: 'Commandes', icon: ShoppingBag, route: '/seller/commandes' },
    { label: 'Mes finances', short: 'Finances', icon: Wallet, route: '/seller/finances' },
    { label: 'Ma boutique', short: 'Boutique', icon: Store, route: '/seller/boutique' },
  ];
  const productRatio = productLimit > 0 ? Math.min(1, activeProducts / productLimit) : 0;

  return (
    <div className="space-y-4">
      {header}

      {/* No admin approval gates a new signup any more — this is the one
          real blocker left before the shop goes live on its own
          (activate_shop_if_ready() checks these exact fields), so it's
          the single most useful thing to surface right here. */}
      {shopDraft && (
        <button onClick={() => navigate('/seller/boutique')} className="flex w-full items-center justify-between gap-3 rounded-xl border border-burgundy/20 bg-burgundy/5 px-4 py-3 text-left transition-colors hover:bg-burgundy/10">
          <div className="flex items-center gap-3">
            <Store size={18} className="flex-shrink-0 text-burgundy" />
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

      <div className="grid gap-3 lg:grid-cols-5">
        {/* Solde disponible — fond bordeaux satiné de l'identité Ezial. */}
        <button
          onClick={() => navigate('/seller/finances')}
          className="group relative overflow-hidden rounded-xl bg-burgundy px-4 py-4 text-left text-white lg:col-span-2"
          style={{ backgroundImage: 'radial-gradient(120% 90% at 100% 0%, rgba(140,16,36,0.95) 0%, rgba(140,16,36,0) 60%), radial-gradient(90% 80% at 0% 100%, rgba(58,8,18,0.9) 0%, rgba(58,8,18,0) 55%)' }}
        >
          <span className="flex items-center justify-between text-xs font-medium text-white/70">
            Solde disponible <Wallet size={15} className="text-white/55" aria-hidden="true" />
          </span>
          <span className="mt-1.5 block text-[26px] font-semibold leading-tight tracking-tightish">{formatFCFA(availableBalance)}</span>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-white/80 group-hover:text-white">
            Voir mes finances <ChevronRight size={13} aria-hidden="true" />
          </span>
        </button>

        {/* Commandes à traiter — trois compteurs sur une seule ligne. */}
        <section className="rounded-xl border border-line bg-white lg:col-span-3" aria-labelledby="to-handle-title">
          <div className="flex items-center justify-between px-4 pt-3">
            <h2 id="to-handle-title" className="text-xs font-medium text-ink/55">Commandes à traiter</h2>
            <button onClick={() => navigate('/seller/commandes')} className="flex items-center gap-0.5 text-xs font-medium text-burgundy hover:underline">Tout voir <ChevronRight size={13} aria-hidden="true" /></button>
          </div>
          <div className="grid grid-cols-3 divide-x divide-line px-1 pb-2 pt-1.5">
            {toHandle.map((item) => (
              <button key={item.label} onClick={() => navigate('/seller/commandes')} className="rounded-lg px-3 py-2 text-left transition-colors hover:bg-cream/50">
                <span className={`flex items-center gap-1.5 text-[26px] font-semibold leading-tight tracking-tightish ${item.highlight ? 'text-burgundy' : 'text-ink'}`}>
                  {item.value}
                  {item.highlight && <span className="h-2 w-2 rounded-full bg-burgundy-ruby" aria-hidden="true" />}
                </span>
                <span className="mt-0.5 block text-xs text-ink/55">{item.label}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Produits actifs, avec la limite de la formule. */}
        <button onClick={() => navigate('/seller/produits')} className="rounded-xl border border-line bg-white px-4 py-3 text-left transition-colors hover:border-ink/20">
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs font-medium text-ink/55"><Package size={15} className="text-burgundy/60" aria-hidden="true" /> Produits actifs</span>
            <ChevronRight size={15} className="text-ink/25" aria-hidden="true" />
          </span>
          <span className="mt-1 block text-lg font-semibold tabular-nums text-ink">
            {activeProducts}{!sellerShopIsOfficial && <span className="text-sm font-medium text-ink/45"> / {productLimit}</span>}
          </span>
          {!sellerShopIsOfficial && (
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-burgundy/10" aria-hidden="true">
              <span className="block h-full rounded-full bg-burgundy-ruby" style={{ width: `${Math.round(productRatio * 100)}%` }} />
            </span>
          )}
        </button>

        {/* Current plan — the official Ezial shop shows "Ezial Plus — boutique officielle". */}
        {planSummary && !gift && (
          <button onClick={() => navigate('/seller/abonnement')} className="rounded-xl border border-line bg-white px-4 py-3 text-left transition-colors hover:border-ink/20">
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-ink/55"><Crown size={15} className={planSummary.name === 'Ezial Free' ? 'text-ink/35' : 'text-burgundy'} aria-hidden="true" /> Mon abonnement</span>
              <ChevronRight size={15} className="text-ink/25" aria-hidden="true" />
            </span>
            <span className="mt-1 block text-lg font-semibold text-ink">{planSummary.name}</span>
            {planDetails && <span className="mt-0.5 block text-xs text-ink/55">{planDetails}</span>}
          </button>
        )}
      </div>

      {gift && (
        <div className="space-y-2">
          <GiftAccessNotice gift={gift} />
          <button onClick={() => navigate('/seller/abonnement')} className="flex items-center gap-1 text-xs font-medium text-burgundy hover:underline">
            Voir mon abonnement <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Actions rapides — toujours à portée de pouce sur téléphone. */}
      <nav aria-label="Actions rapides" className="grid grid-cols-4 gap-2">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <button key={action.route} onClick={() => navigate(action.route)} className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-white px-1 py-2.5 text-center transition-colors hover:border-burgundy/30 hover:bg-burgundy/5 sm:flex-row sm:justify-center sm:gap-2 sm:px-3">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-burgundy/10 text-burgundy"><Icon size={16} aria-hidden="true" /></span>
              <span className="text-[11px] font-medium leading-tight text-ink/75 sm:text-sm">
                <span className="sm:hidden">{action.short}</span><span className="hidden sm:inline">{action.label}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* Recent orders */}
      <ShopLinkCard shopId={sellerSupabaseShopId} compact />

      <section aria-labelledby="recent-orders-title">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="recent-orders-title" className="text-sm font-semibold text-ink">Commandes récentes</h2>
          <button onClick={() => navigate('/seller/commandes')} className="flex items-center gap-0.5 text-xs font-medium text-burgundy hover:underline">Voir tout <ChevronRight size={13} aria-hidden="true" /></button>
        </div>
        <div className="card divide-y divide-line">
          {recentOrders.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink/45">Aucune commande récente</p>
          ) : (
            recentOrders.map((order) => (
              <button key={order.orderShopId} onClick={() => navigate(`/seller/commandes/${order.orderShopId}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-cream/30">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-sm font-semibold text-ink">{order.orderNumber}</span>
                    <StatusChip status={order.status} />
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-ink/50">
                    {order.fulfillmentType === 'pickup' ? <><Store size={11} aria-hidden="true" /> Retrait</> : <><Truck size={11} aria-hidden="true" /> Livraison Ezial</>}
                    <span aria-hidden="true">·</span> {formatDateTime(order.createdAt)}
                  </p>
                </div>
                <p className="flex-shrink-0 text-sm font-semibold tabular-nums text-ink">{formatFCFA(order.shopSubtotal)}</p>
                <ChevronRight size={16} className="flex-shrink-0 text-ink/20" aria-hidden="true" />
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
