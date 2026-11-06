import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { applyHeadTags, useNoIndex, SITE_URL, DEFAULT_OG_IMAGE } from '@/lib/seoHead';
import {
  fetchBlogCategoriesWithPosts, fetchBlogCategoryBySlug, fetchPublishedBlogPosts, type BlogCategory, type BlogPostSummary,
} from '@/lib/supabaseBlog';
import BlogLink from '@/components/blog/BlogLink';
import BlogPostCard from '@/components/blog/BlogPostCard';
import BlogCategoryNav from '@/components/blog/BlogCategoryNav';
import BlogPagination from '@/components/blog/BlogPagination';
import {
  BLOG_INDEX_PATH, BLOG_PAGE_SIZE, blogCategoryDescription, blogCategoryPath, blogCategoryTitle, pageFromRoute, withPage,
} from '@/components/blog/blogShared';

interface CategoryState {
  loading: boolean;
  failed: boolean;
  category: BlogCategory | null;
  posts: BlogPostSummary[];
  total: number;
  categories: BlogCategory[];
}

// /blog/categorie/<slug> — published articles of one category. A category
// that does not exist or has no published article is "introuvable" (noindex).
export default function BlogCategoryPage({ slug: rawSlug }: { slug?: string }) {
  const { route } = useApp();
  const slug = (rawSlug ?? '').toLowerCase();
  const page = pageFromRoute(route);
  const [state, setState] = useState<CategoryState>({ loading: true, failed: false, category: null, posts: [], total: 0, categories: [] });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, failed: false }));
    (async () => {
      const [categoryRes, categoriesRes] = await Promise.all([fetchBlogCategoryBySlug(slug), fetchBlogCategoriesWithPosts()]);
      if (cancelled) return;
      if (categoryRes.failed || !categoryRes.category) {
        setState({ loading: false, failed: categoryRes.failed, category: null, posts: [], total: 0, categories: categoriesRes.categories });
        return;
      }
      const postsRes = await fetchPublishedBlogPosts({ page, categoryId: categoryRes.category.id });
      if (cancelled) return;
      setState({
        loading: false,
        failed: postsRes.failed,
        category: categoryRes.category,
        posts: postsRes.posts,
        total: postsRes.total,
        categories: categoriesRes.categories,
      });
    })();
    return () => { cancelled = true; };
  }, [slug, page]);

  const { loading, failed, category, posts, total, categories } = state;
  const notFound = !loading && !failed && (!category || posts.length === 0);
  const totalPages = Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE));

  useNoIndex(notFound);

  useEffect(() => {
    if (loading || !category || posts.length === 0) return;
    const baseTitle = blogCategoryTitle(category.name);
    const title = page > 1 ? `${baseTitle} — page ${page}` : baseTitle;
    const description = blogCategoryDescription(category.name, category.description);
    applyHeadTags({
      title, description, canonical: `${SITE_URL}${withPage(blogCategoryPath(category.slug), page)}`,
      ogTitle: title, ogDescription: description, ogImage: DEFAULT_OG_IMAGE, ogType: 'website',
    });
  }, [loading, category, posts.length, page]);

  return (
    <div className="container-pro py-6">
      <nav aria-label="Fil d'Ariane" className="mb-6">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs text-ink/40">
          <li><BlogLink href="/" className="hover:text-burgundy">Accueil</BlogLink></li>
          <li aria-hidden="true"><ChevronRight size={12} /></li>
          <li><BlogLink href={BLOG_INDEX_PATH} className="hover:text-burgundy">Blog</BlogLink></li>
          {category && posts.length > 0 && (
            <>
              <li aria-hidden="true"><ChevronRight size={12} /></li>
              <li className="text-ink/70" aria-current="page">{category.name}</li>
            </>
          )}
        </ol>
      </nav>

      {loading ? (
        <p className="py-16 text-center text-sm text-ink/45">Chargement des articles…</p>
      ) : failed ? (
        <p className="py-16 text-center text-sm text-ink/55">Les articles n'ont pas pu être chargés. Vérifiez votre connexion puis réessayez.</p>
      ) : notFound || !category ? (
        <div className="py-16 text-center">
          <h1 className="font-display text-2xl font-semibold text-ink">Catégorie introuvable</h1>
          <p className="mt-2 text-sm text-ink/55">{page > 1 && category ? "Cette page n'existe pas." : "Cette catégorie n'existe pas ou ne contient aucun article publié."}</p>
          <BlogLink href={BLOG_INDEX_PATH} className="mt-5 inline-block text-sm font-medium text-burgundy hover:underline">Voir tous les articles du blog</BlogLink>
        </div>
      ) : (
        <>
          <header className="max-w-2xl">
            <p className="eyebrow mb-2">Blog Ezial</p>
            <h1 className="font-display text-3xl font-semibold leading-tight text-ink sm:text-4xl">{category.name}</h1>
            {category.description && <p className="mt-3 text-[15px] leading-relaxed text-ink/60 sm:text-base">{category.description}</p>}
          </header>
          {categories.length > 1 && (
            <div className="mt-6">
              <BlogCategoryNav categories={categories} activeSlug={category.slug} />
            </div>
          )}
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p, i) => <BlogPostCard key={p.id} post={p} priority={i < 3} />)}
          </div>
          <BlogPagination basePath={blogCategoryPath(category.slug)} page={page} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}
