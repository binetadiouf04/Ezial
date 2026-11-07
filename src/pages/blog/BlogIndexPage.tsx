import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { applyHeadTags, useNoIndex, SITE_URL, DEFAULT_OG_IMAGE } from '@/lib/seoHead';
import { fetchBlogCategoriesWithPosts, fetchPublishedBlogPosts, type BlogCategory, type BlogPostSummary } from '@/lib/supabaseBlog';
import BlogLink from '@/components/blog/BlogLink';
import BlogPostCard from '@/components/blog/BlogPostCard';
import BlogCategoryNav from '@/components/blog/BlogCategoryNav';
import BlogPagination from '@/components/blog/BlogPagination';
import {
  BLOG_INDEX_DESCRIPTION, BLOG_INDEX_PATH, BLOG_INDEX_TITLE, BLOG_INTRO, BLOG_NAME, BLOG_PAGE_SIZE, pageFromRoute, withPage,
} from '@/components/blog/blogShared';

interface ListState {
  loading: boolean;
  failed: boolean;
  posts: BlogPostSummary[];
  total: number;
  categories: BlogCategory[];
}

// /blog — every published article, most recent first, 12 per page.
export default function BlogIndexPage() {
  const { route } = useApp();
  const page = pageFromRoute(route);
  const [state, setState] = useState<ListState>({ loading: true, failed: false, posts: [], total: 0, categories: [] });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, failed: false }));
    Promise.all([fetchPublishedBlogPosts({ page }), fetchBlogCategoriesWithPosts()]).then(([postsRes, categoriesRes]) => {
      if (cancelled) return;
      setState({
        loading: false,
        failed: postsRes.failed,
        posts: postsRes.posts,
        total: postsRes.total,
        categories: categoriesRes.categories,
      });
    });
    return () => { cancelled = true; };
  }, [page]);

  const { loading, failed, posts, total, categories } = state;
  const totalPages = Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE));
  const empty = !loading && !failed && posts.length === 0;

  // An empty blog (or a page past the last one) stays out of search engines.
  useNoIndex(empty);

  useEffect(() => {
    if (loading) return;
    const title = page > 1 ? `${BLOG_INDEX_TITLE} — page ${page}` : BLOG_INDEX_TITLE;
    const canonical = `${SITE_URL}${withPage(BLOG_INDEX_PATH, page)}`;
    applyHeadTags({
      title, description: BLOG_INDEX_DESCRIPTION, canonical,
      ogTitle: title, ogDescription: BLOG_INDEX_DESCRIPTION, ogImage: DEFAULT_OG_IMAGE, ogType: 'website',
    });
  }, [loading, page]);

  return (
    <div className="container-pro py-6">
      <nav aria-label="Fil d'Ariane" className="mb-6">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs text-ink/40">
          <li><BlogLink href="/" className="hover:text-burgundy">Accueil</BlogLink></li>
          <li aria-hidden="true"><ChevronRight size={12} /></li>
          <li className="text-ink/70" aria-current="page">Blog</li>
        </ol>
      </nav>

      <header className="max-w-2xl">
        <h1 className="font-display text-3xl font-semibold leading-tight text-ink sm:text-4xl">{BLOG_NAME}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink/60 sm:text-base">{BLOG_INTRO}</p>
      </header>

      {categories.length > 0 && (
        <div className="mt-6">
          <BlogCategoryNav categories={categories} />
        </div>
      )}

      <div className="mt-8">
        {loading ? (
          <p className="py-16 text-center text-sm text-ink/45">Chargement des articles…</p>
        ) : failed ? (
          <p className="py-16 text-center text-sm text-ink/55">Les articles n'ont pas pu être chargés. Vérifiez votre connexion puis réessayez.</p>
        ) : posts.length === 0 ? (
          page > 1 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-ink/55">Cette page n'existe pas.</p>
              <BlogLink href={BLOG_INDEX_PATH} className="mt-4 inline-block text-sm font-medium text-burgundy hover:underline">Voir les derniers articles</BlogLink>
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-ink/55">Aucun article n'est publié pour le moment.</p>
          )
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((p, i) => <BlogPostCard key={p.id} post={p} priority={i < 3} />)}
            </div>
            <BlogPagination basePath={BLOG_INDEX_PATH} page={page} totalPages={totalPages} />
          </>
        )}
      </div>
    </div>
  );
}
