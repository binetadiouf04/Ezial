import { useEffect, useState } from 'react';
import { Image as ImageIcon, Pencil, Trash2, Plus } from 'lucide-react';
import SmartImage from '@/components/SmartImage';
import {
  fetchAllHeroSlidesForAdmin,
  createHeroSlide,
  updateHeroSlide,
  deleteHeroSlide,
  fetchAllDiscoverTilesForAdmin,
  createDiscoverTile,
  updateDiscoverTile,
  deleteDiscoverTile,
  uploadSiteContentImage,
  type HeroSlideRow,
  type HeroSlideInput,
  type DiscoverTileRow,
  type DiscoverTileInput,
} from '@/lib/supabaseHomeContent';

// Both blocks below support several images (a carousel on Home for the
// hero, several category shortcuts for "à découvrir") — admins add/edit/
// remove entries whenever they like. No reorder or active/inactive toggle:
// a new entry always goes to the end and is shown immediately; removing an
// entry is how you take it off the Home.

const emptyHero: HeroSlideInput = { imageUrl: '', title: '', subtitle: '', ctaLabel: '', ctaLink: '', sortOrder: 0, isActive: true };

function heroRowToInput(row: HeroSlideRow): HeroSlideInput {
  return {
    imageUrl: row.image_url,
    title: row.title,
    subtitle: row.subtitle ?? '',
    ctaLabel: row.cta_label,
    ctaLink: row.cta_link,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

function HeroSlides() {
  const [rows, setRows] = useState<HeroSlideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<HeroSlideInput>(emptyHero);
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { rows: fetched, error } = await fetchAllHeroSlidesForAdmin();
    setLoading(false);
    if (error) { setLoadError(error); return; }
    setLoadError('');
    setRows(fetched);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setForm({ ...emptyHero, sortOrder: rows.length });
    setEditingId(null);
    setSaveError('');
    setShowForm(true);
  };

  const openEdit = (row: HeroSlideRow) => {
    setForm(heroRowToInput(row));
    setEditingId(row.id);
    setSaveError('');
    setShowForm(true);
  };

  const handleFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setUploading(true);
    const result = await uploadSiteContentImage(file, 'hero');
    setUploading(false);
    if ('error' in result) { setSaveError(result.error); return; }
    setForm((f) => ({ ...f, imageUrl: result.url }));
  };

  const handleSave = async () => {
    if (!form.imageUrl.trim()) { setSaveError('Ajoutez une image.'); return; }
    if (!form.title.trim()) { setSaveError('Le titre est obligatoire.'); return; }
    if (!form.ctaLabel.trim() || !form.ctaLink.trim()) { setSaveError('Le texte et le lien du bouton sont obligatoires.'); return; }
    setSaveError('');
    setSaving(true);
    const result = editingId ? await updateHeroSlide(editingId, form) : await createHeroSlide(form);
    setSaving(false);
    if (result.error) { setSaveError(result.error); return; }
    setShowForm(false);
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer cette image du hero ?')) return;
    const result = await deleteHeroSlide(id);
    if (result.error) { setLoadError(result.error); return; }
    await load();
  };

  return (
    <div className="card p-5 space-y-4">
      {loadError && <p className="rounded-lg bg-burgundy/5 px-4 py-3 text-sm text-burgundy">{loadError.includes('does not exist') ? "La table hero_slides n'existe pas encore — exécutez la migration SQL fournie." : loadError}</p>}

      {loading ? (
        <p className="text-sm text-ink/50">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink/50">Aucune image configurée. La Home affiche son contenu par défaut.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 rounded-lg border border-line p-3">
              <div className="h-14 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-cream">
                {row.image_url ? <SmartImage src={row.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-ink/25"><ImageIcon size={18} /></div>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{row.title}</p>
                {row.subtitle && <p className="truncate text-xs text-ink/45">{row.subtitle}</p>}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <button onClick={() => openEdit(row)} className="rounded-lg p-2 text-ink/40 hover:text-burgundy" aria-label="Modifier"><Pencil size={16} /></button>
                <button onClick={() => handleDelete(row.id)} className="rounded-lg p-2 text-ink/40 hover:text-burgundy" aria-label="Supprimer"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={openNew} className="btn-outline flex items-center gap-1.5 text-sm"><Plus size={16} /> Ajouter une image</button>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onClick={() => setShowForm(false)}>
          <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-semibold text-ink">{editingId ? 'Modifier cette image' : 'Nouvelle image'}</h2>
            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Image</label>
                <div className="flex items-center gap-3">
                  <div className="h-16 w-28 flex-shrink-0 overflow-hidden rounded-lg border border-line bg-cream">
                    {form.imageUrl ? <SmartImage src={form.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-ink/25"><ImageIcon size={20} /></div>}
                  </div>
                  <label className="btn-outline cursor-pointer text-sm">
                    {uploading ? 'Envoi…' : form.imageUrl ? "Remplacer l'image" : 'Ajouter une image'}
                    <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => handleFile(e.target.files)} />
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Titre</label>
                <input className="input-field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Sous-titre (optionnel)</label>
                <input className="input-field" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-ink/60 mb-1.5">Texte du bouton</label>
                  <input className="input-field" value={form.ctaLabel} onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink/60 mb-1.5">Lien du bouton</label>
                  <input className="input-field" placeholder="/categorie/vetements/femme" value={form.ctaLink} onChange={(e) => setForm({ ...form, ctaLink: e.target.value })} />
                </div>
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

const emptyDiscover: DiscoverTileInput = { imageUrl: '', label: '', link: '', sortOrder: 0, isActive: true };

function DiscoverTiles() {
  const [rows, setRows] = useState<DiscoverTileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DiscoverTileInput>(emptyDiscover);
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
    setForm({ ...emptyDiscover, sortOrder: rows.length });
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
    setSaveError('');
    setSaving(true);
    const result = editingId ? await updateDiscoverTile(editingId, form) : await createDiscoverTile(form);
    setSaving(false);
    if (result.error) { setSaveError(result.error); return; }
    setShowForm(false);
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer cette catégorie ?')) return;
    const result = await deleteDiscoverTile(id);
    if (result.error) { setLoadError(result.error); return; }
    await load();
  };

  return (
    <div className="card p-5 space-y-4">
      {loadError && <p className="rounded-lg bg-burgundy/5 px-4 py-3 text-sm text-burgundy">{loadError.includes('does not exist') ? "La table home_discover_tiles n'existe pas encore — exécutez la migration SQL fournie." : loadError}</p>}

      {loading ? (
        <p className="text-sm text-ink/50">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink/50">Aucune catégorie configurée. La Home affiche sa sélection par défaut.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 rounded-lg border border-line p-3">
              <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full bg-cream">
                {row.image_url ? <SmartImage src={row.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-ink/25"><ImageIcon size={18} /></div>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{row.label}</p>
                <p className="truncate text-xs text-ink/40">{row.link}</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <button onClick={() => openEdit(row)} className="rounded-lg p-2 text-ink/40 hover:text-burgundy" aria-label="Modifier"><Pencil size={16} /></button>
                <button onClick={() => handleDelete(row.id)} className="rounded-lg p-2 text-ink/40 hover:text-burgundy" aria-label="Supprimer"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={openNew} className="btn-outline flex items-center gap-1.5 text-sm"><Plus size={16} /> Ajouter une catégorie</button>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onClick={() => setShowForm(false)}>
          <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-semibold text-ink">{editingId ? 'Modifier cette catégorie' : 'Nouvelle catégorie'}</h2>
            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Image (ronde)</label>
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-full border border-line bg-cream">
                    {form.imageUrl ? <SmartImage src={form.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-ink/25"><ImageIcon size={18} /></div>}
                  </div>
                  <label className="btn-outline cursor-pointer text-sm">
                    {uploading ? 'Envoi…' : form.imageUrl ? "Remplacer l'image" : 'Ajouter une image'}
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

export default function AdminContent() {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Contenu</h1>

      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">Bannière d'accueil</h2>
        <HeroSlides />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">À découvrir</h2>
        <DiscoverTiles />
      </div>
    </div>
  );
}
