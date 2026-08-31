import { useState } from 'react';
import { usePro } from '../../ProContext';
import { blogCategories, type BlogPost } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { ArrowLeft, Eye } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

function slugify(text: string): string {
  return text
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const blogStatusLabels: Record<string, string> = { draft: 'Brouillon', scheduled: 'Programmé', published: 'Publié', unpublished: 'Dépublié' };

export default function AdminBlogForm({ postId }: { postId?: string }) {
  const { navigate, blogPosts, createBlogPost, updateBlogPost } = usePro();
  const existing = postId ? blogPosts.find((p) => p.id === postId) : undefined;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [slug, setSlug] = useState(existing?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(!!existing);
  const [coverImage, setCoverImage] = useState(existing?.coverImage ?? '');
  const [category, setCategory] = useState(existing?.category ?? blogCategories[0]);
  const [excerpt, setExcerpt] = useState(existing?.excerpt ?? '');
  const [content, setContent] = useState(existing?.content ?? '');
  const [sources, setSources] = useState(existing?.sources ?? '');
  const [author, setAuthor] = useState(existing?.author ?? 'Équipe Ezial');
  const [publishDate, setPublishDate] = useState(existing?.publishDate ?? new Date().toISOString().split('T')[0]);
  const [seoTitle, setSeoTitle] = useState(existing?.seoTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(existing?.metaDescription ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const handleSlugChange = (value: string) => {
    setSlugTouched(true);
    setSlug(slugify(value));
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Le titre est obligatoire';
    if (!slug.trim()) e.slug = 'Le slug est obligatoire';
    if (!excerpt.trim()) e.excerpt = 'Le résumé est obligatoire';
    if (!content.trim()) e.content = 'Le contenu est obligatoire';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildPost = (): Omit<BlogPost, 'id'> => ({
    title: title.trim(),
    slug: slug.trim(),
    coverImage: coverImage.trim(),
    category,
    excerpt: excerpt.trim(),
    content: content.trim(),
    sources: sources.trim() || undefined,
    author: author.trim(),
    publishDate,
    updatedDate: new Date().toISOString().split('T')[0],
    seoTitle: seoTitle.trim() || undefined,
    metaDescription: metaDescription.trim() || undefined,
    status: existing?.status ?? 'draft',
  });

  const handleSave = () => {
    if (!validate()) return;
    if (existing) {
      updateBlogPost(existing.id, buildPost());
      navigate('/admin/blog');
    } else {
      const created = createBlogPost(buildPost());
      navigate(`/admin/blog/modifier/${created.id}`);
    }
  };

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/admin/blog')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors">
        <ArrowLeft size={16} /> Blog
      </button>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-2xl font-semibold text-ink">{existing ? 'Modifier l\'article' : 'Nouvel article'}</h1>
        <div className="flex items-center gap-2">
          {existing && <StatusChip status={existing.status} size="md" label={blogStatusLabels[existing.status]} />}
          {existing && (
            <button onClick={() => navigate(`/admin/blog/apercu/${existing.id}`)} className="flex items-center gap-1.5 text-sm font-medium text-burgundy hover:underline">
              <Eye size={15} /> Prévisualiser
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Contenu</h2>
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Titre</label>
          <input className="input-field" value={title} onChange={(e) => handleTitleChange(e.target.value)} />
          {errors.title && <p className="mt-1 text-xs text-burgundy">{errors.title}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Slug</label>
          <input className="input-field font-mono text-sm" value={slug} onChange={(e) => handleSlugChange(e.target.value)} />
          {errors.slug && <p className="mt-1 text-xs text-burgundy">{errors.slug}</p>}
          <p className="mt-1 text-xs text-ink/35">/blog/{slug || '…'}</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Catégorie</label>
          <select className="input-field" value={category} onChange={(e) => setCategory(e.target.value)}>
            {blogCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Résumé</label>
          <textarea className="input-field" rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="Courte accroche affichée dans les listes" />
          {errors.excerpt && <p className="mt-1 text-xs text-burgundy">{errors.excerpt}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Contenu</label>
          <textarea className="input-field" rows={10} value={content} onChange={(e) => setContent(e.target.value)} />
          {errors.content && <p className="mt-1 text-xs text-burgundy">{errors.content}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Sources (optionnel)</label>
          <textarea className="input-field" rows={2} value={sources} onChange={(e) => setSources(e.target.value)} placeholder="Références, entretiens, études citées…" />
        </div>
      </div>

      {/* Cover image */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Image de couverture</h2>
        {coverImage && (
          <div className="rounded-lg overflow-hidden h-40 bg-cream">
            <SmartImage src={coverImage} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">URL de l'image</label>
          <input className="input-field" value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="https://…" />
        </div>
      </div>

      {/* Publication */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Publication</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Auteur</label>
            <input className="input-field" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Date de publication</label>
            <input type="date" className="input-field" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} />
          </div>
        </div>
        {existing?.updatedDate && (
          <p className="text-xs text-ink/40">Dernière mise à jour : {new Date(existing.updatedDate).toLocaleDateString('fr-FR')}</p>
        )}
        <p className="text-xs text-ink/40">Le statut (brouillon, publié, programmé, dépublié) se gère depuis la liste des articles, avec les actions Publier / Dépublier / Programmer.</p>
      </div>

      {/* SEO */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Référencement (SEO)</h2>
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Titre SEO</label>
          <input className="input-field" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} placeholder={title || 'Titre affiché dans les moteurs de recherche'} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Meta description</label>
          <textarea className="input-field" rows={2} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} placeholder={excerpt || 'Description affichée dans les résultats de recherche'} />
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => navigate('/admin/blog')} className="btn-outline flex-1">Annuler</button>
        <button onClick={handleSave} className="btn-primary flex-1">{existing ? 'Enregistrer' : 'Créer l\'article'}</button>
      </div>
    </div>
  );
}
