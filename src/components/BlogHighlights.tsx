import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { fetchLatestBlogPosts, type BlogPostSummary } from '@/lib/supabaseBlog';
import BlogLink from '@/components/blog/BlogLink';
import BlogPostCard from '@/components/blog/BlogPostCard';
import { BLOG_INDEX_PATH } from '@/components/blog/blogShared';

// "Conseils & tendances": the 3 latest published blog articles, for the
// homepage. Renders nothing while loading, when no article is published, or
// on any error (missing table included) — never an empty block.
export default function BlogHighlights() {
  const [posts, setPosts] = useState<BlogPostSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchLatestBlogPosts(3).then(({ posts: latest, failed }) => {
      if (!cancelled && !failed) setPosts(latest);
    }).catch(() => { /* nothing shown */ });
    return () => { cancelled = true; };
  }, []);

  if (posts.length === 0) return null;

  return (
    <section aria-labelledby="blog-highlights-title">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <p className="eyebrow mb-1.5">Le blog Ezial</p>
          <h2 id="blog-highlights-title" className="section-title">Conseils & tendances</h2>
        </div>
        <BlogLink href={BLOG_INDEX_PATH} className="flex items-center gap-1 whitespace-nowrap text-sm font-medium text-burgundy hover:underline">
          Voir le blog <ChevronRight size={15} />
        </BlogLink>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {posts.map((p) => <BlogPostCard key={p.id} post={p} headingLevel="h3" />)}
      </div>
    </section>
  );
}
