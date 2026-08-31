import { useState } from 'react';
import { usePro } from '../../ProContext';
import { formatFCFA, commissionAmount } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { ArrowLeft, Store, ShoppingBag, Wallet, X, AlertTriangle } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

type Tab = 'info' | 'products' | 'orders' | 'finances';

export default function AdminShopDetail({ shopId }: { shopId: string }) {
  const { allShops, allProducts, allOrders, allTransactions, navigate, toggleShopStatus } = usePro();
  const [tab, setTab] = useState<Tab>('info');
  const [showSuspend, setShowSuspend] = useState(false);

  const shop = allShops.find((s) => s.id === shopId);
  if (!shop) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-ink/55">Boutique introuvable</p>
        <button onClick={() => navigate('/admin/boutiques')} className="btn-outline mt-4">Retour</button>
      </div>
    );
  }

  const shopProducts = allProducts.filter((p) => p.shopId === shop.id);
  const activeProductCount = shopProducts.filter((p) => p.status === 'published').length;
  const shopOrders = allOrders.filter((o) => o.subOrders.some((s) => s.shopId === shop.id));
  const shopTransactions = allTransactions.filter((t) => t.shopName === shop.name);

  const tabs: { id: Tab; label: string; icon: typeof Store }[] = [
    { id: 'info', label: 'Informations', icon: Store },
    { id: 'products', label: 'Produits', icon: ShoppingBag },
    { id: 'orders', label: 'Commandes', icon: ShoppingBag },
    { id: 'finances', label: 'Finances', icon: Wallet },
  ];

  const grossSales = shop.weeklyGross;
  const commission = commissionAmount(grossSales);
  const netBalance = grossSales - commission;

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/admin/boutiques')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={16} /> Boutiques
      </button>

      {/* Shop header */}
      <div className="card p-5 flex items-center gap-4">
        <SmartImage src={shop.logo} alt="" className="h-16 w-16 rounded-xl object-cover flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-lg font-semibold text-ink">{shop.name}</h1>
          <p className="text-xs text-ink/45 font-mono mt-0.5">{shop.sellerId}</p>
          <p className="text-xs text-ink/45 mt-0.5">{shop.categoryFocus}</p>
        </div>
        <StatusChip status={shop.status} size="md" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors flex-shrink-0 ${tab === t.id ? 'bg-burgundy text-white' : 'bg-white border border-line text-ink/60'}`}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Info tab */}
      {tab === 'info' && (
        <div className="card divide-y divide-line">
          <div className="flex items-center justify-between p-4">
            <span className="text-sm text-ink/55">Description</span>
            <span className="text-sm text-ink text-right max-w-[60%]">{shop.description}</span>
          </div>
          <div className="flex items-center justify-between p-4">
            <span className="text-sm text-ink/55">Téléphone</span>
            <span className="text-sm font-medium text-ink">{shop.contact}</span>
          </div>
          <div className="flex items-center justify-between p-4">
            <span className="text-sm text-ink/55">Adresse</span>
            <span className="text-sm font-medium text-ink">{shop.pickupAddress}</span>
          </div>
          <div className="flex items-center justify-between p-4">
            <span className="text-sm text-ink/55">Plan</span>
            <span className="text-sm font-medium text-ink capitalize">{shop.plan === 'founder' ? 'Founder' : 'Standard'}</span>
          </div>
          <div className="flex items-center justify-between p-4">
            <span className="text-sm text-ink/55">Membre depuis</span>
            <span className="text-sm font-medium text-ink">{new Date(shop.joinDate).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</span>
          </div>
        </div>
      )}

      {/* Products tab */}
      {tab === 'products' && (
        <div className="space-y-3">
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink/55">Produits actifs</span>
              <span className="text-sm font-semibold text-ink">{activeProductCount} / 25</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-cream overflow-hidden">
              <div className="h-full bg-burgundy rounded-full" style={{ width: `${Math.min((activeProductCount / 25) * 100, 100)}%` }} />
            </div>
          </div>
          {shopProducts.map((product) => (
            <button key={product.id} onClick={() => navigate(`/admin/produits/${product.id}`)} className="card w-full p-3 flex items-center gap-3 text-left">
              <SmartImage src={product.image} alt="" className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">{product.name}</p>
                <p className="text-xs text-ink/45">{formatFCFA(product.price)}</p>
              </div>
              <StatusChip status={product.status} />
            </button>
          ))}
        </div>
      )}

      {/* Orders tab */}
      {tab === 'orders' && (
        <div className="card divide-y divide-line">
          {shopOrders.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink/45">Aucune commande</p>
          ) : (
            shopOrders.map((order) => (
              <button key={order.id} onClick={() => navigate(`/admin/commandes/${order.id}`)} className="flex items-center justify-between p-4 w-full text-left hover:bg-cream/40 transition-colors">
                <div>
                  <p className="font-mono text-sm font-semibold text-ink">{order.id}</p>
                  <p className="text-xs text-ink/45 mt-0.5">{order.customerName}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-ink">{formatFCFA(order.total)}</span>
                  <StatusChip status={order.status} />
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Finances tab */}
      {tab === 'finances' && (
        <div className="space-y-4">
          <div className="card p-5 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-ink/55">Ventes (semaine)</span>
              <span className="font-medium text-ink">{formatFCFA(grossSales)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink/55">Commission Ezial (8%)</span>
              <span className="font-medium text-red-500">- {formatFCFA(commission)}</span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-line">
              <span className="font-semibold text-ink">Net vendeur</span>
              <span className="font-semibold text-ink">{formatFCFA(netBalance)}</span>
            </div>
          </div>

          <div className="card divide-y divide-line">
            <p className="p-4 text-xs font-semibold text-ink/50 uppercase tracking-wider">Transactions</p>
            {shopTransactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-mono text-sm font-medium text-ink">{t.orderId}</p>
                  <p className="text-xs text-ink/45">{formatFCFA(t.gross)} → {formatFCFA(t.net)}</p>
                </div>
                <StatusChip status={t.payout} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status actions */}
      <div className="pt-2">
        {shop.status === 'active' ? (
          <button onClick={() => setShowSuspend(true)} className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors">Suspendre la boutique</button>
        ) : (
          <button onClick={() => toggleShopStatus(shop.id, 'active')} className="btn-primary w-full">Activer la boutique</button>
        )}
      </div>

      {/* Suspend confirmation */}
      {showSuspend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setShowSuspend(false)}>
          <div className="card max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg font-semibold text-ink">Suspendre la boutique</h3>
              <button onClick={() => setShowSuspend(false)}><X size={18} className="text-ink/40" /></button>
            </div>
            <div className="flex items-start gap-2 mb-5">
              <AlertTriangle size={18} className="text-orange-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-ink/55">La boutique sera désactivée. Ses produits ne seront plus visibles sur la marketplace.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSuspend(false)} className="btn-outline flex-1">Retour</button>
              <button onClick={() => { toggleShopStatus(shop.id, 'suspended'); setShowSuspend(false); }} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors">Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
