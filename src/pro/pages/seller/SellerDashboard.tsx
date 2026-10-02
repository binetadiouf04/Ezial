import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import { fetchSellerFinances } from '@/lib/supabaseSellerFinances';
import { fetchSellerOrders, type SellerOrderSummary } from '@/lib/supabaseSellerOrders';
import { fetchSellerProducts } from '@/lib/supabaseSellerProducts';
import { formatFCFA, formatDateTime } from '../../data';
import SummaryCard from '../../components/SummaryCard';
import { StatusChip } from '../../components/StatusChip';
import { ShoppingBag, Package, Wallet, Clock, ChevronRight, Truck, Store, Loader2 } from 'lucide-react';

const MAX_ACTIVE = 25;

export default function SellerDashboard() {
  const { navigate, sellerSupabaseShopId, sellerShopIsOfficial } = usePro();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<SellerOrderSummary[]>([]);
  const [activeProducts, setActiveProducts] = useState(0);
  const [availableBalance, setAvailableBalance] = useState(0);

  const load = useCallback(async (shopId: string) => {
    setLoading(true);
    const [sellerOrders, products, finances] = await Promise.all([
      fetchSellerOrders(shopId),
      fetchSellerProducts(shopId),
      fetchSellerFinances(shopId),
    ]);
    setOrders(sellerOrders);
    setActiveProducts(products.filter((p) => p.status === 'active').length);
    setAvailableBalance(finances.availableBalance);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (sellerSupabaseShopId) void load(sellerSupabaseShopId);
  }, [sellerSupabaseShopId, load]);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Accueil</h1>
        <p className="mt-1 text-sm text-ink/55">Vue d'ensemble de votre activité</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Nouvelles commandes" value={newOrders} icon={<ShoppingBag size={16} />} onClick={() => navigate('/seller/commandes')} />
        <SummaryCard label="En préparation" value={preparing} icon={<Clock size={16} />} onClick={() => navigate('/seller/commandes')} />
        <SummaryCard label="Prêtes" value={ready} icon={<Package size={16} />} onClick={() => navigate('/seller/commandes')} />
        <SummaryCard label="Produits actifs" value={sellerShopIsOfficial ? activeProducts : `${activeProducts} / ${MAX_ACTIVE}`} icon={<Package size={16} />} onClick={() => navigate('/seller/produits')} />
      </div>

      <SummaryCard label="Solde disponible" value={formatFCFA(availableBalance)} icon={<Wallet size={16} />} accent onClick={() => navigate('/seller/finances')} />

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
