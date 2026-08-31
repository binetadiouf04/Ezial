import { useState } from 'react';
import { usePro } from '../../ProContext';
import { formatFCFA, commissionAmount, shopModerationReasons } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import ModerationModal from '../../components/ModerationModal';
import ModerationHistoryList from '../../components/ModerationHistoryList';
import { ArrowLeft, Store, ShoppingBag, Wallet, Pencil, Flag, Ban, RotateCcw, History, Check } from 'lucide-react';
import SmartImage from '@/components/SmartImage';
import type { ModerationInput } from '../../ProContext';

type Tab = 'info' | 'products' | 'orders' | 'finances' | 'history';
type ModalKind = 'flag' | 'deactivate' | null;

const shopStatusLabels: Record<string, string> = {
  active: 'Active', pending: 'En attente', flagged: 'Signalée', suspended: 'Suspendue', inactive: 'Désactivée',
};

export default function AdminShopDetail({ shopId }: { shopId: string }) {
  const { allShops, allProducts, allOrders, allTransactions, navigate, deactivateShop, flagShop, reactivateShop, updateShopInfo, getModerationHistory } = usePro();
  const [tab, setTab] = useState<Tab>('info');
  const [modal, setModal] = useState<ModalKind>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<{ name: string; description: string; contact: string; pickupAddress: string; categoryFocus: string } | null>(null);

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
  const history = getModerationHistory('shop', shop.id);

  const tabs: { id: Tab; label: string; icon: typeof Store }[] = [
    { id: 'info', label: 'Informations', icon: Store },
    { id: 'products', label: 'Produits', icon: ShoppingBag },
    { id: 'orders', label: 'Commandes', icon: ShoppingBag },
    { id: 'finances', label: 'Finances', icon: Wallet },
    { id: 'history', label: 'Historique', icon: History },
  ];

  const grossSales = shop.weeklyGross;
  const commission = commissionAmount(grossSales);
  const netBalance = grossSales - commission;

  const startEdit = () => {
    setEditForm({ name: shop.name, description: shop.description, contact: shop.contact, pickupAddress: shop.pickupAddress, categoryFocus: shop.categoryFocus });
    setEditing(true);
  };

  const saveEdit = () => {
    if (!editForm) return;
    updateShopInfo(shop.id, editForm);
    setEditing(false);
    setEditForm(null);
  };

  const modalConfig: Record<Exclude<ModalKind, null>, { title: string; notice: string; confirmLabel: string }> = {
    flag: { title: 'Signaler la boutique', confirmLabel: 'Signaler', notice: 'La boutique reste visible mais est marquée signalée côté Admin et vendeur.' },
    deactivate: { title: 'Désactiver la boutique', confirmLabel: 'Désactiver', notice: 'La boutique sera désactivée. Ses commandes passées restent conservées et accessibles.' },
  };

  const handleConfirmModal = (input: ModerationInput) => {
    if (modal === 'flag') flagShop(shop.id, input);
    if (modal === 'deactivate') deactivateShop(shop.id, input);
    setModal(null);
  };

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
        <StatusChip status={shop.status} size="md" label={shopStatusLabels[shop.status]} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors flex-shrink-0 ${tab === t.id ? 'bg-burgundy text-white' : 'bg-white border border-line text-ink/60'}`}>
              <Icon size={15} /> {t.label}{t.id === 'history' && history.length > 0 && ` (${history.length})`}
            </button>
          );
        })}
      </div>

      {/* Info tab */}
      {tab === 'info' && (
        <>
          {!editing ? (
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
                <span className="text-sm text-ink/55">Catégorie</span>
                <span className="text-sm font-medium text-ink">{shop.categoryFocus}</span>
              </div>
              <div className="flex items-center justify-between p-4">
                <span className="text-sm text-ink/55">Plan</span>
                <span className="text-sm font-medium text-ink capitalize">{shop.plan === 'founder' ? 'Founder' : 'Standard'}</span>
              </div>
              <div className="flex items-center justify-between p-4">
                <span className="text-sm text-ink/55">Membre depuis</span>
                <span className="text-sm font-medium text-ink">{new Date(shop.joinDate).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</span>
              </div>
              <div className="p-4">
                <button onClick={startEdit} className="flex items-center gap-1.5 text-sm font-medium text-burgundy hover:underline">
                  <Pencil size={14} /> Modifier les informations
                </button>
              </div>
            </div>
          ) : (
            <div className="card p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Nom de la boutique</label>
                <input className="input-field" value={editForm?.name ?? ''} onChange={(e) => setEditForm((f) => f && { ...f, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Description</label>
                <textarea className="input-field" rows={3} value={editForm?.description ?? ''} onChange={(e) => setEditForm((f) => f && { ...f, description: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Téléphone</label>
                <input className="input-field" value={editForm?.contact ?? ''} onChange={(e) => setEditForm((f) => f && { ...f, contact: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Adresse</label>
                <input className="input-field" value={editForm?.pickupAddress ?? ''} onChange={(e) => setEditForm((f) => f && { ...f, pickupAddress: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Catégorie</label>
                <input className="input-field" value={editForm?.categoryFocus ?? ''} onChange={(e) => setEditForm((f) => f && { ...f, categoryFocus: e.target.value })} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setEditing(false); setEditForm(null); }} className="btn-outline flex-1">Annuler</button>
                <button onClick={saveEdit} className="btn-primary flex-1">Enregistrer</button>
              </div>
            </div>
          )}
        </>
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

      {/* History tab */}
      {tab === 'history' && <ModerationHistoryList entries={history} />}

      {/* Status actions */}
      <div className="pt-2 space-y-2">
        {shop.status === 'pending' && (
          <button onClick={() => reactivateShop(shop.id)} className="btn-primary w-full flex items-center justify-center gap-1.5">
            <Check size={15} /> Valider la boutique
          </button>
        )}
        {shop.status === 'active' && (
          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={() => setModal('flag')} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-medium text-orange-600 hover:bg-orange-100 transition-colors">
              <Flag size={15} /> Signaler
            </button>
            <button onClick={() => setModal('deactivate')} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors">
              <Ban size={15} /> Désactiver
            </button>
          </div>
        )}
        {shop.status === 'flagged' && (
          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={() => setModal('deactivate')} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors">
              <Ban size={15} /> Désactiver
            </button>
            <button onClick={() => reactivateShop(shop.id)} className="flex-1 btn-primary flex items-center justify-center gap-1.5">
              <RotateCcw size={15} /> Réactiver
            </button>
          </div>
        )}
        {(shop.status === 'suspended' || shop.status === 'inactive') && (
          <button onClick={() => reactivateShop(shop.id)} className="btn-primary w-full flex items-center justify-center gap-1.5">
            <RotateCcw size={15} /> Réactiver la boutique
          </button>
        )}
      </div>

      {modal && (
        <ModerationModal
          title={modalConfig[modal].title}
          notice={modalConfig[modal].notice}
          confirmLabel={modalConfig[modal].confirmLabel}
          reasons={shopModerationReasons}
          onCancel={() => setModal(null)}
          onConfirm={handleConfirmModal}
        />
      )}
    </div>
  );
}
