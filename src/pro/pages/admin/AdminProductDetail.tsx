import { useState } from 'react';
import { usePro } from '../../ProContext';
import { formatFCFA, productModerationReasons } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import ModerationModal from '../../components/ModerationModal';
import ModerationHistoryList from '../../components/ModerationHistoryList';
import { ArrowLeft, Check, Package, Pencil, Flag, Ban, RotateCcw, History } from 'lucide-react';
import SmartImage from '@/components/SmartImage';
import type { ModerationInput } from '../../ProContext';

type ModalKind = 'refuse' | 'flag' | 'deactivate' | null;
type Tab = 'details' | 'history';

export default function AdminProductDetail({ productId }: { productId: string }) {
  const { allProducts, allShops, navigate, validateProduct, refuseProduct, flagProduct, deactivateProduct, reactivateProduct, updateSellerProduct, getModerationHistory } = usePro();
  const [modal, setModal] = useState<ModalKind>(null);
  const [tab, setTab] = useState<Tab>('details');
  const [validated, setValidated] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<{ name: string; price: string; oldPrice: string; category: string; stock: string; description: string } | null>(null);

  const product = allProducts.find((p) => p.id === productId);
  if (!product) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-ink/55">Produit introuvable</p>
        <button onClick={() => navigate('/admin/produits')} className="btn-outline mt-4">Retour</button>
      </div>
    );
  }

  const shop = allShops.find((s) => s.id === product.shopId);
  const history = getModerationHistory('product', product.id);

  const handleValidate = () => {
    validateProduct(product.id);
    setValidated(true);
  };

  const handleConfirmModal = (input: ModerationInput) => {
    if (modal === 'refuse') refuseProduct(product.id, input);
    if (modal === 'flag') flagProduct(product.id, input);
    if (modal === 'deactivate') deactivateProduct(product.id, input);
    setModal(null);
  };

  const startEdit = () => {
    setEditForm({
      name: product.name,
      price: String(product.price),
      oldPrice: product.oldPrice ? String(product.oldPrice) : '',
      category: product.category,
      stock: String(product.stock),
      description: product.description,
    });
    setEditing(true);
  };

  const saveEdit = () => {
    if (!editForm) return;
    updateSellerProduct(product.id, {
      ...product,
      name: editForm.name.trim(),
      price: parseInt(editForm.price) || product.price,
      oldPrice: editForm.oldPrice ? parseInt(editForm.oldPrice) : undefined,
      category: editForm.category.trim(),
      stock: Math.max(0, parseInt(editForm.stock) || 0),
      description: editForm.description.trim(),
    });
    setEditing(false);
    setEditForm(null);
  };

  const modalConfig: Record<Exclude<ModalKind, null>, { title: string; notice?: string; confirmLabel: string }> = {
    refuse: { title: 'Refuser le produit', confirmLabel: 'Refuser', notice: 'Le produit repassera en attente et le vendeur verra la raison et votre message.' },
    flag: { title: 'Signaler le produit', confirmLabel: 'Signaler', notice: 'Le produit reste visible mais est marqué signalé côté Admin et vendeur.' },
    deactivate: { title: 'Désactiver le produit', confirmLabel: 'Désactiver', notice: 'Le produit ne sera plus visible sur la marketplace. Ses commandes passées restent inchangées.' },
  };

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/admin/produits')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={16} /> Produits
      </button>

      {validated && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 flex items-center gap-2">
          <Check size={18} className="text-green-600" />
          <p className="text-sm font-medium text-green-700">Produit validé et publié</p>
        </div>
      )}

      {/* Product image */}
      <div className="rounded-xl overflow-hidden bg-cream h-64 sm:h-80">
        <SmartImage src={product.image} alt={product.name} className="h-full w-full object-cover" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('details')} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tab === 'details' ? 'bg-burgundy text-white' : 'bg-white border border-line text-ink/60'}`}>
          <Package size={15} /> Détails
        </button>
        <button onClick={() => setTab('history')} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tab === 'history' ? 'bg-burgundy text-white' : 'bg-white border border-line text-ink/60'}`}>
          <History size={15} /> Historique {history.length > 0 && `(${history.length})`}
        </button>
      </div>

      {tab === 'history' && <ModerationHistoryList entries={history} />}

      {tab === 'details' && (
        <>
          {/* Product info */}
          <div className="card p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {!editing ? (
                  <h1 className="font-display text-lg font-semibold text-ink">{product.name}</h1>
                ) : (
                  <input className="input-field font-display text-lg font-semibold" value={editForm?.name ?? ''} onChange={(e) => setEditForm((f) => f && { ...f, name: e.target.value })} />
                )}
                <p className="text-xs text-ink/45 mt-1">{shop?.name ?? product.shopId} · {product.category}</p>
                <p className="mt-1 text-xs font-mono font-medium text-ink/50">Réf. {product.reference}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <StatusChip status={product.status} size="md" />
                {!editing && (
                  <button onClick={startEdit} className="rounded-lg p-1.5 text-ink/40 hover:bg-cream hover:text-ink transition-colors" title="Modifier le produit">
                    <Pencil size={16} />
                  </button>
                )}
              </div>
            </div>

            {!editing ? (
              <p className="text-sm text-ink/60">{product.description}</p>
            ) : (
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Description</label>
                <textarea className="input-field" rows={3} value={editForm?.description ?? ''} onChange={(e) => setEditForm((f) => f && { ...f, description: e.target.value })} />
              </div>
            )}

            {editing && (
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Catégorie</label>
                <input className="input-field" value={editForm?.category ?? ''} onChange={(e) => setEditForm((f) => f && { ...f, category: e.target.value })} />
              </div>
            )}

            <div className="border-t border-line pt-3">
              {!editing ? (
                <>
                  <p className="text-xl font-semibold text-ink">{formatFCFA(product.price)}</p>
                  {product.oldPrice && <p className="text-xs text-ink/35 line-through">{formatFCFA(product.oldPrice)}</p>}
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-ink/60 mb-1.5">Prix (FCFA)</label>
                    <input type="number" className="input-field" value={editForm?.price ?? ''} onChange={(e) => setEditForm((f) => f && { ...f, price: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-ink/60 mb-1.5">Ancien prix (optionnel)</label>
                    <input type="number" className="input-field" value={editForm?.oldPrice ?? ''} onChange={(e) => setEditForm((f) => f && { ...f, oldPrice: e.target.value })} />
                  </div>
                </div>
              )}
            </div>

            {editing && (
              <div className="flex gap-3 pt-1">
                <button onClick={() => { setEditing(false); setEditForm(null); }} className="btn-outline flex-1">Annuler</button>
                <button onClick={saveEdit} className="btn-primary flex-1">Enregistrer</button>
              </div>
            )}
          </div>

          {/* Options */}
          {product.variants.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-ink mb-3">Options</h2>
              <div className="space-y-3">
                {product.variants.map((variant) => (
                  <div key={variant.name}>
                    <p className="text-xs font-medium text-ink/55 mb-1.5">{variant.name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {variant.values.map((v) => (
                        <span key={v} className="rounded-md bg-cream px-2.5 py-1 text-xs text-ink/65">{v}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stock */}
          <div className="card p-4 flex items-center justify-between">
            <span className="text-sm text-ink/55 flex items-center gap-2"><Package size={15} className="text-ink/35" /> Stock</span>
            {!editing ? (
              <span className={`text-sm font-semibold ${product.stock > 0 ? 'text-ink' : 'text-red-500'}`}>{product.stock > 0 ? `${product.stock} en stock` : 'Rupture'}</span>
            ) : (
              <input type="number" className="input-field w-24 text-right" value={editForm?.stock ?? ''} onChange={(e) => setEditForm((f) => f && { ...f, stock: e.target.value })} />
            )}
          </div>

          {/* Latest moderation info */}
          {history.length > 0 && (history[0].reason || history[0].vendorMessage) && (history[0].action === 'refused' || history[0].action === 'flagged' || history[0].action === 'deactivated') && (
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-4 space-y-1">
              {history[0].reason && <p className="text-sm font-medium text-orange-700">Raison : {history[0].reason}</p>}
              {history[0].vendorMessage && <p className="text-xs text-orange-600">Message vendeur : « {history[0].vendorMessage} »</p>}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            {product.status === 'pending' && !validated && (
              <div className="flex gap-3">
                <button onClick={() => setModal('refuse')} className="flex-1 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors">Refuser</button>
                <button onClick={handleValidate} className="btn-primary flex-1">Valider le produit</button>
              </div>
            )}
            {(product.status === 'published' || product.status === 'flagged') && (
              <div className="flex gap-3">
                <button onClick={() => setModal('flag')} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-medium text-orange-600 hover:bg-orange-100 transition-colors">
                  <Flag size={15} /> Signaler
                </button>
                <button onClick={() => setModal('deactivate')} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors">
                  <Ban size={15} /> Désactiver
                </button>
              </div>
            )}
            {(product.status === 'inactive' || product.status === 'changes_requested' || product.status === 'out_of_stock') && (
              <button onClick={() => reactivateProduct(product.id)} className="btn-primary w-full flex items-center justify-center gap-1.5">
                <RotateCcw size={15} /> Réactiver le produit
              </button>
            )}
          </div>
        </>
      )}

      {modal && (
        <ModerationModal
          title={modalConfig[modal].title}
          notice={modalConfig[modal].notice}
          confirmLabel={modalConfig[modal].confirmLabel}
          reasons={productModerationReasons}
          onCancel={() => setModal(null)}
          onConfirm={handleConfirmModal}
        />
      )}
    </div>
  );
}
