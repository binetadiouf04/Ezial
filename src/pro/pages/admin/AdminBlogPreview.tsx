import { usePro } from '../../ProContext';
import { formatDate } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { ArrowLeft, Pencil } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

const blogStatusLabels: Record<string, string> = { draft: 'Brouillon', scheduled: 'Programmé', published: 'Publié', unpublished: 'Dépublié' };

export default function AdminBlogPreview({ postId }: { postId: string }) {
  const { navigate, blogPosts } = usePro();
  const post = blogPosts.find((p) => p.id === postId);

  if (!post) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-ink/55">Article introuvable</p>
        <button onClick={() => navigate('/admin/blog')} className="btn-outline mt-4">Retour</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button onClick={() => navigate('/admin/blog')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors">
          <ArrowLeft size={16} /> Blog
        </button>
        <div className="flex items-center gap-2">
          <StatusChip status={post.status} size="md" label={blogStatusLabels[post.status]} />
          <button onClick={() => navigate(`/admin/blog/modifier/${post.id}`)} className="flex items-center gap-1.5 text-sm font-medium text-burgundy hover:underline">
            <Pencil size={15} /> Modifier
          </button>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden bg-cream h-56 sm:h-80">
        <SmartImage src={post.coverImage} alt={post.title} className="h-full w-full object-cover" />
      </div>

      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <p className="eyebrow mb-2">{post.category}</p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-ink leading-tight">{post.title}</h1>
          <p className="mt-2 text-sm text-ink/45">
            Par {post.author} · {formatDate(post.publishDate)}
            {post.updatedDate && post.updatedDate !== post.publishDate && ` · mis à jour le ${formatDate(post.updatedDate)}`}
          </p>
        </div>

        <p className="text-base text-ink/70 font-medium italic border-l-2 border-burgundy pl-4">{post.excerpt}</p>

        <div className="text-sm text-ink/75 leading-relaxed whitespace-pre-wrap">{post.content}</div>

        {post.sources && (
          <div className="pt-4 border-t border-line">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/40 mb-1.5">Sources</p>
            <p className="text-xs text-ink/50 whitespace-pre-wrap">{post.sources}</p>
          </div>
        )}

        {(post.seoTitle || post.metaDescription) && (
          <div className="pt-4 border-t border-line space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Aperçu SEO</p>
            <p className="text-sm text-blue-700">{post.seoTitle || post.title}</p>
            <p className="text-xs text-ink/50">{post.metaDescription || post.excerpt}</p>
          </div>
        )}
      </div>
    </div>
  );
}
