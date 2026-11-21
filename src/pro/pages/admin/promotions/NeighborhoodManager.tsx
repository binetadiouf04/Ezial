import { useState } from 'react';
import { Loader2, Pencil, Plus, Check, X } from 'lucide-react';
import { saveDeliveryNeighborhood, type DeliveryNeighborhood } from '@/lib/supabaseAdminPromotions';

// Petit gestionnaire des quartiers de livraison (région de Dakar) :
// ajouter, renommer, activer / désactiver, via admin_neighborhood_save.
// Aucun quartier n'est supprimé : un quartier désactivé reste lié aux
// campagnes et commandes passées.
export default function NeighborhoodManager({ neighborhoods, onChanged }: { neighborhoods: DeliveryNeighborhood[]; onChanged: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [newName, setNewName] = useState('');
  const [newDepartment, setNewDepartment] = useState('');

  const save = async (key: string, n: Parameters<typeof saveDeliveryNeighborhood>[0]) => {
    if (!n.name.trim()) { setError('Le nom du quartier est obligatoire.'); return false; }
    setBusyId(key);
    setError('');
    const res = await saveDeliveryNeighborhood(n);
    setBusyId(null);
    if (res.error) { setError(res.error); return false; }
    onChanged();
    return true;
  };

  const add = async () => {
    const nextOrder = neighborhoods.reduce((m, n) => Math.max(m, n.sortOrder), 0) + 1;
    if (await save('new', { name: newName, department: newDepartment || null, isActive: true, sortOrder: nextOrder })) {
      setNewName('');
      setNewDepartment('');
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-line bg-cream/40 p-3">
      <p className="text-xs font-semibold text-ink">Gérer les quartiers</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input className="input-field py-2" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nouveau quartier" aria-label="Nom du nouveau quartier" />
        <input className="input-field py-2" value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)} placeholder="Département (facultatif)" aria-label="Département" />
        <button type="button" onClick={() => void add()} disabled={busyId !== null || !newName.trim()} className="btn-outline px-4 py-2">
          {busyId === 'new' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Ajouter
        </button>
      </div>
      {error && <p className="text-xs text-burgundy" role="alert">{error}</p>}
      <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-white">
        {neighborhoods.length === 0 && <li className="p-3 text-xs text-ink/45">Aucun quartier.</li>}
        {neighborhoods.map((n) => (
          <li key={n.id} className="flex items-center gap-2 px-3 py-2">
            {editingId === n.id ? (
              <>
                <input className="input-field flex-1 py-1.5" value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="Nouveau nom" autoFocus />
                <button type="button" aria-label="Enregistrer le nom" disabled={busyId !== null} onClick={() => void save(n.id, { ...n, name: editName }).then((ok) => { if (ok) setEditingId(null); })} className="flex h-8 w-8 items-center justify-center rounded-full text-burgundy hover:bg-cream">
                  {busyId === n.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />}
                </button>
                <button type="button" aria-label="Annuler" onClick={() => setEditingId(null)} className="flex h-8 w-8 items-center justify-center rounded-full text-ink/40 hover:bg-cream"><X size={15} /></button>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm ${n.isActive ? 'text-ink' : 'text-ink/40 line-through'}`}>{n.name}</p>
                  {n.department && <p className="truncate text-[11px] text-ink/45">{n.department}</p>}
                </div>
                <button type="button" aria-label={`Renommer ${n.name}`} onClick={() => { setEditingId(n.id); setEditName(n.name); setError(''); }} className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-ink/40 hover:bg-cream"><Pencil size={13} /></button>
                <button
                  type="button"
                  disabled={busyId !== null}
                  aria-label={n.isActive ? `Désactiver ${n.name}` : `Activer ${n.name}`}
                  title={n.isActive ? 'Toucher pour désactiver' : 'Toucher pour activer'}
                  onClick={() => void save(n.id, { ...n, isActive: !n.isActive })}
                  className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${n.isActive ? 'border-green-100 bg-green-50 text-green-700' : 'border-line bg-ink/5 text-ink/50'}`}
                >
                  {busyId === n.id ? <Loader2 size={12} className="animate-spin" /> : n.isActive ? 'Actif' : 'Désactivé'}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
