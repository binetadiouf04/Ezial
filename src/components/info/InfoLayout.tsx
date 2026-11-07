import { useEffect, useMemo, type MouseEvent } from 'react';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import MarkdownContent from '@/components/MarkdownContent';
import { getInfoHeadings, getInfoSegments, type InfoPageDef, type InfoSegment } from '@/shared/infoPages';
import InfoBlockView from './InfoBlocks';
import InfoToc from './InfoToc';

// Shared template of the institutional pages: a light cream band (breadcrumb,
// H1, introduction, update date) then the body, aligned on the header
// (container-pro). Three layouts:
//  - legal:   table of contents (sticky sidebar ≥ 1024 px, collapsible panel
//             below) + a reading column of about 70 characters;
//  - simple:  short pages, text and card grids using the full width;
//  - pricing: seller plans, centred header and wide components.

function Breadcrumb({ label, centered }: { label: string; centered: boolean }) {
  return (
    <nav aria-label="Fil d’Ariane">
      <ol className={`flex flex-wrap items-center gap-1 text-sm text-ink/50 ${centered ? 'justify-center' : ''}`}>
        <li><a href="/" className="hover:text-ink hover:underline">Accueil</a></li>
        <li aria-hidden="true"><ChevronRight size={14} className="text-ink/35" /></li>
        <li aria-current="page" className="text-ink/75">{label}</li>
      </ol>
    </nav>
  );
}

function PageHeader({ page }: { page: InfoPageDef }) {
  const centered = page.layout === 'pricing';
  return (
    <div className="border-b border-line bg-cream">
      <div className={`container-pro py-7 sm:py-10 lg:py-12 ${centered ? 'text-center' : ''}`}>
        <Breadcrumb label={page.breadcrumb ?? page.title} centered={centered} />
        <h1 className={`mt-4 max-w-3xl font-display text-3xl font-semibold leading-tight lining-nums tracking-tightish text-ink sm:text-4xl lg:text-[2.75rem] ${centered ? 'mx-auto' : ''}`}>
          {page.title}
        </h1>
        {page.intro && (
          <p className={`mt-3 max-w-3xl text-base leading-relaxed text-ink/65 sm:mt-4 sm:text-lg ${centered ? 'mx-auto' : ''}`}>{page.intro}</p>
        )}
        {page.updated && (
          <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-ink/50">
            <CalendarDays size={14} aria-hidden="true" /> Dernière mise à jour : {page.updated}
          </p>
        )}
      </div>
    </div>
  );
}

// Gap before a segment: more room before a new section (## heading).
function segmentSpacing(segment: InfoSegment, index: number): string {
  if (index === 0) return '';
  if (segment.type === 'markdown' && /^#{1,2}\s/.test(segment.markdown)) return 'mt-12 sm:mt-14';
  return 'mt-6';
}

// Markdown children (paragraphs, lists, headings) keep a comfortable line
// length even when the segment spans the full width (cards next to them).
const PROSE_WIDTH = '[&>*]:max-w-3xl';

function Segments({ segments }: { segments: InfoSegment[] }) {
  return (
    <>
      {segments.map((segment, i) => (
        <div key={segment.type === 'block' ? segment.id : `md-${i}`} className={segmentSpacing(segment, i)}>
          {segment.type === 'markdown'
            ? <MarkdownContent source={segment.markdown} className={PROSE_WIDTH} />
            : <InfoBlockView block={segment.block} />}
        </div>
      ))}
    </>
  );
}

export default function InfoLayout({ page, section }: { page: InfoPageDef; section: string | null }) {
  const { navigate } = useApp();
  const segments = useMemo(() => getInfoSegments(page), [page]);
  const headings = useMemo(() => getInfoHeadings(page).filter((h) => h.level === 2), [page]);
  const layout = page.layout ?? 'simple';

  // ?section=<id> (links between pages): scroll to that section once the
  // page is rendered — after the scroll-to-top of the navigation itself.
  useEffect(() => {
    if (!section) return;
    const timer = window.setTimeout(() => {
      document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [page.slug, section]);

  // Every internal link of the page is a real <a href> (crawlable, opens in
  // a new tab with Ctrl/Cmd); a plain click navigates inside the app.
  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor || anchor.target === '_blank') return;
    const href = anchor.getAttribute('href') ?? '';
    if (!href.startsWith('/') || href.startsWith('//')) return;
    e.stopPropagation();
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
  };

  return (
    <div onClickCapture={onClickCapture} className="pb-16 sm:pb-20">
      <PageHeader page={page} />

      {layout === 'legal' && (
        <div className="container-pro pt-8 sm:pt-10 lg:pt-14">
          <div className="mx-auto max-w-3xl lg:mx-0 lg:grid lg:max-w-none lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-14 xl:grid-cols-[250px_minmax(0,1fr)] xl:gap-20">
            {page.toc ? <InfoToc headings={headings} /> : <div className="hidden lg:block" />}
            <div className="min-w-0 lg:max-w-[72ch]">
              <Segments segments={segments} />
            </div>
          </div>
        </div>
      )}

      {layout === 'simple' && (
        <div className="container-pro pt-8 sm:pt-10 lg:pt-12">
          <Segments segments={segments} />
        </div>
      )}

      {layout === 'pricing' && (
        <div className="container-pro pt-8 sm:pt-10 lg:pt-12">
          <div className="mx-auto max-w-5xl">
            <Segments segments={segments} />
          </div>
        </div>
      )}
    </div>
  );
}
