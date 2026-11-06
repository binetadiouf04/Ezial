import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Eye, Loader2, Lock, AlertCircle, Send, EyeOff, Save, FolderCog, ExternalLink, CheckCircle2 } from 'lucide-react';
import { usePro } from '../../ProContext';
import { StatusChip } from '../../components/StatusChip';
import { slugify } from '@/shared/markdown';
import {
  fetchAdminBlogPost, fetchAdminBlogCategories, createAdminBlogPost, updateAdminBlogPost, setAdminBlogPostStatus,
  removeBlogImages, newBlogPostId, BLOG_LIMITS, BLOG_STATUS_LABELS,
  type AdminBlogPost, type AdminBlogPostInput, type AdminBlogCategory,
} from '@/lib/supabaseAdminBlog';
import { blogPostDescription, blogPostPath, blogPostTitle, truncateText } from '@/components/blog/blogShared';
import MarkdownEditor from '../../components/blog/MarkdownEditor';
import BlogImageUpload from '../../components/blog/BlogImageUpload';
import MarketplaceLinksPicker from '../../components/blog/MarketplaceLinksPicker';
import SiteUpdateNotice from '../../components/blog/SiteUpdateNotice';
import ConfirmDialog from '../../components/blog/ConfirmDialog';

const emptyInput: AdminBlogPostInput = {
  title: '', slug: '', categoryId: null, excerpt: '', content: '', coverImageUrl: '', coverImageAlt: '',
  ogImageUrl: '', seoTitle: '', metaDescription: '', marketplaceLinks: [], sources: '',
};

function toInput(p: AdminBlogPost): AdminBlogPostInput {
  return {
    title: p.title, slug: p.slug, categoryId: p.categoryId, excerpt: p.excerpt, content: p.content,
    coverImageUrl: p.coverImageUrl, coverImageAlt: p.coverImageAlt, ogImageUrl: p.ogImageUrl, seoTitle: p.seoTitle,
    metaDescription: p.metaDescription, marketplaceLinks: p.marketplaceLinks, sources: p.sources,
  };
}

// Comparable form of an input (what would actually be saved).
function snapshotOf(input: AdminBlogPostInput): string {
  return JSON.stringify({
    ...input,
    title: input.title.trim(), slug: slugify(input.slug), excerpt: input.excerpt.trim(), content: input.content.trim(),
    coverImageAlt: input.coverImageAlt.trim(), seoTitle: input.seoTitle.trim(), metaDescription: input.metaDescription.trim(), sources: input.sources.trim(),
  });
}

function validate(input: AdminBlogPostInput, requirePublishable: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  const title = input.title.trim();
  if (title.length < 3) e.title = 'Le titre doit contenir au moins 3 caractères.';
  else if (title.length > BLOG_LIMITS.title) e.title = `Le titre ne doit pas dépasser ${BLOG_LIMITS.title} caractères.`;
  if (input.excerpt.trim().length > BLOG_LIMITS.excerpt) e.excerpt = `L'extrait ne doit pas dépasser ${BLOG_LIMITS.excerpt} caractères.`;
  if (input.content.length > BLOG_LIMITS.content) e.content = 'Le contenu est trop long.';
  if (input.coverImageAlt.trim().length > BLOG_LIMITS.coverAlt) e.coverImageAlt = `Le texte alternatif ne doit pas dépasser ${BLOG_LIMITS.coverAlt} caractères.`;
  if (input.seoTitle.trim().length > BLOG_LIMITS.seoTitle) e.seoTitle = `Le titre SEO ne doit pas dépasser ${BLOG_LIMITS.seoTitle} caractères.`;
  if (input.metaDescription.trim().length > BLOG_LIMITS.metaDescription) e.metaDescription = `La méta-description ne doit pas dépasser ${BLOG_LIMITS.metaDescription} caractères.`;
  if (input.sources.trim().length > BLOG_LIMITS.sources) e.sources = `Les sources ne doivent pas dépasser ${BLOG_LIMITS.sources} caractères.`;
  if (requirePublishable) {
    if (!input.categoryId) e.categoryId = 'Choisissez une catégorie.';
    if (!input.coverImageUrl) e.coverImageUrl = 'Ajoutez une image de couverture.';
    if (!input.coverImageAlt.trim()) e.coverImageAlt = "Décrivez l'image de couverture (texte alternatif).";
    if (!input.excerpt.trim()) e.excerpt = "L'extrait est obligatoire pour publier.";
    if (!input.content.trim()) e.content = 'Le contenu est obligatoire pour publier.';
  }
  return e;
}

