import { useState } from 'react';
import { usePro } from '../../ProContext';
import { formatFCFA, formatDate } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { Search, ChevronRight } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

type Tab = 'active' | 'flagged' | 'inactive';

// A product that is still pending validation or was refused isn't visible on
// the marketplace — it's grouped under "Actifs" for now since Admin no
// longer surfaces a separate validation queue, without losing the product.
const isActiveTab = (status: string) => status === 'published' || status === 'out_of_stock' || status === 'pending' || status === 'changes_requested';

export default function AdminProducts() {
  const { allProducts, allShops, navigate } = usePro();
  const [tab, setTab] = useState<Tab>('active');
  const [search, setSearch] = useState('');

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'active', label: 'Actifs', count: allProducts.filter((p) => isActiveTab(p.status)).length },
    { id: 'flagged', label: 'Signalés', count: allProducts.filter((p) => p.status === 'flagged').length },
    { id: 'inactive', label: 'Désactivés', count: allProducts.filter((p) => p.status === 'inactive').length },
  ];

  const filtered = allProducts.filter((p) => {
    if (tab === 'active') return isActiveTab(p.status);
    if (tab === 'flagged') return p.status === 'flagged';
    if (tab === 'inactive') return p.status === 'inactive';
    return true;
  }).filter((p) => {
    if (!search.trim()) return true;
    return p.name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-ink">Produits</h1>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
        <input className="input-field pl-9" placeholder="Rechercher un produit" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex-shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === t.id ? 'bg-burgundy text-white' : 'bg-white border border-line text-ink/60'}`}>
            {t.label} {t.count > 0 && `(${t.count})`}
          </button>
        ))}
      </div>

      {/* Product list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-ink/45">Aucun produit à valider.</p>
          </div>
        ) : (
          filtered.map((product) => {
            const shop = allShops.find((s) => s.id === product.shopId);
            return (
              <button key={product.id} onClick={() => navigate(`/admin/produits/${product.id}`)} className="card w-full p-4 flex items-center gap-3 text-left hover:card-shadow transition-all">
                <SmartImage src={product.image} alt="" className="h-14 w-14 rounded-lg object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{product.name}</p>
                  <p className="text-xs text-ink/45 mt-0.5">{shop?.name ?? product.shopId} · {product.category} · Réf. {product.reference}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-sm font-semibold text-ink">{formatFCFA(product.price)}</span>
                    {product.submittedDate && <span className="text-xs text-ink/35">· {formatDate(product.submittedDate)}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <StatusChip status={product.status} />
                  <ChevronRight size={16} className="text-ink/20" />
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
