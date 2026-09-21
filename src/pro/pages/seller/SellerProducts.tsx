import { useEffect, useState } from 'react';
import { usePro } from '../../ProContext';
import { formatFCFA } from '../../data';
import { categoryMap, type CategoryId } from '@/data/categories';
import { StatusChip } from '../../components/StatusChip';
import { Plus, Package, Pencil, Power, Flag } from 'lucide-react';
import SmartImage from '@/components/SmartImage';
import {
  fetchSellerProducts,
  setSellerProductStatus,
  type SellerProductSummary,
} from '@/lib/supabaseSellerProducts';
import { fetchModerationFlagsForTargets, latestUnresolvedFlag, type ModerationFlagRow } from '@/lib/supabaseModeration';

const MAX_ACTIVE = 25;

export default function SellerProducts() {
  const { navigate, sellerSupabaseShopId, sellerShopIsOfficial } = usePro();
  const [products, setProducts] = useState<SellerProductSummary[]>([]);
  const [flagsByProduct, setFlagsByProduct] = useState<Map<string, ModerationFlagRow[]>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState('');

  // Always the real products for the signed-in seller's real Supabase shop —
  // never the local mock sellerProducts array, which a fresh Supabase
  // product never gets added to on page reload.
  useEffect(() => {
    if (!sellerSupabaseShopId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    fetchSellerProducts(sellerSupabaseShopId).then(async (rows) => {
      if (cancelled) return;
      setProducts(rows);
      setFlagsByProduct(await fetchModerationFlagsForTargets('product', rows.map((p) => p.id)));
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [sellerSupabaseShopId]);

  const activeCount = products.filter((p) => p.status === 'active').length;

  const handleToggleActive = async (product: SellerProductSummary) => {
    setActionError('');
    const nextStatus = product.status === 'active' ? 'disabled' : 'active';
    if (!sellerShopIsOfficial && nextStatus === 'active' && activeCount >= MAX_ACTIVE) {
      alert(`Vous avez atteint la limite de ${MAX_ACTIVE} produits actifs. Désactivez un produit pour en activer un nouveau.`);
      return;
    }
    const result = await setSellerProductStatus(product.id, nextStatus);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, status: nextStatus } : p)));
  };

  const categoryLabel = (category: string) => categoryMap[category as CategoryId]?.label ?? category;

  const stockLabel = (stock: number) => {
    if (stock === 0) return <span className="text-xs text-red-600 font-medium">En rupture</span>;
    if (stock < 5) return <span className="text-xs text-amber-600 font-medium">Stock faible — {stock} restants</span>;
    return <span className="text-xs text-ink/45">{stock} en stock</span>;
  };

  if (!sellerSupabaseShopId) {
    return (
      <div className="card p-10 text-center">
        <Package size={36} className="mx-auto text-ink/20" />
        <p className="mt-3 text-sm text-ink/55">Votre compte vendeur n'est relié à aucune boutique Supabase réelle. Contactez EZIAL.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Produits</h1>
          <p className="mt-1 text-sm text-ink/55">Produits actifs : <span className="font-medium text-ink">{sellerShopIsOfficial ? activeCount : `${activeCount} / ${MAX_ACTIVE}`}</span></p>
        </div>
        <button onClick={() => navigate('/seller/produits/ajouter')} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Ajouter un produit
        </button>
      </div>

      {actionError && <p className="rounded-lg bg-burgundy/5 px-4 py-3 text-sm text-burgundy">{actionError}</p>}

      {/* Product list */}
      <div className="card divide-y divide-line">
        {isLoading ? (
          <div className="p-10 text-center"><p className="text-sm text-ink/50">Chargement…</p></div>
        ) : products.length === 0 ? (
          <div className="p-10 text-center">
            <Package size={36} className="mx-auto text-ink/20" />
            <p className="mt-3 text-sm text-ink/55">Aucun produit</p>
          </div>
        ) : (
          products.map((product) => {
            const activeFlag = latestUnresolvedFlag(flagsByProduct.get(product.id) ?? []);
            return (
            <div key={product.id} className="flex items-center gap-3 p-4">
              <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-cream">
                {product.imageUrl ? (
                  <SmartImage src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-ink/20"><Package size={20} /></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink leading-snug line-clamp-1">{product.name}</p>
                <p className="text-xs text-ink/40 mt-0.5">{categoryLabel(product.category)} · Réf. {product.reference}</p>
                <div className="mt-1 flex items-center gap-2">
                  <StatusChip status={product.status} />
                  {stockLabel(product.stock)}
                </div>
                {activeFlag && (
                  <p className="mt-1.5 flex items-start gap-1 text-xs text-orange-700"><Flag size={11} className="mt-0.5 flex-shrink-0" /> « {activeFlag.note} »</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-ink">{formatFCFA(product.price)}</p>
                <div className="mt-1 flex items-center gap-1 justify-end">
                  {(product.status === 'active' || product.status === 'disabled') && (
                    <button
                      onClick={() => handleToggleActive(product)}
                      title={product.status === 'active' ? 'Désactiver' : 'Activer'}
                      className={`rounded-lg p-1.5 transition-colors ${product.status === 'active' ? 'text-green-600 hover:bg-green-50' : 'text-ink/35 hover:bg-cream hover:text-ink'}`}
                    >
                      <Power size={15} />
                    </button>
                  )}
                  <button onClick={() => navigate(`/seller/produits/modifier/${product.id}`)} className="rounded-lg p-1.5 text-ink/40 hover:bg-cream hover:text-ink transition-colors">
                    <Pencil size={15} />
                  </button>
                </div>
              </div>
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
