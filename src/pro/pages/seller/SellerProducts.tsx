import { usePro } from '../../ProContext';
import { formatFCFA } from '../../data';
import type { ProductStatus } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { Plus, Package, Pencil, AlertTriangle, Power } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

const MAX_ACTIVE = 25;

export default function SellerProducts() {
  const { navigate, sellerProducts, updateSellerProduct } = usePro();
  const shopId = 'maison-fatou';
  const shopProducts = sellerProducts.filter((p) => p.shopId === shopId);

  const activeCount = shopProducts.filter((p) => p.status === 'published').length;

  const handleToggleActive = (productId: string, currentStatus: string) => {
    const product = shopProducts.find((p) => p.id === productId);
    if (!product) return;
    if (currentStatus === 'published') {
      updateSellerProduct(productId, { ...product, status: 'inactive' });
    } else {
      if (currentStatus !== 'published' && activeCount >= MAX_ACTIVE) {
        alert(`Vous avez atteint la limite de ${MAX_ACTIVE} produits actifs. Désactivez un produit pour en activer un nouveau.`);
        return;
      }
      updateSellerProduct(productId, { ...product, status: 'published' });
    }
  };

  const handleStockChange = (productId: string, newStock: number) => {
    const product = shopProducts.find((p) => p.id === productId);
    if (!product) return;
    const stock = Math.max(0, newStock);
    const status: ProductStatus = stock === 0 ? 'out_of_stock' : product.status === 'out_of_stock' ? 'published' : product.status;
    updateSellerProduct(productId, { ...product, stock, status });
  };

  const stockLabel = (stock: number) => {
    if (stock === 0) return <span className="text-xs text-red-600 font-medium">En rupture</span>;
    if (stock < 5) return <span className="text-xs text-amber-600 font-medium">Stock faible — {stock} restants</span>;
    return <span className="text-xs text-ink/45">{stock} en stock</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Produits</h1>
          <p className="mt-1 text-sm text-ink/55">Produits actifs : <span className="font-medium text-ink">{activeCount} / {MAX_ACTIVE}</span></p>
        </div>
        <button onClick={() => navigate('/seller/produits/ajouter')} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Ajouter un produit
        </button>
      </div>

      {/* Product list */}
      <div className="card divide-y divide-line">
        {shopProducts.length === 0 ? (
          <div className="p-10 text-center">
            <Package size={36} className="mx-auto text-ink/20" />
            <p className="mt-3 text-sm text-ink/55">Aucun produit</p>
          </div>
        ) : (
          shopProducts.map((product) => (
            <div key={product.id} className="flex items-center gap-3 p-4">
              <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-cream">
                {product.image ? (
                  <SmartImage src={product.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-ink/20"><Package size={20} /></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink leading-snug line-clamp-1">{product.name}</p>
                <p className="text-xs text-ink/40 mt-0.5">{product.category} · Réf. {product.reference}</p>
                <div className="mt-1 flex items-center gap-2">
                  <StatusChip status={product.status} />
                  {stockLabel(product.stock)}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-ink">{formatFCFA(product.price)}</p>
                <div className="mt-1 flex items-center gap-1 justify-end">
                  {(product.status === 'published' || product.status === 'inactive') && (
                    <button
                      onClick={() => handleToggleActive(product.id, product.status)}
                      title={product.status === 'published' ? 'Désactiver' : 'Activer'}
                      className={`rounded-lg p-1.5 transition-colors ${product.status === 'published' ? 'text-green-600 hover:bg-green-50' : 'text-ink/35 hover:bg-cream hover:text-ink'}`}
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
          ))
        )}
      </div>

      {/* Stock management section */}
      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">Gestion du stock</h2>
        <div className="card divide-y divide-line">
          {shopProducts.map((product) => (
            <div key={product.id} className="flex items-center gap-3 p-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink line-clamp-1">{product.name}</p>
                {product.stock === 0 && <span className="text-xs text-red-600 font-medium">En rupture</span>}
                {product.stock > 0 && product.stock < 5 && <span className="text-xs text-amber-600 font-medium flex items-center gap-1"><AlertTriangle size={11} /> Stock faible — {product.stock} restants</span>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => handleStockChange(product.id, product.stock - 1)} className="h-8 w-8 rounded-lg border border-line text-ink/60 hover:bg-cream transition-colors">−</button>
                <span className="w-10 text-center text-sm font-medium text-ink">{product.stock}</span>
                <button onClick={() => handleStockChange(product.id, product.stock + 1)} className="h-8 w-8 rounded-lg border border-line text-ink/60 hover:bg-cream transition-colors">+</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
