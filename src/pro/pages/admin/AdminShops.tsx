import { useState } from 'react';
import { usePro } from '../../ProContext';
import { formatFCFA } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { Search, Plus, X, Store, Check } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

export default function AdminShops() {
  const { allShops, navigate, createShop } = usePro();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [createdShop, setCreatedShop] = useState<{ name: string; sellerId: string } | null>(null);

  // Form state
  const [form, setForm] = useState({ name: '', ownerFirstName: '', ownerLastName: '', phone: '', address: '', description: '' });

  const filtered = allShops.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.sellerId.toLowerCase().includes(q);
  });

  const handleCreate = () => {
    if (!form.name.trim() || !form.ownerFirstName.trim() || !form.phone.trim()) return;
    const shop = createShop(form);
    setCreatedShop({ name: shop.name, sellerId: shop.sellerId });
    setForm({ name: '', ownerFirstName: '', ownerLastName: '', phone: '', address: '', description: '' });
    setShowAdd(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">Boutiques</h1>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={16} /> <span className="hidden sm:inline">Ajouter une boutique</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
        <input className="input-field pl-9" placeholder="Rechercher une boutique" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Shop list */}
      <div className="space-y-3">
        {filtered.map((shop) => (
          <button key={shop.id} onClick={() => navigate(`/admin/boutiques/${shop.id}`)} className="card w-full p-4 flex items-center gap-3 text-left hover:card-shadow transition-all">
            <SmartImage src={shop.logo} alt="" className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink truncate">{shop.name}</p>
              <p className="text-xs text-ink/45 font-mono mt-0.5">{shop.sellerId}</p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-xs text-ink/45">{shop.productCount} produits</span>
                <span className="text-xs text-ink/45">{shop.orderCount} commandes</span>
              </div>
            </div>
            <StatusChip status={shop.status} size="md" />
          </button>
        ))}
      </div>

      {/* Creation success */}
      {createdShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setCreatedShop(null)}>
          <div className="card max-w-sm w-full p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto h-14 w-14 rounded-full bg-green-50 flex items-center justify-center">
              <Check size={28} className="text-green-600" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-ink">Boutique créée</h3>
            <p className="mt-1 text-sm text-ink/55">{createdShop.name}</p>
            <div className="mt-4 rounded-lg bg-cream p-3">
              <p className="text-xs text-ink/45">Identifiant vendeur</p>
              <p className="font-mono text-sm font-semibold text-burgundy mt-0.5">{createdShop.sellerId}</p>
            </div>
            <button onClick={() => setCreatedShop(null)} className="btn-primary w-full mt-5">Fermer</button>
          </div>
        </div>
      )}

      {/* Add shop modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setShowAdd(false)}>
          <div className="card max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-semibold text-ink">Nouvelle boutique</h3>
              <button onClick={() => setShowAdd(false)}><X size={18} className="text-ink/40" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Nom de la boutique</label>
                <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-ink/60 mb-1.5">Prénom du responsable</label>
                  <input className="input-field" value={form.ownerFirstName} onChange={(e) => setForm({ ...form, ownerFirstName: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink/60 mb-1.5">Nom du responsable</label>
                  <input className="input-field" value={form.ownerLastName} onChange={(e) => setForm({ ...form, ownerLastName: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Téléphone</label>
                <input className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+221 ..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Adresse / quartier</label>
                <input className="input-field" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Description</label>
                <textarea className="input-field" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <button onClick={handleCreate} disabled={!form.name.trim() || !form.ownerFirstName.trim() || !form.phone.trim()} className="btn-primary w-full mt-5 disabled:opacity-40">Créer la boutique</button>
          </div>
        </div>
      )}
    </div>
  );
}
