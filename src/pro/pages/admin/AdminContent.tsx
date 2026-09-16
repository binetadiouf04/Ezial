import { useEffect, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import SmartImage from '@/components/SmartImage';
import {
  fetchAllHeroSlidesForAdmin,
  createHeroSlide,
  updateHeroSlide,
  fetchAllDiscoverTilesForAdmin,
  updateDiscoverTile,
  uploadSiteContentImage,
  type HeroSlideRow,
  type HeroSlideInput,
  type DiscoverTileRow,
} from '@/lib/supabaseHomeContent';

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

function HeroBanner() {
  const [existingId, setExistingId] = useState<string | null>(null);
  const [form, setForm] = useState<HeroSlideInput>(emptyHero);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { rows, error } = await fetchAllHeroSlidesForAdmin();
    setLoading(false);
    if (error) { setLoadError(error); return; }
    setLoadError('');
    const current = [...rows].sort((a, b) => a.sort_order - b.sort_order)[0];
    if (current) {
      setExistingId(current.id);
      setForm(heroRowToInput(current));
    } else {
      setExistingId(null);
      setForm(emptyHero);
    }
  };

  useEffect(() => { load(); }, []);

  const handleFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setUploading(true);
    const result = await uploadSiteContentImage(file, 'hero');
    setUploading(false);
    if ('error' in result) { setSaveError(result.error); return; }
    setForm((f) => ({ ...f, imageUrl: result.url }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!form.imageUrl.trim()) { setSaveError('Ajoutez une image.'); return; }
    if (!form.title.trim()) { setSaveError('Le titre est obligatoire.'); return; }
    if (!form.ctaLabel.trim() || !form.ctaLink.trim()) { setSaveError('Le texte et le lien du bouton sont obligatoires.'); return; }
    setSaveError('');
    setSaving(true);
    const result = existingId ? await updateHeroSlide(existingId, form) : await createHeroSlide({ ...form, isActive: true });
    setSaving(false);
    if (result.error) { setSaveError(result.error); return; }
    setSaved(true);
    await load();
  };

  if (loading) return <div className="card p-6 text-sm text-ink/50">Chargement…</div>;

  return (
    <div className="card p-5 space-y-4">
      {loadError && <p className="rounded-lg bg-burgundy/5 px-4 py-3 text-sm text-burgundy">{loadError.includes('does not exist') ? "La table hero_slides n'existe pas encore." : loadError}</p>}

      <div>
        <label className="block text-xs font-medium text-ink/60 mb-1.5">Image de la bannière</label>
        <div className="flex items-center gap-3">
          <div className="h-20 w-36 flex-shrink-0 overflow-hidden rounded-lg border border-line bg-cream">
            {form.imageUrl ? <SmartImage src={form.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-ink/25"><ImageIcon size={22} /></div>}
          </div>
          <label className="btn-outline cursor-pointer text-sm">
            {uploading ? 'Envoi…' : "Remplacer l'image"}
            <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => handleFile(e.target.files)} />
          </label>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-ink/60 mb-1.5">Titre</label>
        <input className="input-field" value={form.title} onChange={(e) => { setForm({ ...form, title: e.target.value }); setSaved(false); }} />
      </div>

      <div>
        <label className="block text-xs font-medium text-ink/60 mb-1.5">Sous-titre (optionnel)</label>
        <input className="input-field" value={form.subtitle} onChange={(e) => { setForm({ ...form, subtitle: e.target.value }); setSaved(false); }} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Texte du bouton</label>
          <input className="input-field" value={form.ctaLabel} onChange={(e) => { setForm({ ...form, ctaLabel: e.target.value }); setSaved(false); }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Lien du bouton</label>
          <input className="input-field" placeholder="/categorie/vetements/femme" value={form.ctaLink} onChange={(e) => { setForm({ ...form, ctaLink: e.target.value }); setSaved(false); }} />
        </div>
      </div>

      {saveError && <p className="text-sm text-burgundy">{saveError}</p>}
      {saved && !saveError && <p className="text-sm text-green-700">Bannière enregistrée.</p>}

      <button onClick={handleSave} disabled={saving} className="btn-primary w-full sm:w-auto">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
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
      {loadError && <p className="rounded-lg bg-burgundy/5 px-4 py-3 text-sm text-burgundy">{loadError.includes('does not exist') ? "La table home_discover_tiles n'existe pas encore." : loadError}</p>}

      {loading ? (
        <p className="text-sm text-ink/50">Chargement…</p>
      ) : sortedRows.length === 0 ? (
        <p className="text-sm text-ink/50">Aucun emplacement configuré.</p>
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
        <HeroBanner />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">À découvrir</h2>
        <DiscoverTiles />
      </div>
    </div>
  );
}
