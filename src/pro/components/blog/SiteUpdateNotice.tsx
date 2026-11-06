import { useState } from 'react';
import { CheckCircle2, RefreshCw, Loader2, X, AlertCircle } from 'lucide-react';
import { requestBlogSiteUpdate } from '@/lib/supabaseAdminBlog';

export const PUBLISHED_SEO_MESSAGE = 'En ligne immédiatement ; page optimisée pour les moteurs de recherche et sitemap mis à jour dans l’heure.';

// Shown after a publication (or a change to a published article): the
// article is live at once; the static SEO pages and the sitemap follow within
// the hour, or right away with "Mettre à jour le site maintenant".
export default function SiteUpdateNotice({ title, detail = PUBLISHED_SEO_MESSAGE, onClose }: { title: string; detail?: string; onClose?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(await requestBlogSiteUpdate());
    setBusy(false);
  };

  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-4" role="status">
      <div className="flex items-start gap-3">
        <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-green-700" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-green-900">{title}</p>
          <p className="mt-0.5 text-sm text-green-900/80">{detail}</p>
          <button
            onClick={() => void run()}
            disabled={busy || result?.ok === true}
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-900 transition-colors hover:bg-green-100 disabled:opacity-60"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Mettre à jour le site maintenant
          </button>
          {result && (
            <p className={`mt-2 flex items-start gap-1.5 text-xs ${result.ok ? 'text-green-900/80' : 'text-burgundy'}`}>
              {!result.ok && <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />} {result.message}
            </p>
          )}
        </div>
        {onClose && <button onClick={onClose} aria-label="Fermer" className="flex-shrink-0"><X size={16} className="text-green-900/50" /></button>}
      </div>
    </div>
  );
}
