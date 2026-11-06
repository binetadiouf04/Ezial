import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Plus, Eye, Pencil, Trash2, Send, EyeOff, Loader2, AlertCircle, FolderCog, ExternalLink, ImageOff } from 'lucide-react';
import { usePro } from '../../ProContext';
import { StatusChip } from '../../components/StatusChip';
import SmartImage from '@/components/SmartImage';
import {
  fetchAdminBlogPosts, fetchAdminBlogCategories, setAdminBlogPostStatus, deleteAdminBlogPost, missingForPublication,
  BLOG_STATUS_LABELS, type AdminBlogPost, type AdminBlogCategory, type BlogPostStatus,
} from '@/lib/supabaseAdminBlog';
import { blogPostPath, formatBlogDate } from '@/components/blog/blogShared';
import SiteUpdateNotice from '../../components/blog/SiteUpdateNotice';
import ConfirmDialog from '../../components/blog/ConfirmDialog';

type Tab = 'all' | BlogPostStatus;

const tabLabels: Record<Tab, string> = { all: 'Tous', draft: 'Brouillons', published: 'Publiés', unpublished: 'Dépubliés' };

function dateLine(post: AdminBlogPost): string {
  if (post.status === 'published' && post.publishedAt) return `Publié le ${formatBlogDate(post.publishedAt)}`;
  if (post.status === 'unpublished') return `Dépublié · modifié le ${formatBlogDate(post.updatedAt)}`;
  return `Modifié le ${formatBlogDate(post.updatedAt)}`;
}

