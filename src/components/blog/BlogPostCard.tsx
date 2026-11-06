import SmartImage from '@/components/SmartImage';
import type { BlogPostSummary } from '@/lib/supabaseBlog';
import BlogLink from './BlogLink';
import { blogPostPath, formatBlogDate } from './blogShared';

// Article card for the blog lists, the related articles and the homepage block.
export default function BlogPostCard({ post, headingLevel = 'h2', priority = false }: { post: BlogPostSummary; headingLevel?: 'h2' | 'h3'; priority?: boolean }) {
  const Heading = headingLevel;
  const href = blogPostPath(post.slug);
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-white transition-shadow hover:card-shadow">
      <BlogLink href={href} tabIndex={-1} ariaHidden className="block aspect-[16/9] overflow-hidden bg-cream">
        <SmartImage
          src={post.coverImageUrl ?? ''}
          alt={post.coverImageAlt ?? ''}
          loading={priority ? 'eager' : 'lazy'}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </BlogLink>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        {post.category && <p className="eyebrow mb-2">{post.category.name}</p>}
        <Heading className="font-display text-lg font-semibold leading-snug text-ink sm:text-xl">
          <BlogLink href={href} className="hover:text-burgundy transition-colors">{post.title}</BlogLink>
        </Heading>
        {post.excerpt && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink/60">{post.excerpt}</p>}
        <p className="mt-auto pt-4 text-xs text-ink/45">
          <time dateTime={post.publishedAt}>{formatBlogDate(post.publishedAt)}</time>
        </p>
      </div>
    </article>
  );
}
