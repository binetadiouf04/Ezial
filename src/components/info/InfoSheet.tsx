import { useEffect, useMemo, type MouseEvent } from 'react';
import { X } from 'lucide-react';
import { getInfoPage, getInfoSegments } from '@/shared/infoPages';
import { Segments } from './InfoLayout';

// Page d'information (ex. conditions générales) affichée dans une fenêtre
// par-dessus la page en cours : le client la lit sans quitter son paiement,
// ni perdre ce qu'il a saisi. Même contenu que la page /info/<slug>.
export default function InfoSheet({ slug, onClose }: { slug: string; onClose: () => void }) {
  const page = getInfoPage(slug);
  const segments = useMemo(() => (page ? getInfoSegments(page) : []), [page]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [onClose]);

  if (!page) return null;

  // Les liens internes du texte s'ouvrent dans un nouvel onglet : le client
  // ne quitte jamais la page de paiement.
  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    if (!href.startsWith('/') || href.startsWith('//')) return;
    e.preventDefault();
    window.open(href, '_blank', 'noopener');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/50 sm:items-center sm:p-6" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={page.title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-h-[85vh] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold leading-snug text-ink">{page.title}</h2>
            {page.updated && <p className="mt-0.5 text-xs text-ink/50">Dernière mise à jour : {page.updated}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-ink/60 hover:bg-cream hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div onClickCapture={onClickCapture} className="flex-1 overflow-y-auto px-5 py-5">
          <Segments segments={segments} />
        </div>
        <div className="border-t border-line bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button type="button" onClick={onClose} className="btn-primary w-full">J’ai lu — retour au paiement</button>
        </div>
      </div>
    </div>
  );
}
