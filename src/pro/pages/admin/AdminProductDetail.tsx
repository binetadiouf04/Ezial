import { useState } from 'react';
import { usePro } from '../../ProContext';
import { formatFCFA } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { ArrowLeft, Check, X, Package } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

const refusalReasons = [
  'Photos insuffisantes',
  'Description incomplète',
  'Mauvaise catégorie',
  'Informations incorrectes',
  'Produit non conforme',
  'Autre',
];

export default function AdminProductDetail({ productId }: { productId: string }) {
  const { allProducts, allShops, navigate, validateProduct, refuseProduct, productRefusals } = usePro();
  const [showRefuse, setShowRefuse] = useState(false);
  const [refusalReason, setRefusalReason] = useState('');
  const [refusalComment, setRefusalComment] = useState('');
  const [validated, setValidated] = useState(false);

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
  const refusal = productRefusals[product.id];

  const handleValidate = () => {
    validateProduct(product.id);
    setValidated(true);
  };

  const handleConfirmRefusal = () => {
    if (!refusalReason) return;
    refuseProduct(product.id, refusalReason, refusalComment || undefined);
    setShowRefuse(false);
    navigate('/admin/produits');
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

      {/* Product info */}
      <div className="card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-lg font-semibold text-ink">{product.name}</h1>
            <p className="text-xs text-ink/45 mt-1">{shop?.name ?? product.shopId} · {product.category}</p>
          </div>
          <StatusChip status={product.status} size="md" />
        </div>
        <p className="text-sm text-ink/60">{product.description}</p>
        <div className="border-t border-line pt-3">
          <p className="text-xl font-semibold text-ink">{formatFCFA(product.price)}</p>
          {product.oldPrice && <p className="text-xs text-ink/35 line-through">{formatFCFA(product.oldPrice)}</p>}
        </div>
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
        <span className={`text-sm font-semibold ${product.stock > 0 ? 'text-ink' : 'text-red-500'}`}>{product.stock > 0 ? `${product.stock} en stock` : 'Rupture'}</span>
      </div>

      {/* Refusal info */}
      {refusal && (
        <div className="rounded-lg bg-orange-50 border border-orange-200 p-4">
          <p className="text-sm font-medium text-orange-700">Refusé : {refusal.reason}</p>
          {refusal.comment && <p className="text-xs text-orange-600 mt-1">{refusal.comment}</p>}
        </div>
      )}

      {/* Actions */}
      {product.status === 'pending' && !validated && (
        <div className="flex gap-3">
          <button onClick={() => setShowRefuse(true)} className="flex-1 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors">Refuser</button>
          <button onClick={handleValidate} className="btn-primary flex-1">Valider le produit</button>
        </div>
      )}

      {/* Refusal modal */}
      {showRefuse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setShowRefuse(false)}>
          <div className="card max-w-sm w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-semibold text-ink">Refuser le produit</h3>
              <button onClick={() => setShowRefuse(false)}><X size={18} className="text-ink/40" /></button>
            </div>
            <div className="space-y-2 mb-4">
              {refusalReasons.map((reason) => (
                <button key={reason} onClick={() => setRefusalReason(reason)} className={`w-full rounded-lg p-3 text-left text-sm font-medium transition-all border ${refusalReason === reason ? 'bg-burgundy/5 border-burgundy text-burgundy' : 'bg-white border-line text-ink/70 hover:border-ink/20'}`}>
                  {reason}
                </button>
              ))}
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Commentaire (optionnel)</label>
              <textarea className="input-field" rows={2} value={refusalComment} onChange={(e) => setRefusalComment(e.target.value)} placeholder="Ajouter un détail..." />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowRefuse(false)} className="btn-outline flex-1">Retour</button>
              <button onClick={handleConfirmRefusal} disabled={!refusalReason} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-40">Confirmer le refus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
