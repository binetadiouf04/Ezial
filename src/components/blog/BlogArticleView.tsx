import { ChevronRight, ArrowLeft, ShoppingBag } from 'lucide-react';
import MarkdownContent from '@/components/MarkdownContent';
import SmartImage from '@/components/SmartImage';
import { categories, categoryMap, type CategoryId } from '@/data/categories';
import { isBlogImageAllowed, type BlogCategoryRef, type BlogPostSummary } from '@/lib/supabaseBlog';
import BlogLink from './BlogLink';
import BlogPostCard from './BlogPostCard';
import {
  BLOG_AUTHOR_LABEL, BLOG_INDEX_PATH, blogCategoryPath, formatBlogDate, marketplaceLinkLabel, marketplaceLinkPath, showUpdatedDate,
} from './blogShared';

// The article itself — used by the public page (/blog/<slug>) and by the
// Ezial Pro preview, so what the admin previews is exactly what is published.

export interface BlogArticleData {
  title: string;
  excerpt: string | null;
  content: string;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  category: BlogCategoryRef | null;
  marketplaceLinks: string[];
  sources: string | null;
}

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(categories.map((c) => [c.id, c.label]));
const subcategoryLabel = (categoryId: string, subId: string) =>
  categoryMap[categoryId as CategoryId]?.subcategories.find((s) => s.id === subId)?.label;
const noImages = () => false;

export default function BlogArticleView({ post, related = [] }: { post: BlogArticleData; related?: BlogPostSummary[] }) {
  const links = post.marketplaceLinks
    .map((value) => ({ value, href: marketplaceLinkPath(value), label: marketplaceLinkLabel(value, CATEGORY_LABELS, subcategoryLabel) }))
    .filter((l): l is { value: string; href: string; label: string } => Boolean(l.href && l.label));

  return (
    <div className="container-pro py-6">
      <nav aria-label="Fil d'Ariane" className="mb-6">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs text-ink/40">
          <li><BlogLink href="/" className="hover:text-burgundy">Accueil</BlogLink></li>
          <li aria-hidden="true"><ChevronRight size={12} /></li>
          <li><BlogLink href={BLOG_INDEX_PATH} className="hover:text-burgundy">Blog</BlogLink></li>
          {post.category && (
            <>
              <li aria-hidden="true"><ChevronRight size={12} /></li>
              <li><BlogLink href={blogCategoryPath(post.category.slug)} className="hover:text-burgundy">{post.category.name}</BlogLink></li>
            </>
          )}
          <li aria-hidden="true"><ChevronRight size={12} /></li>
          <li className="text-ink/70 line-clamp-1" aria-current="page">{post.title}</li>
        </ol>
      </nav>

      <article className="mx-auto max-w-3xl">
        <header>
          {post.category && (
            <BlogLink href={blogCategoryPath(post.category.slug)} className="eyebrow hover:underline">{post.category.name}</BlogLink>
          )}
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-ink sm:text-4xl">{post.title}</h1>
          <p className="mt-3 text-sm text-ink/50">
            Par {BLOG_AUTHOR_LABEL}
            {post.publishedAt ? (
              <> · Publié le <time dateTime={post.publishedAt}>{formatBlogDate(post.publishedAt)}</time></>
            ) : (
              <> · Non publié</>
            )}
            {post.publishedAt && post.updatedAt && showUpdatedDate(post.publishedAt, post.updatedAt) && (
              <> · Mis à jour le <time dateTime={post.updatedAt}>{formatBlogDate(post.updatedAt)}</time></>
            )}
          </p>
        </header>

        {post.coverImageUrl && (
          <figure className="mt-6 overflow-hidden rounded-2xl bg-cream">
            <SmartImage src={post.coverImageUrl} alt={post.coverImageAlt ?? ''} loading="eager" fetchPriority="high" className="aspect-[16/9] w-full object-cover" />
          </figure>
        )}

        {post.excerpt && <p className="mt-6 text-lg leading-relaxed text-ink/75">{post.excerpt}</p>}

        <MarkdownContent source={post.content} isImageAllowed={isBlogImageAllowed} className="mt-6" />

        {post.sources && (
          <section className="mt-10 border-t border-line pt-6" aria-labelledby="blog-sources-title">
            <h2 id="blog-sources-title" className="text-xs font-semibold uppercase tracking-wider text-ink/45">Sources</h2>
            <MarkdownContent source={post.sources} isImageAllowed={noImages} className="mt-2 text-sm [&_p]:text-sm [&_li]:text-sm [&_p]:text-ink/60 [&_li]:text-ink/60" />
          </section>
        )}

        {links.length > 0 && (
          <section className="mt-10 rounded-2xl bg-cream p-5 sm:p-6" aria-labelledby="blog-marketplace-title">
            <h2 id="blog-marketplace-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
              <ShoppingBag size={16} className="text-burgundy" aria-hidden="true" /> À découvrir sur Ezial
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {links.map((l) => (
                <li key={l.value}><BlogLink href={l.href} className="chip hover:border-burgundy hover:text-burgundy">{l.label}</BlogLink></li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-10">
          <BlogLink href={BLOG_INDEX_PATH} className="inline-flex items-center gap-1.5 text-sm font-medium text-burgundy hover:underline">
            <ArrowLeft size={15} /> Tous les articles du blog
          </BlogLink>
        </p>
      </article>

      {related.length > 0 && (
        <section className="mt-14 border-t border-line pt-10" aria-labelledby="blog-related-title">
          <h2 id="blog-related-title" className="section-title mb-6">À lire aussi</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => <BlogPostCard key={p.id} post={p} headingLevel="h3" />)}
          </div>
        </section>
      )}
    </div>
  );
}