export default function AdminBlog() {
  const { navigate } = usePro();
  const [posts, setPosts] = useState<AdminBlogPost[]>([]);
  const [categories, setCategories] = useState<AdminBlogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState<{ title: string; detail?: string } | null>(null);
  const [warning, setWarning] = useState('');
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'unpublish'; post: AdminBlogPost } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const [postsRes, categoriesRes] = await Promise.all([fetchAdminBlogPosts(), fetchAdminBlogCategories()]);
    setPosts(postsRes.posts);
    setCategories(categoriesRes.categories);
    setLoadError(postsRes.error ?? categoriesRes.error ?? '');
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const counts = useMemo(() => ({
    all: posts.length,
    draft: posts.filter((p) => p.status === 'draft').length,
    published: posts.filter((p) => p.status === 'published').length,
    unpublished: posts.filter((p) => p.status === 'unpublished').length,
  }), [posts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts
      .filter((p) => tab === 'all' || p.status === tab)
      .filter((p) => !q || p.title.toLowerCase().includes(q) || p.slug.includes(q));
  }, [posts, tab, search]);

  const replacePost = (updated: AdminBlogPost) => setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));

  const publish = async (post: AdminBlogPost) => {
    setActionError('');
    setNotice(null);
    setWarning('');
    const missing = missingForPublication(post);
    if (missing.length > 0) {
      setActionError(`Pour publier « ${post.title} », il manque : ${missing.join(', ')}. Ouvrez l'article pour le compléter.`);
      return;
    }
    setBusyId(post.id);
    const res = await setAdminBlogPostStatus(post.id, 'published');
    setBusyId(null);
    if (res.error || !res.post) { setActionError(res.error ?? 'Une erreur est survenue. Réessayez.'); return; }
    replacePost(res.post);
    setNotice({ title: `« ${res.post.title} » est publié.` });
  };

  const unpublish = async (post: AdminBlogPost) => {
    setBusyId(post.id);
    setActionError('');
    setWarning('');
    const res = await setAdminBlogPostStatus(post.id, 'unpublished');
    setBusyId(null);
    setConfirm(null);
    if (res.error || !res.post) { setActionError(res.error ?? 'Une erreur est survenue. Réessayez.'); return; }
    replacePost(res.post);
    setNotice({
      title: `« ${res.post.title} » est dépublié.`,
      detail: "Il n'est plus visible sur le site. La page optimisée pour les moteurs de recherche et le sitemap seront mis à jour dans l'heure.",
    });
  };

  const remove = async (post: AdminBlogPost) => {
    setBusyId(post.id);
    setActionError('');
    setNotice(null);
    const res = await deleteAdminBlogPost(post.id);
    setBusyId(null);
    setConfirm(null);
    if (res.error) { setActionError(res.error); return; }
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    setWarning(res.warning ?? '');
  };

  const iconButton = 'flex items-center gap-1.5 rounded-lg p-2 text-sm transition-colors disabled:opacity-40';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">Blog</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => navigate('/admin/blog/categories')} className="btn-outline px-4 py-2.5">
            <FolderCog size={16} /> Catégories
          </button>
          <button onClick={() => navigate('/admin/blog/nouveau')} disabled={Boolean(loadError)} className="btn-primary px-4 py-2.5">
            <Plus size={16} /> Nouvel article
          </button>
        </div>
      </div>

      {loadError && (
        <p className="flex items-start gap-2 rounded-lg bg-burgundy/5 p-4 text-sm text-burgundy"><AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> {loadError}</p>
      )}
      {notice && <SiteUpdateNotice title={notice.title} detail={notice.detail} onClose={() => setNotice(null)} />}
      {actionError && (
        <p className="flex items-start gap-2 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy"><AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> {actionError}</p>
      )}
      {warning && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{warning}</p>}

      {!loadError && (
        <>
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30" />
            <input className="input-field pl-10" placeholder="Rechercher un article" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="no-scrollbar flex gap-2 overflow-x-auto" role="tablist" aria-label="Filtrer par statut">
            {(Object.keys(tabLabels) as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`flex-shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'bg-burgundy text-white' : 'border border-line bg-white text-ink/60'}`}
              >
                {tabLabels[t]} <span className={tab === t ? 'text-white/70' : 'text-ink/35'}>({counts[t]})</span>
              </button>
            ))}
          </div>
        </>
      )}

      {loading ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : loadError ? null : filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-ink/45">{posts.length === 0 ? 'Aucun article pour le moment.' : 'Aucun article ne correspond.'}</p>
          {posts.length === 0 && categories.length === 0 && (
            <p className="mt-2 text-xs text-ink/40">Commencez par créer une catégorie : elle est nécessaire pour publier un article.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((post) => {
            const busy = busyId === post.id;
            return (
              <div key={post.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="aspect-[16/9] w-full flex-shrink-0 overflow-hidden rounded-lg bg-cream sm:w-32">
                  {post.coverImageUrl ? (
                    <SmartImage src={post.coverImageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-ink/25"><ImageOff size={20} /></div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink line-clamp-2">{post.title}</p>
                  <p className="mt-0.5 text-xs text-ink/45">
                    {post.categoryId ? (categoryName.get(post.categoryId) ?? 'Catégorie supprimée') : 'Sans catégorie'} · {dateLine(post)}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-ink/35">/blog/{post.slug}/</p>
                  <div className="mt-1.5"><StatusChip status={post.status} label={BLOG_STATUS_LABELS[post.status]} /></div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-1">
                  <button onClick={() => navigate(`/admin/blog/apercu/${post.id}`)} className={`${iconButton} text-ink/50 hover:bg-cream hover:text-ink`} title="Aperçu" aria-label="Aperçu">
                    <Eye size={16} /><span className="hidden md:inline">Aperçu</span>
                  </button>
                  <button onClick={() => navigate(`/admin/blog/modifier/${post.id}`)} className={`${iconButton} text-ink/50 hover:bg-cream hover:text-ink`} title="Modifier" aria-label="Modifier">
                    <Pencil size={16} /><span className="hidden md:inline">Modifier</span>
                  </button>
                  {post.status === 'published' && (
                    <a href={blogPostPath(post.slug)} target="_blank" rel="noopener noreferrer" className={`${iconButton} text-ink/50 hover:bg-cream hover:text-ink`} title="Voir en ligne" aria-label="Voir en ligne">
                      <ExternalLink size={16} />
                    </a>
                  )}
                  {post.status !== 'published' ? (
                    <button onClick={() => void publish(post)} disabled={busy} className={`${iconButton} text-green-700 hover:bg-green-50`} title="Publier" aria-label="Publier">
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}<span className="hidden md:inline">{post.status === 'unpublished' ? 'Republier' : 'Publier'}</span>
                    </button>
                  ) : (
                    <button onClick={() => setConfirm({ kind: 'unpublish', post })} disabled={busy} className={`${iconButton} text-orange-700 hover:bg-orange-50`} title="Dépublier" aria-label="Dépublier">
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <EyeOff size={16} />}<span className="hidden md:inline">Dépublier</span>
                    </button>
                  )}
                  {!post.publishedAt && (
                    <button onClick={() => setConfirm({ kind: 'delete', post })} disabled={busy} className={`${iconButton} text-red-600 hover:bg-red-50`} title="Supprimer" aria-label="Supprimer">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirm?.kind === 'delete' && (
        <ConfirmDialog
          title="Supprimer le brouillon"
          message={`« ${confirm.post.title} » et ses images seront supprimés définitivement. Cette action est irréversible.`}
          confirmLabel="Supprimer"
          danger
          busy={busyId === confirm.post.id}
          onConfirm={() => void remove(confirm.post)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'unpublish' && (
        <ConfirmDialog
          title="Dépublier l'article"
          message={`« ${confirm.post.title} » ne sera plus visible sur le site. Vous pourrez le republier à tout moment ; son adresse et sa date de publication seront conservées.`}
          confirmLabel="Dépublier"
          busy={busyId === confirm.post.id}
          onConfirm={() => void unpublish(confirm.post)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
