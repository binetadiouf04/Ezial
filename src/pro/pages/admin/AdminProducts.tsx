import { useState, useEffect, useCallback } from 'react';
import { fetchAdminProducts, type AdminProductSummary } from '@/lib/supabaseAdminData';
import { formatFCFA } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { Search, Loader2, AlertCircle } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

export default function AdminProducts() {
  const [products, setProducts] = useState<AdminProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setProducts(await fetchAdminProducts());
    } catch {
      setLoadError('Impossible de charger les produits. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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
            filtered.map((product) => (
              <div key={product.id} className="card w-full p-4 flex items-center gap-3">
                {product.imageUrl && <SmartImage src={product.imageUrl} alt="" className="h-14 w-14 rounded-lg object-cover flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{product.name}</p>
                  <p className="text-xs text-ink/45 mt-0.5">{product.shopName}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-sm font-semibold text-ink">{formatFCFA(product.price)}</span>
                    <span className="text-xs text-ink/45">Stock : {product.stock}</span>
                  </div>
                </div>
                <StatusChip status={product.status} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
