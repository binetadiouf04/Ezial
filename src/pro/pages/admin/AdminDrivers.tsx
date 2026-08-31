import { useState } from 'react';
import { usePro } from '../../ProContext';
import { formatFCFA } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { Search, Plus, X, Check, User } from 'lucide-react';

export default function AdminDrivers() {
  const { allDrivers, missions, navigate, createDriver } = usePro();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [createdDriver, setCreatedDriver] = useState<{ name: string; identifier: string } | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' });

  const filtered = allDrivers.filter((d) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return d.name.toLowerCase().includes(q) || d.identifier.toLowerCase().includes(q);
  });

  const handleCreate = () => {
    if (!form.firstName.trim() || !form.phone.trim()) return;
    const driver = createDriver(form);
    setCreatedDriver({ name: driver.name, identifier: driver.identifier });
    setForm({ firstName: '', lastName: '', phone: '' });
    setShowAdd(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">Livreurs</h1>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={16} /> <span className="hidden sm:inline">Ajouter un livreur</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
        <input className="input-field pl-9" placeholder="Rechercher (nom, identifiant)" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.map((driver) => {
          const currentMission = missions.find((m) => m.driverId === driver.id && m.step !== 'delivered');
          return (
            <button key={driver.id} onClick={() => navigate(`/admin/livreurs/${driver.id}`)} className="card w-full p-4 flex items-center gap-3 text-left hover:card-shadow transition-all">
              <div className="h-12 w-12 rounded-full bg-burgundy/10 flex items-center justify-center flex-shrink-0">
                <User size={20} className="text-burgundy" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink">{driver.name}</p>
                <p className="text-xs text-ink/45 font-mono mt-0.5">{driver.identifier}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-xs text-ink/45">{driver.weeklyDeliveries} livraisons / semaine</span>
                  {currentMission && <span className="text-xs text-violet-600 font-medium">En mission</span>}
                </div>
              </div>
              <StatusChip status={driver.status} size="md" />
            </button>
          );
        })}
      </div>

      {/* Creation success */}
      {createdDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setCreatedDriver(null)}>
          <div className="card max-w-sm w-full p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto h-14 w-14 rounded-full bg-green-50 flex items-center justify-center">
              <Check size={28} className="text-green-600" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-ink">Livreur ajouté</h3>
            <p className="mt-1 text-sm text-ink/55">{createdDriver.name}</p>
            <div className="mt-4 rounded-lg bg-cream p-3">
              <p className="text-xs text-ink/45">Identifiant</p>
              <p className="font-mono text-sm font-semibold text-burgundy mt-0.5">{createdDriver.identifier}</p>
            </div>
            <button onClick={() => setCreatedDriver(null)} className="btn-primary w-full mt-5">Fermer</button>
          </div>
        </div>
      )}

      {/* Add driver modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setShowAdd(false)}>
          <div className="card max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-semibold text-ink">Nouveau livreur</h3>
              <button onClick={() => setShowAdd(false)}><X size={18} className="text-ink/40" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-ink/60 mb-1.5">Prénom</label>
                  <input className="input-field" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink/60 mb-1.5">Nom</label>
                  <input className="input-field" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Téléphone</label>
                <input className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+221 ..." />
              </div>
            </div>
            <button onClick={handleCreate} disabled={!form.firstName.trim() || !form.phone.trim()} className="btn-primary w-full mt-5 disabled:opacity-40">Ajouter le livreur</button>
          </div>
        </div>
      )}
    </div>
  );
}
