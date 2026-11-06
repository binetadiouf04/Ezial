import { useEffect, useState } from 'react';
import { ArrowLeft, Pencil, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { usePro } from '../../ProContext';
import { StatusChip } from '../../components/StatusChip';
import { fetchAdminBlogPost, fetchAdminBlogCategories, BLOG_STATUS_LABELS, type AdminBlogPost, type AdminBlogCategory } from '@/lib/supabaseAdminBlog';
import { blogPostDescription, blogPostPath, blogPostTitle, truncateText } from '@/components/blog/blogShared';
import BlogArticleView from '@/components/blog/BlogArticleView';

// Preview of the saved version of an article, rendered by the same component
// as the public page (/blog/<slug>), drafts included.
export default function AdminBlogPreview({ postId }: { postId: string }) {
  const { navigate } = usePro();
  const [post, setPost] = useState<AdminBlogPost | null>(null);
  const [category, setCategory] = useState<AdminBlogCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([fetchAdminBlogPost(postId), fetchAdminBlogCategories()]).then(([postRes, catRes]) => {
      if (cancelled) return;
      setPost(postRes.post);
      setCategory(catRes.categories.find((c) => c.id === postRes.post?.categoryId) ?? null);
      setError(postRes.error ?? '');
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [postId]);

  if (loading) return <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>;

  if (error || !post) {
    return (
      <div className="space-y-4 py-10 text-center">
        {error ? (
          <p className="mx-auto flex max-w-lg items-start gap-2 rounded-lg bg-burgundy/5 p-4 text-left text-sm text-burgundy"><AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> {error}</p>
        ) : (
          <p className="text-sm text-ink/55">Article introuvable.</p>
        )}
        <button onClick={() => navigate('/admin/blog')} className="btn-outline">Retour au blog</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => navigate('/admin/blog')} className="flex items-center gap-1.5 text-sm text-ink/50 transition-colors hover:text-ink">
          <ArrowLeft size={16} /> Blog
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip status={post.status} size="md" label={BLOG_STATUS_LABELS[post.status]} />
          {post.status === 'published' && (
            <a href={blogPostPath(post.slug)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-burgundy hover:underline">
              <ExternalLink size={15} /> Voir en ligne
            </a>
          )}
          <button onClick={() => navigate(`/admin/blog/modifier/${post.id}`)} className="flex items-center gap-1.5 text-sm font-medium text-burgundy hover:underline">
            <Pencil size={15} /> Modifier
          </button>
        </div>
      </div>

      <p className="rounded-lg bg-cream p-3 text-xs text-ink/60">
        {post.status === 'published'
          ? 'Aperçu de la version enregistrée, telle qu’elle est en ligne.'
          : 'Aperçu de la version enregistrée. Cet article n’est pas visible du public.'}
      </p>

      <div className="rounded-xl border border-line bg-white p-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink/40">Aperçu dans Google</p>
        <p className="truncate text-xs text-ink/55">ezial.net › blog › {post.slug}</p>
        <p className="mt-1 line-clamp-2 text-lg leading-snug text-[#1a0dab]">{truncateText(blogPostTitle(post.seoTitle, post.title), 65)}</p>
        <p className="mt-1 line-clamp-2 text-sm text-ink/60">{blogPostDescription(post.metaDescription, post.excerpt) || 'Aucune description.'}</p>
      </div>

      <div className="-mx-4 overflow-hidden rounded-xl border border-line bg-white sm:mx-0">
        <BlogArticleView
          post={{
            title: post.title,
            excerpt: post.excerpt || null,
            content: post.content,
            coverImageUrl: post.coverImageUrl || null,
            coverImageAlt: post.coverImageAlt || null,
            publishedAt: post.publishedAt,
            updatedAt: post.updatedAt,
            category: category ? { id: category.id, name: category.name, slug: category.slug } : null,
            marketplaceLinks: post.marketplaceLinks,
            sources: post.sources || null,
          }}
        />
      </div>
    </div>
  );
}
