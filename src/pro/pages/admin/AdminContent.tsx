import { useEffect, useState } from 'react';
import { Image as ImageIcon, Pencil, Trash2 } from 'lucide-react';
import SmartImage from '@/components/SmartImage';
import {
  fetchAllHeroSlidesForAdmin,
  updateHeroSlide,
  deleteHeroSlide,
  fetchAllDiscoverTilesForAdmin,
  updateDiscoverTile,
  uploadSiteContentImage,
  type HeroSlideRow,
  type HeroSlideInput,
  type DiscoverTileRow,
} from '@/lib/supabaseHomeContent';
import AdminBlog from './AdminBlog';

// Hero and "à découvrir" already have real content (seeded from what the
// Home used to show hardcoded) — this page is for editing what's already
// there, not for building a mini-CMS: no "add" affordance, since there is
// nothing missing to create.

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
  const [form, setForm] = useState<HeroSlideInput | null>(null);
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

  const openEdit = (row: HeroSlideRow) => {
    setForm(heroRowToInput(row));
    setEditingId(row.id);
    setSaveError('');
    setShowForm(true);
  };

  const handleFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/') || !form) return;
    setUploading(true);
    const result = await uploadSiteContentImage(file, 'hero');
    setUploading(false);
    if ('error' in result) { setSaveError(result.error); return; }
    setForm((f) => f && { ...f, imageUrl: result.url });
  };

  const handleSave = async () => {
    if (!form || !editingId) return;
    if (!form.imageUrl.trim()) { setSaveError('Ajoutez une image.'); return; }
    if (!form.title.trim()) { setSaveError('Le titre est obligatoire.'); return; }
    if (!form.ctaLabel.trim() || !form.ctaLink.trim()) { setSaveError('Le texte et le lien du bouton sont obligatoires.'); return; }
    setSaveError('');
    setSaving(true);
    const result = await updateHeroSlide(editingId, form);
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

      {showForm && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onClick={() => setShowForm(false)}>
          <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-semibold text-ink">Modifier cette image</h2>
            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Image</label>
                <div className="flex items-center gap-3">
                  <div className="h-16 w-28 flex-shrink-0 overflow-hidden rounded-lg border border-line bg-cream">
                    {form.imageUrl ? <SmartImage src={form.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-ink/25"><ImageIcon size={20} /></div>}
                  </div>
                  <label className="btn-outline cursor-pointer text-sm">
                    {uploading ? 'Envoi…' : "Remplacer l'image"}
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

function DiscoverTiles() {
  const [rows, setRows] = useState<DiscoverTileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { rows: fetched, error } = await fetchAllDiscoverTilesForAdmin();
    setLoading(false);
    if (error) { setLoadError(error); return; }
    setLoadError('');
    setRows(fetched);
  };

  useEffect(() => { load(); }, []);

  const handleReplace = async (row: DiscoverTileRow, files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setRowError(null);
    setUploadingId(row.id);
    const result = await uploadSiteContentImage(file, 'discover');
    if ('error' in result) {
      setUploadingId(null);
      setRowError({ id: row.id, message: result.error });
      return;
    }
    const updateResult = await updateDiscoverTile(row.id, {
      imageUrl: result.url,
      label: row.label,
      link: row.link,
      sortOrder: row.sort_order,
      isActive: row.is_active,
    });
    setUploadingId(null);
    if (updateResult.error) { setRowError({ id: row.id, message: updateResult.error }); return; }
    await load();
  };

  const sortedRows = [...rows].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="card p-5 space-y-4">
      {loadError && <p className="rounded-lg bg-burgundy/5 px-4 py-3 text-sm text-burgundy">{loadError.includes('does not exist') ? "La table home_discover_tiles n'existe pas encore — exécutez la migration SQL fournie." : loadError}</p>}

      {loading ? (
        <p className="text-sm text-ink/50">Chargement…</p>
      ) : sortedRows.length === 0 ? (
        <p className="text-sm text-ink/50">Aucune catégorie configurée.</p>
      ) : (
        <div className="space-y-3">
          {sortedRows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 rounded-lg border border-line p-3">
              <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full bg-cream">
                {row.image_url ? <SmartImage src={row.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-ink/25"><ImageIcon size={18} /></div>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{row.label}</p>
                {rowError?.id === row.id && <p className="text-xs text-burgundy mt-0.5">{rowError.message}</p>}
              </div>
              <label className="btn-outline cursor-pointer text-sm flex-shrink-0">
                {uploadingId === row.id ? 'Envoi…' : "Modifier l'image"}
                <input type="file" accept="image/*" className="hidden" disabled={uploadingId === row.id} onChange={(e) => handleReplace(row, e.target.files)} />
              </label>
            </div>
          ))}
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

      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">Blog</h2>
        <AdminBlog />
      </div>
    </div>
  );
}
