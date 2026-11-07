import { useEffect, useState, type MouseEvent } from 'react';
import { ChevronDown, List } from 'lucide-react';
import type { MarkdownHeading } from '@/shared/markdown';

// Table of contents built from the page's ## headings: a sticky sidebar from
// 1024 px, a collapsible panel above the text below that. The link of the
// section being read is highlighted while scrolling.

// Below the sticky header (64 px, 113 px from lg) with some breathing room.
const ACTIVE_OFFSET = 150;

function useActiveHeading(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const key = ids.join('|');

  useEffect(() => {
    const list = key ? key.split('|') : [];
    if (list.length === 0) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let current = list[0];
        for (const id of list) {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top <= ACTIVE_OFFSET) current = id;
        }
        // At the very bottom, the last sections can never reach the offset.
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = list[list.length - 1];
        setActive(current);
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [key]);

  return active;
}

export default function InfoToc({ headings }: { headings: MarkdownHeading[] }) {
  const ids = headings.map((h) => h.id);
  const active = useActiveHeading(ids);
  const [open, setOpen] = useState(false);

  if (headings.length < 2) return null;

  const goTo = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setOpen(false);
    // Scroll once the panel has closed, otherwise the target moves up by
    // the panel's height after the scroll position was computed.
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 30);
  };

  const links = (variant: 'side' | 'panel') => (
    <ol className={variant === 'side' ? 'space-y-0.5 border-l border-line' : 'space-y-0.5'}>
      {headings.map((h) => {
        const isActive = h.id === active;
        const base = variant === 'side'
          ? `-ml-px block border-l-2 py-1.5 pl-4 pr-2 text-sm leading-snug transition-colors ${isActive ? 'border-burgundy font-medium text-burgundy' : 'border-transparent text-ink/60 hover:border-ink/25 hover:text-ink'}`
          : `block rounded-lg px-3 py-2.5 text-[15px] leading-snug transition-colors ${isActive ? 'bg-burgundy/5 font-medium text-burgundy' : 'text-ink/70 hover:bg-cream'}`;
        return (
          <li key={h.id}>
            <a href={`?section=${h.id}`} onClick={(e) => goTo(e, h.id)} className={base} aria-current={isActive ? 'location' : undefined}>{h.text}</a>
          </li>
        );
      })}
    </ol>
  );

  return (
    <>
      {/* Tablet and phone: collapsible panel above the text. */}
      <nav aria-label="Sommaire" className="mb-8 rounded-2xl border border-line bg-white lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="info-toc-panel"
          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left sm:px-5"
        >
          <span className="flex items-center gap-2.5 text-[15px] font-semibold text-ink">
            <List size={18} className="text-burgundy" aria-hidden="true" /> Sommaire
            <span className="text-sm font-normal text-ink/45">({headings.length} sections)</span>
          </span>
          <ChevronDown size={18} className={`flex-shrink-0 text-ink/50 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        <div id="info-toc-panel" hidden={!open} className="border-t border-line px-2 py-2 sm:px-3">
          {links('panel')}
        </div>
      </nav>

      {/* Desktop: sticky sidebar. */}
      <aside className="hidden lg:block">
        <nav aria-label="Sommaire" className="sticky top-32 max-h-[calc(100vh-9rem)] overflow-y-auto pb-6 pr-2">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">Sommaire</p>
          {links('side')}
        </nav>
      </aside>
    </>
  );
}
