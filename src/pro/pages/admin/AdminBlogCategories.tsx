import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowUp, ArrowDown, Plus, Pencil, Trash2, Loader2, AlertCircle, Check, X } from 'lucide-react';
import { usePro } from '../../ProContext';
import { slugify } from '@/shared/markdown';
import {
  fetchAdminBlogCategories, createAdminBlogCategory, updateAdminBlogCategory, reorderAdminBlogCategories, deleteAdminBlogCategory,
  BLOG_LIMITS, type AdminBlogCategory, type BlogCategoryInput,
} from '@/lib/supabaseAdminBlog';
import ConfirmDialog from '../../components/blog/ConfirmDialog';

const emptyInput: BlogCategoryInput = { name: '', description: '' };

function validate(input: BlogCategoryInput): string {
  const name = input.name.trim();
  if (name.length < 2) return 'Le nom doit contenir au moins 2 caractères.';
  if (name.length > BLOG_LIMITS.categoryName) return `Le nom ne doit pas dépasser ${BLOG_LIMITS.categoryName} caractères.`;
  if (input.description.trim().length > BLOG_LIMITS.categoryDescription) return `La description ne doit pas dépasser ${BLOG_LIMITS.categoryDescription} caractères.`;
  return '';
}

function CategoryFields({ input, onChange, idPrefix }: { input: BlogCategoryInput; onChange: (next: BlogCategoryInput) => void; idPrefix: string }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 flex items-end justify-between">
          <label htmlFor={`${idPrefix}-name`} className="block text-xs font-medium text-ink/60">Nom</label>
          <span className={`text-xs ${input.name.trim().length > BLOG_LIMITS.categoryName ? 'text-burgundy' : 'text-ink/35'}`}>{input.name.trim().length} / {BLOG_LIMITS.categoryName}</span>
        </div>
        <input id={`${idPrefix}-name`} className="input-field" value={input.name} onChange={(e) => onChange({ ...input, name: e.target.value })} placeholder="Ex. : Conseils beauté" />
      </div>
      <div>
        <div className="mb-1.5 flex items-end justify-between">
          <label htmlFor={`${idPrefix}-description`} className="block text-xs font-medium text-ink/60">Description (facultative)</label>
          <span className={`text-xs ${input.description.trim().length > BLOG_LIMITS.categoryDescription ? 'text-burgundy' : 'text-ink/35'}`}>{input.description.trim().length} / {BLOG_LIMITS.categoryDescription}</span>
        </div>
        <textarea id={`${idPrefix}-description`} className="input-field" rows={2} value={input.description} onChange={(e) => onChange({ ...input, description: e.target.value })} />
        <p className="mt-1 text-xs text-ink/40">Affichée en haut de la page de la catégorie et utilisée comme description pour les moteurs de recherche.</p>
      </div>
    </div>
  );
}

