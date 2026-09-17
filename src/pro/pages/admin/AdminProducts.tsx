import { useState, useEffect, useCallback } from 'react';
import { fetchAdminProducts, type AdminProductSummary } from '@/lib/supabaseAdminData';
import { formatFCFA, productModerationReasons } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import FlagModal from '../../components/FlagModal';
import { createModerationFlag, fetchModerationFlagsForTargets, latestUnresolvedFlag, type ModerationFlagRow } from '@/lib/supabaseModeration';
import { Search, Loader2, AlertCircle, Flag } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

export default function AdminProducts() {
  const [products, setProducts] = useState<AdminProductSummary[]>([]);
  const [flagsByProduct, setFlagsByProduct] = useState<Map<string, ModerationFlagRow[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [flaggingProductId, setFlaggingProductId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const rows = await fetchAdminProducts();
      setProducts(rows);
      setFlagsByProduct(await fetchModerationFlagsForTargets('product', rows.map((p) => p.id)));
    } catch {
      setLoadError('Impossible de charger les produits. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleFlag = async (note: string) => {
    if (!flaggingProductId) return;
    const result = await createModerationFlag('product', flaggingProductId, note);
    if (!result.error) {
      setFlaggingProductId(null);
      await load();
    }
  };

  const filtered = products.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.shopName.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-ink">Produits</h1>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
        <input className="input-field pl-9" placeholder="Rechercher un produit ou une boutique" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loadError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}
        </p>
      )}

      {loading ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="card p-8 text-center"><p className="text-sm text-ink/45">Aucun produit trouvé.</p></div>
          ) : (
            filtered.map((product) => {
              const activeFlag = latestUnresolvedFlag(flagsByProduct.get(product.id) ?? []);
              return (
                <div key={product.id} className="card w-full p-4 space-y-2">
                  <div className="flex items-center gap-3">
                    {product.imageUrl && <SmartImage src={product.imageUrl} alt="" className="h-14 w-14 rounded-lg object-cover flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{product.name}</p>
                      <p className="text-xs text-ink/45 mt-0.5">{product.shopName}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-sm font-semibold text-ink">{formatFCFA(product.price)}</span>
                        <span className="text-xs text-ink/45">Stock : {product.stock}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <StatusChip status={product.status} />
                      <button onClick={() => setFlaggingProductId(product.id)} className="text-ink/35 hover:text-burgundy transition-colors" title="Signaler ce produit">
                        <Flag size={15} />
                      </button>
                    </div>
                  </div>
                  {activeFlag && (
                    <p className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2 text-xs text-orange-700 flex items-center gap-1.5">
                      <Flag size={12} className="flex-shrink-0" /> « {activeFlag.note} »
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {flaggingProductId && (
        <FlagModal title="Signaler ce produit" quickReasons={productModerationReasons} onCancel={() => setFlaggingProductId(null)} onConfirm={handleFlag} />
      )}
    </div>
  );
}
