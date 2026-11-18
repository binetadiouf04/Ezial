import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { applyUpdate, canOfferUpdateHere, dismissUpdate, isUpdateDismissed, onUpdateAvailable } from '@/lib/appUpdate';

// Bandeau discret « Nouvelle version disponible ». Jamais de rechargement
// automatique : l'utilisateur choisit le moment. Masqué pendant un paiement,
// une commande ou une saisie importante (voir isSensitivePath), et pour la
// session si l'utilisateur choisit « Plus tard ».
export default function UpdateBanner() {
  const [build, setBuild] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => onUpdateAvailable(setBuild), []);

  // La page change sans recharger (navigation interne) : on réévalue
  // régulièrement si l'endroit permet de proposer la mise à jour.
  useEffect(() => {
    if (!build) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 2000);
    const onPop = () => setTick((t) => t + 1);
    window.addEventListener('popstate', onPop);
    return () => { window.clearInterval(id); window.removeEventListener('popstate', onPop); };
  }, [build]);

  if (!build || isUpdateDismissed(build) || !canOfferUpdateHere()) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-burgundy px-4 py-3 text-white shadow-lg sm:inset-x-auto sm:right-5"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
    >
      <RefreshCw size={18} className="flex-shrink-0 opacity-80" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm leading-snug">Une nouvelle version d’Ezial est disponible.</p>
      <button
        type="button"
        onClick={applyUpdate}
        className="flex-shrink-0 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-burgundy hover:bg-cream"
      >
        Mettre à jour
      </button>
      <button
        type="button"
        onClick={() => dismissUpdate(build)}
        aria-label="Plus tard"
        title="Plus tard"
        className="flex-shrink-0 rounded-full p-1 text-white/70 hover:text-white"
      >
        <X size={16} />
      </button>
    </div>
  );
}
