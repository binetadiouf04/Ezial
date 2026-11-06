import { useEffect, useState } from 'react';
import { applyHeadTags, absoluteUrl, useNoIndex, SITE_URL, DEFAULT_OG_IMAGE } from '@/lib/seoHead';
import { fetchBlogPostBySlug, fetchRelatedBlogPosts, type BlogPost, type BlogPostSummary } from '@/lib/supabaseBlog';
import BlogArticleView from '@/components/blog/BlogArticleView';
import BlogLink from '@/components/blog/BlogLink';
import { BLOG_INDEX_PATH, blogPostDescription, blogPostPath, blogPostTitle } from '@/components/blog/blogShared';

// /blog/<slug> — one published article. Not found, not published yet or
// unpublished: "Article introuvable" + noindex.
export default function BlogPostPage({ slug: rawSlug }: { slug?: string }) {
  const slug = (rawSlug ?? '').toLowerCase();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [post, setPost] = useState<BlogPost | null>(null);
  const [related, setRelated] = useState<BlogPostSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setPost(null);
    setRelated([]);
    fetchBlogPostBySlug(slug).then((res) => {
      if (cancelled) return;
      setPost(res.post);
      setFailed(res.failed);
      setLoading(false);
      if (res.post) {
        void fetchRelatedBlogPosts(res.post, 3).then((list) => { if (!cancelled) setRelated(list); });
      }
    });
    return () => { cancelled = true; };
  }, [slug]);

  useNoIndex(!loading && !failed && !post);

  useEffect(() => {
    if (!post) return;
    const title = blogPostTitle(post.seoTitle, post.title);
    const description = blogPostDescription(post.metaDescription, post.excerpt);
    const image = post.ogImageUrl || post.coverImageUrl;
    applyHeadTags({
      title, description, canonical: `${SITE_URL}${blogPostPath(post.slug)}`,
      ogTitle: title, ogDescription: description, ogImage: image ? absoluteUrl(image) : DEFAULT_OG_IMAGE, ogType: 'article',
    });
  }, [post]);

  if (loading) return <div className="container-pro py-20 text-center text-sm text-ink/45">Chargement de l'article…</div>;
  if (failed) return <div className="container-pro py-20 text-center text-sm text-ink/55">L'article n'a pas pu être chargé. Vérifiez votre connexion puis réessayez.</div>;
  if (!post) {
    return (
      <div className="container-pro py-20 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink">Article introuvable</h1>
        <p className="mt-2 text-sm text-ink/55">Cet article n'existe pas ou n'est plus publié.</p>
        <BlogLink href={BLOG_INDEX_PATH} className="mt-5 inline-block text-sm font-medium text-burgundy hover:underline">Voir les articles du blog</BlogLink>
      </div>
    );
  }

  return <BlogArticleView post={post} related={related} />;
}