// Blog categories: create, rename, describe, reorder. A category used by at
// least one article cannot be deleted (also enforced by the database).
export default function AdminBlogCategories() {
  const { navigate } = usePro();
  const [categories, setCategories] = useState<AdminBlogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newInput, setNewInput] = useState<BlogCategoryInput>(emptyInput);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState<BlogCategoryInput>(emptyInput);
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<AdminBlogCategory | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const res = await fetchAdminBlogCategories();
    setCategories(res.categories);
    setLoadError(res.error ?? '');
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    const err = validate(newInput);
    if (err) { setFormError(err); return; }
    setSaving(true);
    setFormError('');
    const nextOrder = categories.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1;
    const res = await createAdminBlogCategory(newInput, nextOrder);
    setSaving(false);
    if (res.error) { setFormError(res.error); return; }
    setCreating(false);
    setNewInput(emptyInput);
    void load();
  };

  const startEdit = (c: AdminBlogCategory) => {
    setEditingId(c.id);
    setEditInput({ name: c.name, description: c.description });
    setFormError('');
    setCreating(false);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const err = validate(editInput);
    if (err) { setFormError(err); return; }
    setSaving(true);
    setFormError('');
    const res = await updateAdminBlogCategory(editingId, editInput);
    setSaving(false);
    if (res.error) { setFormError(res.error); return; }
    setEditingId(null);
    void load();
  };

  const move = async (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= categories.length) return;
    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    setCategories(next.map((c, i) => ({ ...c, sortOrder: i + 1 })));
    setActionError('');
    const res = await reorderAdminBlogCategories(next.map((c) => c.id));
    if (res.error) { setActionError(res.error); void load(); }
  };

  const remove = async (c: AdminBlogCategory) => {
    setSaving(true);
    setActionError('');
    const res = await deleteAdminBlogCategory(c.id);
    setSaving(false);
    setToDelete(null);
    if (res.error) { setActionError(res.error); return; }
    void load();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <button onClick={() => navigate('/admin/blog')} className="flex items-center gap-1.5 text-sm text-ink/50 transition-colors hover:text-ink">
        <ArrowLeft size={16} /> Blog
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">Catégories du blog</h1>
        {!creating && !loadError && (
          <button onClick={() => { setCreating(true); setEditingId(null); setFormError(''); }} className="btn-primary px-4 py-2.5">
            <Plus size={16} /> Nouvelle catégorie
          </button>
        )}
      </div>

      {loadError && <p className="flex items-start gap-2 rounded-lg bg-burgundy/5 p-4 text-sm text-burgundy"><AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> {loadError}</p>}
      {actionError && <p className="flex items-start gap-2 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy"><AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> {actionError}</p>}

      {creating && (
        <div className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold text-ink">Nouvelle catégorie</h2>
          <CategoryFields input={newInput} onChange={setNewInput} idPrefix="new-category" />
          <p className="text-xs text-ink/45">
            Adresse : ezial.net/blog/categorie/<span className="font-mono">{slugify(newInput.name) || '…'}</span>/ — fixée à la création, elle ne change pas si vous renommez la catégorie.
          </p>
          {formError && <p className="text-xs text-burgundy">{formError}</p>}
          <div className="flex gap-2">
            <button onClick={() => void create()} disabled={saving} className="btn-primary flex-1 px-4">{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Créer</button>
            <button onClick={() => { setCreating(false); setNewInput(emptyInput); setFormError(''); }} className="btn-outline flex-1 px-4"><X size={15} /> Annuler</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : loadError ? null : categories.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-ink/55">Aucune catégorie pour le moment.</p>
          <p className="mt-1 text-xs text-ink/40">Une catégorie est nécessaire pour publier un article. Seules les catégories contenant au moins un article publié apparaissent sur le site.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {categories.map((c, i) => (
            <li key={c.id} className="card p-4">
              {editingId === c.id ? (
                <div className="space-y-4">
                  <CategoryFields input={editInput} onChange={setEditInput} idPrefix={`edit-${c.id}`} />
                  <p className="text-xs text-ink/45">Adresse (inchangée) : ezial.net/blog/categorie/<span className="font-mono">{c.slug}</span>/</p>
                  {formError && <p className="text-xs text-burgundy">{formError}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => void saveEdit()} disabled={saving} className="btn-primary flex-1 px-4">{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Enregistrer</button>
                    <button onClick={() => { setEditingId(null); setFormError(''); }} className="btn-outline flex-1 px-4"><X size={15} /> Annuler</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{c.name}</p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-ink/40">/blog/categorie/{c.slug}/</p>
                    {c.description && <p className="mt-1.5 text-sm text-ink/60">{c.description}</p>}
                    <p className="mt-1.5 text-xs text-ink/45">{c.postCount === 0 ? 'Aucun article' : `${c.postCount} article${c.postCount > 1 ? 's' : ''}`}</p>
                  </div>
                  <div className="flex flex-shrink-0 flex-wrap items-center gap-1">
                    <button onClick={() => void move(i, -1)} disabled={i === 0} className="rounded-lg p-2 text-ink/50 transition-colors hover:bg-cream hover:text-ink disabled:opacity-30" title="Monter" aria-label={`Monter « ${c.name} »`}><ArrowUp size={16} /></button>
                    <button onClick={() => void move(i, 1)} disabled={i === categories.length - 1} className="rounded-lg p-2 text-ink/50 transition-colors hover:bg-cream hover:text-ink disabled:opacity-30" title="Descendre" aria-label={`Descendre « ${c.name} »`}><ArrowDown size={16} /></button>
                    <button onClick={() => startEdit(c)} className="flex items-center gap-1.5 rounded-lg p-2 text-sm text-ink/50 transition-colors hover:bg-cream hover:text-ink" title="Modifier" aria-label={`Modifier « ${c.name} »`}>
                      <Pencil size={16} /><span className="hidden md:inline">Modifier</span>
                    </button>
                    <button
                      onClick={() => setToDelete(c)}
                      disabled={c.postCount > 0}
                      className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                      title={c.postCount > 0 ? 'Utilisée par des articles : déplacez-les avant de la supprimer' : 'Supprimer'}
                      aria-label={`Supprimer « ${c.name} »`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {categories.some((c) => c.postCount > 0) && (
        <p className="text-xs text-ink/40">Une catégorie utilisée par des articles (brouillons compris) ne peut pas être supprimée.</p>
      )}

      {toDelete && (
        <ConfirmDialog
          title="Supprimer la catégorie"
          message={`La catégorie « ${toDelete.name} » sera supprimée définitivement.`}
          confirmLabel="Supprimer"
          danger
          busy={saving}
          onConfirm={() => void remove(toDelete)}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
