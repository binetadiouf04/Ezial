import type { ReactNode } from 'react';
import { parseInline, safeHref, type InlineNode } from '@/shared/markdown';

// Small building blocks of the institutional pages. Internal links are real
// <a href> (crawlable); InfoLayout intercepts their clicks to navigate inside
// the app without reloading.

export function InfoAnchor({ href, className = '', children, ariaLabel }: { href: string; className?: string; children: ReactNode; ariaLabel?: string }) {
  const target = safeHref(href);
  if (!target) return <span className={className}>{children}</span>;
  if (target.external) {
    return <a href={target.href} target="_blank" rel="noopener noreferrer" className={className} aria-label={ariaLabel}>{children}</a>;
  }
  return <a href={target.href} className={className} aria-label={ariaLabel}>{children}</a>;
}

function Nodes({ nodes, linkClassName }: { nodes: InlineNode[]; linkClassName: string }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.type === 'text') return <span key={i}>{n.value}</span>;
        if (n.type === 'strong') return <strong key={i} className="font-semibold"><Nodes nodes={n.children} linkClassName={linkClassName} /></strong>;
        if (n.type === 'em') return <em key={i}><Nodes nodes={n.children} linkClassName={linkClassName} /></em>;
        return <InfoAnchor key={i} href={n.href} className={linkClassName}><Nodes nodes={n.children} linkClassName={linkClassName} /></InfoAnchor>;
      })}
    </>
  );
}

/** Inline Markdown (bold, italic, links) of a card or step text. */
export default function InfoInline({ text, linkClassName = 'font-medium text-burgundy underline underline-offset-2 hover:opacity-80' }: { text: string; linkClassName?: string }) {
  return <Nodes nodes={parseInline(text)} linkClassName={linkClassName} />;
}