function Counter({ value, max }: { value: string; max: number }) {
  const n = value.trim().length;
  return <span className={`text-xs tabular-nums ${n > max ? 'font-medium text-burgundy' : 'text-ink/35'}`}>{n} / {max}</span>;
}

function Field({ label, htmlFor, counter, error, help, children }: { label: ReactNode; htmlFor?: string; counter?: ReactNode; error?: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-end justify-between gap-3">
        <label htmlFor={htmlFor} className="block text-xs font-medium text-ink/60">{label}</label>
        {counter}
      </div>
      {children}
      {help && <p className="mt-1 text-xs text-ink/40">{help}</p>}
      {error && <p className="mt-1 text-xs text-burgundy">{error}</p>}
    </div>
  );
}

type Notice = { kind: 'draft'; text: string } | { kind: 'live'; title: string; detail?: string };

export default function AdminBlogForm({ postId }: { postId?: string }) {
  const { navigate } = usePro();
  const [newId, setNewId] = useState(() => newBlogPostId());
  const id = postId ?? newId;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [post, setPost] = useState<AdminBlogPost | null>(null);
  const [categories, setCategories] = useState<AdminBlogCategory[]>([]);
  const [form, setForm] = useState<AdminBlogPostInput>(emptyInput);
  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshotOf(emptyInput));
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugNotice, setSlugNotice] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | 'save' | 'publish' | 'unpublish'>(null);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirm, setConfirm] = useState<null | 'unpublish' | 'leave'>(null);
  const loadedPostId = useRef<string | null>(null);
  const uploadedForNew = useRef(false);

  useEffect(() => {
    // Just created here: the article is already in state, nothing to reload.
    if (postId && loadedPostId.current === postId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    if (!postId) {
      setNewId(newBlogPostId());
      setPost(null);
      setForm(emptyInput);
      setSavedSnapshot(snapshotOf(emptyInput));
      setSlugTouched(false);
      setSlugNotice('');
      setErrors({});
      setNotice(null);
      setActionError('');
      loadedPostId.current = null;
      uploadedForNew.current = false;
    }
    void Promise.all([
      fetchAdminBlogCategories(),
      postId ? fetchAdminBlogPost(postId) : Promise.resolve({ post: null as AdminBlogPost | null, error: undefined as string | undefined }),
    ]).then(([catRes, postRes]) => {
      if (cancelled) return;
      setCategories(catRes.categories);
      const error = catRes.error ?? postRes.error;
      if (error) setLoadError(error);
      if (postId && postRes.post) {
        const input = toInput(postRes.post);
        setPost(postRes.post);
        setForm(input);
        setSavedSnapshot(snapshotOf(input));
        setSlugTouched(true);
        loadedPostId.current = postRes.post.id;
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [postId]);

  const set = <K extends keyof AdminBlogPostInput>(key: K, value: AdminBlogPostInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const everPublished = Boolean(post?.publishedAt);
  const status = post?.status ?? 'draft';
  const dirty = snapshotOf(form) !== savedSnapshot;
  const effectiveSlug = everPublished ? (post?.slug ?? '') : (slugify(form.slug) || slugify(form.title));

  const onTitle = (value: string) => {
    setForm((f) => ({ ...f, title: value, slug: slugTouched || everPublished ? f.slug : slugify(value) }));
    setErrors((e) => (e.title ? { ...e, title: '' } : e));
  };

  const afterSave = (saved: AdminBlogPost, requestedSlug: string) => {
    const input = toInput(saved);
    loadedPostId.current = saved.id;
    setPost(saved);
    setForm(input);
    setSavedSnapshot(snapshotOf(input));
    setSlugTouched(true);
    setErrors({});
    setSlugNotice(!everPublished && requestedSlug && saved.slug !== requestedSlug
      ? `L'adresse « ${requestedSlug} » était déjà utilisée : « ${saved.slug} » a été attribuée.`
      : '');
  };

  const save = async (mode: 'save' | 'publish') => {
    setActionError('');
    setNotice(null);
    const input: AdminBlogPostInput = { ...form, slug: everPublished ? (post?.slug ?? form.slug) : slugify(form.slug) };
    const willBeLive = mode === 'publish' || status === 'published';
    const errs = validate(input, willBeLive);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setActionError(mode === 'publish' ? 'Pour publier, complétez les champs indiqués en rouge.' : 'Corrigez les champs indiqués en rouge.');
      return;
    }
    setBusy(mode);
    const requestedSlug = input.slug || slugify(input.title);
    const res = post
      ? await updateAdminBlogPost(post.id, input, mode === 'publish' ? 'published' : undefined)
      : await createAdminBlogPost(id, input, mode === 'publish' ? 'published' : 'draft');
    setBusy(null);
    if (res.error || !res.post) { setActionError(res.error ?? 'Une erreur est survenue. Réessayez.'); return; }
    const created = !post;
    afterSave(res.post, requestedSlug);
    if (mode === 'publish') setNotice({ kind: 'live', title: status === 'unpublished' ? 'Article republié.' : 'Article publié.' });
    else if (res.post.status === 'published') setNotice({ kind: 'live', title: 'Modifications enregistrées et en ligne.' });
    else setNotice({ kind: 'draft', text: res.post.status === 'unpublished' ? "Modifications enregistrées. L'article reste dépublié (non visible)." : 'Brouillon enregistré.' });
    if (created) navigate(`/admin/blog/modifier/${res.post.id}`);
  };

  const unpublish = async () => {
    if (!post) return;
    setBusy('unpublish');
    setActionError('');
    const res = await setAdminBlogPostStatus(post.id, 'unpublished');
    setBusy(null);
    setConfirm(null);
    if (res.error || !res.post) { setActionError(res.error ?? 'Une erreur est survenue. Réessayez.'); return; }
    setPost(res.post);
    setNotice({
      kind: 'live',
      title: 'Article dépublié.',
      detail: "Il n'est plus visible sur le site. La page optimisée pour les moteurs de recherche et le sitemap seront mis à jour dans l'heure.",
    });
  };

  const leave = async () => {
    setConfirm(null);
    if (!post && uploadedForNew.current) await removeBlogImages(id);
    navigate('/admin/blog');
  };

  const requestLeave = () => {
    if (dirty || (!post && uploadedForNew.current)) setConfirm('leave');
    else navigate('/admin/blog');
  };

  const markUploaded = () => { if (!post) uploadedForNew.current = true; };

  if (loading) {
    return <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>;
  }

  if (loadError) {
    return (
      <div className="space-y-5">
        <button onClick={() => navigate('/admin/blog')} className="flex items-center gap-1.5 text-sm text-ink/50 transition-colors hover:text-ink"><ArrowLeft size={16} /> Blog</button>
        <p className="flex items-start gap-2 rounded-lg bg-burgundy/5 p-4 text-sm text-burgundy"><AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> {loadError}</p>
      </div>
    );
  }

  if (postId && !post) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-ink/55">Article introuvable.</p>
        <button onClick={() => navigate('/admin/blog')} className="btn-outline mt-4">Retour au blog</button>
      </div>
    );
  }

  const actionButtons = (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={() => void save('save')} disabled={busy !== null} className="btn-outline px-4 py-2.5">
        {busy === 'save' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        {status === 'draft' ? 'Enregistrer le brouillon' : 'Enregistrer'}
      </button>
      {status !== 'published' ? (
        <button onClick={() => void save('publish')} disabled={busy !== null} className="btn-primary px-4 py-2.5">
          {busy === 'publish' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {status === 'unpublished' ? 'Republier' : 'Publier'}
        </button>
      ) : (
        <button onClick={() => setConfirm('unpublish')} disabled={busy !== null} className="btn-outline px-4 py-2.5 text-orange-700">
          <EyeOff size={15} /> Dépublier
        </button>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <button onClick={requestLeave} className="flex items-center gap-1.5 text-sm text-ink/50 transition-colors hover:text-ink">
        <ArrowLeft size={16} /> Blog
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold text-ink">{post ? "Modifier l'article" : 'Nouvel article'}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusChip status={status} size="md" label={BLOG_STATUS_LABELS[status]} />
            {dirty && <span className="text-xs font-medium text-amber-700">Modifications non enregistrées</span>}
            {post && (
              <button onClick={() => navigate(`/admin/blog/apercu/${post.id}`)} className="flex items-center gap-1 text-sm font-medium text-burgundy hover:underline">
                <Eye size={15} /> Aperçu{dirty ? ' (version enregistrée)' : ''}
              </button>
            )}
            {post?.status === 'published' && (
              <a href={blogPostPath(post.slug)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm font-medium text-burgundy hover:underline">
                <ExternalLink size={14} /> Voir en ligne
              </a>
            )}
          </div>
        </div>
        {actionButtons}
      </div>

      {notice?.kind === 'live' && <SiteUpdateNotice title={notice.title} detail={notice.detail} onClose={() => setNotice(null)} />}
      {notice?.kind === 'draft' && <p className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-800"><CheckCircle2 size={16} /> {notice.text}</p>}
      {actionError && <p className="flex items-start gap-2 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy"><AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> {actionError}</p>}
      {status === 'published' && dirty && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Cet article est en ligne : vos modifications seront visibles dès l'enregistrement.</p>
      )}

      {/* Article */}
      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold text-ink">Article</h2>
        <Field label="Titre" htmlFor="blog-title" counter={<Counter value={form.title} max={BLOG_LIMITS.title} />} error={errors.title}>
          <input id="blog-title" className="input-field" value={form.title} maxLength={BLOG_LIMITS.title + 20} onChange={(e) => onTitle(e.target.value)} placeholder="Titre de l'article" />
        </Field>

        {everPublished ? (
          <Field label="Adresse de l'article" help="L'adresse est figée depuis la première publication, pour ne pas casser les liens partagés ni le référencement.">
            <p className="flex items-center gap-2 rounded-xl border border-line bg-cream/60 px-4 py-3 font-mono text-sm text-ink/70">
              <Lock size={14} className="flex-shrink-0 text-ink/40" /> <span className="break-all">ezial.net/blog/{post?.slug}/</span>
            </p>
          </Field>
        ) : (
          <Field
            label="Adresse de l'article (slug)"
            htmlFor="blog-slug"
            help={<>ezial.net/blog/<span className="font-mono">{effectiveSlug || '…'}</span>/ — modifiable tant que l'article n'a jamais été publié, figée ensuite.</>}
            error={errors.slug}
          >
            <input
              id="blog-slug"
              className="input-field font-mono text-sm"
              value={form.slug}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={slugify(form.title) || 'adresse-de-l-article'}
              onChange={(e) => { setSlugTouched(true); set('slug', e.target.value); }}
              onBlur={() => set('slug', slugify(form.slug))}
            />
          </Field>
        )}
        {slugNotice && <p className="text-xs text-amber-700">{slugNotice}</p>}

        <Field
          label="Catégorie"
          htmlFor="blog-category"
          error={errors.categoryId}
          help={categories.length > 0 ? (
            <button type="button" onClick={() => navigate('/admin/blog/categories')} className="inline-flex items-center gap-1 font-medium text-burgundy hover:underline">
              <FolderCog size={13} /> Gérer les catégories
            </button>
          ) : undefined}
        >
          {categories.length > 0 ? (
            <select id="blog-category" className="input-field" value={form.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value || null)}>
              <option value="">Choisir une catégorie…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <div className="rounded-xl border border-dashed border-line bg-cream/40 p-4 text-sm text-ink/60">
              Aucune catégorie n'existe encore. Une catégorie est nécessaire pour publier.
              <button type="button" onClick={() => navigate('/admin/blog/categories')} className="mt-2 flex items-center gap-1 font-medium text-burgundy hover:underline">
                <FolderCog size={14} /> Créer une catégorie
              </button>
            </div>
          )}
        </Field>

        <Field label="Extrait" htmlFor="blog-excerpt" counter={<Counter value={form.excerpt} max={BLOG_LIMITS.excerpt} />} error={errors.excerpt} help="Deux ou trois phrases affichées dans les listes d'articles et en introduction.">
          <textarea id="blog-excerpt" className="input-field" rows={3} value={form.excerpt} onChange={(e) => set('excerpt', e.target.value)} />
        </Field>

        <div>
          <p className="mb-1.5 text-xs font-medium text-ink/60">Contenu</p>
          <MarkdownEditor value={form.content} onChange={(v) => set('content', v)} postId={id} error={errors.content} onImageUploaded={markUploaded} />
        </div>
      </section>

      {/* Couverture */}
      <section className="card space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold text-ink">Image de couverture</h2>
          <p className="mt-0.5 text-xs text-ink/45">Format 16:9, recadrée après le choix de la photo. Obligatoire pour publier.</p>
        </div>
        <BlogImageUpload
          postId={id}
          kind="couverture"
          aspect={16 / 9}
          value={form.coverImageUrl}
          onChange={(url) => set('coverImageUrl', url)}
          onUploaded={markUploaded}
          cropTitle="Recadrer l'image de couverture (16:9)"
          emptyLabel="Choisir une image de couverture"
        />
        {errors.coverImageUrl && <p className="text-xs text-burgundy">{errors.coverImageUrl}</p>}
        <Field
          label="Texte alternatif de la couverture (obligatoire)"
          htmlFor="blog-cover-alt"
          counter={<Counter value={form.coverImageAlt} max={BLOG_LIMITS.coverAlt} />}
          error={errors.coverImageAlt}
          help="Décrivez ce que montre l'image (lu par les lecteurs d'écran et les moteurs de recherche)."
        >
          <input id="blog-cover-alt" className="input-field" value={form.coverImageAlt} onChange={(e) => set('coverImageAlt', e.target.value)} placeholder="Ex. : trois flacons de sérum sur une étagère en bois" />
        </Field>
      </section>

      {/* SEO */}
      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold text-ink">Référencement (SEO)</h2>
        <Field
          label="Titre SEO (facultatif)"
          htmlFor="blog-seo-title"
          counter={<Counter value={form.seoTitle} max={BLOG_LIMITS.seoTitle} />}
          error={errors.seoTitle}
          help="Par défaut, le titre de l'article. « — Blog Ezial » est ajouté automatiquement."
        >
          <input id="blog-seo-title" className="input-field" value={form.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} placeholder={form.title || 'Titre affiché dans Google'} />
        </Field>
        <Field
          label="Méta-description (facultative)"
          htmlFor="blog-meta"
          counter={<Counter value={form.metaDescription} max={BLOG_LIMITS.metaDescription} />}
          error={errors.metaDescription}
          help="Par défaut, l'extrait (coupé à 160 caractères)."
        >
          <textarea id="blog-meta" className="input-field" rows={2} value={form.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} placeholder={form.excerpt || 'Description affichée dans les résultats de recherche'} />
        </Field>

        <div>
          <p className="mb-1.5 text-xs font-medium text-ink/60">Aperçu dans Google</p>
          <div className="rounded-xl border border-line bg-white p-4">
            <p className="truncate text-xs text-ink/55">ezial.net › blog › {effectiveSlug || '…'}</p>
            <p className="mt-1 line-clamp-2 text-lg leading-snug text-[#1a0dab]">{truncateText(blogPostTitle(form.seoTitle, form.title || "Titre de l'article"), 65)}</p>
            <p className="mt-1 line-clamp-2 text-sm text-ink/60">
              {blogPostDescription(form.metaDescription, form.excerpt) || "La méta-description (ou, à défaut, l'extrait) apparaîtra ici."}
            </p>
          </div>
          <p className="mt-1 text-xs text-ink/40">Indicatif : Google choisit lui-même l'affichage final.</p>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-ink/60">Image de partage sur les réseaux sociaux (facultative)</p>
          <p className="mb-2 text-xs text-ink/40">Format 1,91:1 (WhatsApp, Facebook…). Par défaut, l'image de couverture est utilisée.</p>
          <BlogImageUpload
            postId={id}
            kind="partage"
            aspect={1.91}
            value={form.ogImageUrl}
            onChange={(url) => set('ogImageUrl', url)}
            onUploaded={markUploaded}
            cropTitle="Recadrer l'image de partage (1,91:1)"
            emptyLabel="Choisir une image de partage"
          />
        </div>
      </section>

      {/* Liens marketplace */}
      <section className="card space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold text-ink">Liens vers la marketplace (facultatif)</h2>
          <p className="mt-0.5 text-xs text-ink/45">Catégories affichées en fin d'article sous « À découvrir sur Ezial ».</p>
        </div>
        <MarketplaceLinksPicker value={form.marketplaceLinks} onChange={(v) => set('marketplaceLinks', v)} />
      </section>

      {/* Sources */}
      <section className="card space-y-3 p-5">
        <h2 className="text-sm font-semibold text-ink">Sources (facultatif)</h2>
        <Field
          label="Références citées"
          htmlFor="blog-sources"
          counter={<Counter value={form.sources} max={BLOG_LIMITS.sources} />}
          error={errors.sources}
          help="Une source par ligne. Les liens au format [texte](https://…) sont acceptés."
        >
          <textarea id="blog-sources" className="input-field" rows={3} value={form.sources} onChange={(e) => set('sources', e.target.value)} />
        </Field>
      </section>

      <p className="text-xs text-ink/40">Auteur affiché : l'équipe Ezial. Les dates de publication et de mise à jour sont gérées automatiquement.</p>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <button onClick={requestLeave} className="btn-ghost text-ink/60">Annuler</button>
        {actionButtons}
      </div>

      {confirm === 'unpublish' && (
        <ConfirmDialog
          title="Dépublier l'article"
          message="L'article ne sera plus visible sur le site. Vous pourrez le republier à tout moment ; son adresse et sa date de publication seront conservées."
          confirmLabel="Dépublier"
          busy={busy === 'unpublish'}
          onConfirm={() => void unpublish()}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'leave' && (
        <ConfirmDialog
          title="Quitter sans enregistrer ?"
          message={post ? 'Les modifications non enregistrées seront perdues.' : "L'article n'a pas été enregistré : son contenu et les images envoyées seront supprimés."}
          confirmLabel="Quitter"
          cancelLabel="Rester"
          danger
          onConfirm={() => void leave()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
