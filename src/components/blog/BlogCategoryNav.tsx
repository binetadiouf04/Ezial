import type { BlogCategoryRef } from '@/lib/supabaseBlog';
import BlogLink from './BlogLink';
import { BLOG_INDEX_PATH, blogCategoryPath } from './blogShared';

// "Tous les articles" + one link per category that has published articles.
export default function BlogCategoryNav({ categories, activeSlug }: { categories: BlogCategoryRef[]; activeSlug?: string }) {
  if (categories.length === 0) return null;
  return (
    <nav aria-label="Catégories du blog" className="flex flex-wrap gap-2">
      <BlogLink href={BLOG_INDEX_PATH} className={`chip ${activeSlug ? 'hover:border-ink/30' : 'chip-active'}`} ariaCurrent={activeSlug ? undefined : 'page'}>
        Tous les articles
      </BlogLink>
      {categories.map((c) => (
        <BlogLink
          key={c.id}
          href={blogCategoryPath(c.slug)}
          className={`chip ${activeSlug === c.slug ? 'chip-active' : 'hover:border-ink/30'}`}
          ariaCurrent={activeSlug === c.slug ? 'page' : undefined}
        >
          {c.name}
        </BlogLink>
      ))}
    </nav>
  );
}
