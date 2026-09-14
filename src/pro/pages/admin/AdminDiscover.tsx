import { useEffect, useState } from 'react';
import { Image as ImageIcon, Pencil, Trash2, Plus, Eye, EyeOff, ArrowUp, ArrowDown } from 'lucide-react';
import SmartImage from '@/components/SmartImage';
import {
  fetchAllDiscoverTilesForAdmin,
  createDiscoverTile,
  updateDiscoverTile,
  deleteDiscoverTile,
  uploadSiteContentImage,
  type DiscoverTileRow,
  type DiscoverTileInput,
} from '@/lib/supabaseHomeContent';

const emptyForm: DiscoverTileInput = { imageUrl: '', label: '', link: '', sortOrder: 0, isActive: true };

export default function AdminDiscover() {
  const [rows, setRows] = useState<DiscoverTileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DiscoverTileInput>(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { rows: fetched, error } = await fetchAllDiscoverTilesForAdmin();
    setLoading(false);
    if (error) { setLoadError(error); return; }
    setLoadError('');
    setRows(fetched);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    const maxOrder = rows.reduce((max, r) => Math.max(max, r.sort_order), -1);
    setForm({ ...emptyForm, sortOrder: maxOrder + 1 });
    setEditingId(null);
    setSaveError('');
    setShowForm(true);
  };

  const openEdit = (row: DiscoverTileRow) => {
    setForm({ imageUrl: row.image_url, label: row.label, link: row.link, sortOrder: row.sort_order, isActive: row.is_active });
    setEditingId(row.id);
    setSaveError('');
    setShowForm(true);
  };

  const handleFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setUploading(true);
    const result = await uploadSiteContentImage(file, 'discover');
    setUploading(false);
    if ('error' in result) { setSaveError(result.error); return; }
    setForm((f) => ({ ...f, imageUrl: result.url }));
  };

  const handleSave = async () => {
    if (!form.imageUrl.trim()) { setSaveError('Ajoutez une image.'); return; }
    if (!form.label.trim()) { setSaveError('Le libellé est obligatoire.'); return; }
    if (!form.link.trim()) { setSaveError('Le lien / catégorie cible est obligatoire.'); return; }
    setSaving(true);
    const result = editingId ? await updateDiscoverTile(editingId, form) : await createDiscoverTile(form);
    setSaving(false);
    if (result.error) { setSaveError(result.error); return; }
    setShowForm(false);
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer cet élément ?')) return;
    const result = await deleteDiscoverTile(id);
    if (result.error) { setLoadError(result.error); return; }
    await load();
  };

  const move = async (row: DiscoverTileRow, direction: -1 | 1) => {
    const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((r) => r.id === row.id);
    const swapWith = sorted[idx + direction];
    if (!swapWith) return;
    await Promise.all([
      updateDiscoverTile(row.id, { ...rowToInput(row), sortOrder: swapWith.sort_order }),
      updateDiscoverTile(swapWith.id, { ...rowToInput(swapWith), sortOrder: row.sort_order }),
    ]);
    await load();
  };

  const toggleActive = async (row: DiscoverTileRow) => {
    await updateDiscoverTile(row.id, { ...rowToInput(row), isActive: !row.is_active });
    await load();
  };

  const sortedRows = [...rows].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">À découvrir de la Home</h1>
          <p className="mt-1 text-sm text-ink/55">Gérez les raccourcis catégories affichés sur la page d'accueil.</p>
        </div>
        <button onClick={openNew} className="btn-primary flex items-center gap-1.5"><Plus size={16} /> Ajouter un élément</button>
      </div>

      {loadError && <p className="rounded-lg bg-burgundy/5 px-4 py-3 text-sm text-burgundy">{loadError.includes('does not exist') ? "La table home_discover_tiles n'existe pas encore — exécutez la migration SQL fournie." : loadError}</p>}

      {loading ? (
        <p className="text-sm text-ink/50">Chargement…</p>
      ) : sortedRows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink/50">Aucun élément pour l'instant. La Home affiche sa sélection de catégories par défaut.</div>
      ) : (
        <div className="space-y-3">
          {sortedRows.map((row, i) => (
            <div key={row.id} className="card flex items-center gap-4 p-4">
              <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full bg-cream">
                {row.image_url ? <SmartImage src={row.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-ink/25"><ImageIcon size={18} /></div>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{row.label}</p>
                <p className="truncate text-xs text-ink/40">{row.link}</p>
              </div>
              <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${row.is_active ? 'bg-green-50 text-green-700' : 'bg-cream text-ink/50'}`}>{row.is_active ? 'Actif' : 'Inactif'}</span>
              <div className="flex flex-shrink-0 items-center gap-1">
                <button onClick={() => move(row, -1)} disabled={i === 0} className="rounded-lg p-2 text-ink/40 hover:text-ink disabled:opacity-25" aria-label="Monter"><ArrowUp size={16} /></button>
                <button onClick={() => move(row, 1)} disabled={i === sortedRows.length - 1} className="rounded-lg p-2 text-ink/40 hover:text-ink disabled:opacity-25" aria-label="Descendre"><ArrowDown size={16} /></button>
                <button onClick={() => toggleActive(row)} className="rounded-lg p-2 text-ink/40 hover:text-ink" aria-label={row.is_active ? 'Désactiver' : 'Activer'}>{row.is_active ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                <button onClick={() => openEdit(row)} className="rounded-lg p-2 text-ink/40 hover:text-burgundy" aria-label="Modifier"><Pencil size={16} /></button>
                <button onClick={() => handleDelete(row.id)} className="rounded-lg p-2 text-ink/40 hover:text-burgundy" aria-label="Supprimer"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onClick={() => setShowForm(false)}>
          <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-semibold text-ink">{editingId ? "Modifier l'élément" : 'Nouvel élément'}</h2>
            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Image (ronde)</label>
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-full border border-line bg-cream">
                    {form.imageUrl ? <SmartImage src={form.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-ink/25"><ImageIcon size={18} /></div>}
                  </div>
                  <label className="btn-outline cursor-pointer text-sm">
                    {uploading ? 'Envoi…' : form.imageUrl ? "Changer l'image" : 'Ajouter une image'}
                    <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => handleFile(e.target.files)} />
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Libellé</label>
                <input className="input-field" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Lien / catégorie cible</label>
                <input className="input-field" placeholder="/categorie/beaute/maquillage" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-medium text-ink/60 mb-1.5">Ordre</label>
                  <input type="number" className="input-field w-24" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} />
                </div>
                <label className="flex items-center gap-2.5">
                  <button type="button" onClick={() => setForm({ ...form, isActive: !form.isActive })} className={`relative h-6 w-11 rounded-full transition-colors ${form.isActive ? 'bg-burgundy' : 'bg-ink/15'}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${form.isActive ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                  <span className="text-sm text-ink/70">{form.isActive ? 'Actif' : 'Inactif'}</span>
                </label>
              </div>
              {saveError && <p className="text-sm text-burgundy">{saveError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-outline flex-1">Annuler</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function rowToInput(row: DiscoverTileRow): DiscoverTileInput {
  return { imageUrl: row.image_url, label: row.label, link: row.link, sortOrder: row.sort_order, isActive: row.is_active };
}
