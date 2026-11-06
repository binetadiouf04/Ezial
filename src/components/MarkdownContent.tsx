import { useMemo, type ReactNode } from 'react';
import { navigateTo } from '@/store/AppContext';
import { parseMarkdown, type InlineNode, type MarkdownBlock, type MarkdownOptions } from '@/shared/markdown';

// Renders the restricted Markdown of src/shared/markdown.js as React elements
// (never innerHTML). Same parser as the static SEO build, so the crawlable
// HTML and what visitors see stay identical.

function Inline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.type === 'text') return <span key={i}>{n.value}</span>;
        if (n.type === 'strong') return <strong key={i} className="font-semibold text-ink"><Inline nodes={n.children} /></strong>;
        if (n.type === 'em') return <em key={i}><Inline nodes={n.children} /></em>;
        if (n.external) {
          return (
            <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow" className="text-burgundy underline underline-offset-2 hover:opacity-80">
              <Inline nodes={n.children} />
            </a>
          );
        }
        const internal = n.href.startsWith('/');
        const anchor = n.href.startsWith('#');
        return (
          <a
            key={i}
            href={n.href}
            onClick={internal || anchor ? (e) => {
              e.preventDefault();
              if (internal) navigateTo(n.href);
              else document.getElementById(n.href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } : undefined}
            className="text-burgundy underline underline-offset-2 hover:opacity-80"
          >
            <Inline nodes={n.children} />
          </a>
        );
      })}
    </>
  );
}

function Block({ block }: { block: MarkdownBlock }): ReactNode {
  switch (block.type) {
    case 'heading':
      return block.level === 2 ? (
        <h2 id={block.id} className="scroll-mt-28 font-display text-xl font-semibold text-ink sm:text-2xl mt-10 mb-3 first:mt-0"><Inline nodes={block.children} /></h2>
      ) : (
        <h3 id={block.id} className="scroll-mt-28 text-base font-semibold text-ink sm:text-lg mt-7 mb-2"><Inline nodes={block.children} /></h3>
      );
    case 'paragraph':
      return <p className="mt-3 first:mt-0 text-[15px] leading-relaxed text-ink/75 sm:text-base"><Inline nodes={block.children} /></p>;
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag className={`mt-3 space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink/75 sm:text-base ${block.ordered ? 'list-decimal' : 'list-disc'} marker:text-burgundy/60`}>
          {block.items.map((item, i) => <li key={i} className="pl-1"><Inline nodes={item} /></li>)}
        </Tag>
      );
    }
    case 'quote':
      return <blockquote className="mt-4 border-l-4 border-burgundy/30 bg-cream/60 py-2 pl-4 pr-3 text-[15px] italic leading-relaxed text-ink/70 sm:text-base"><Inline nodes={block.children} /></blockquote>;
    case 'image':
      return (
        <figure className="mt-6">
          <img src={block.src} alt={block.alt} loading="lazy" className="w-full rounded-xl object-cover" />
        </figure>
      );
    case 'hr':
      return <hr className="my-8 border-line" />;
    default:
      return null;
  }
}

export interface MarkdownContentProps extends MarkdownOptions {
  source: string;
  className?: string;
}

export default function MarkdownContent({ source, className = '', isImageAllowed }: MarkdownContentProps) {
  const { blocks } = useMemo(() => parseMarkdown(source, { isImageAllowed }), [source, isImageAllowed]);
  return (
    <div className={className}>
      {blocks.map((b, i) => <Block key={i} block={b} />)}
    </div>
  );
}
