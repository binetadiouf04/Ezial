import { RefreshCw } from 'lucide-react';
import { isSensitivePath } from '@/lib/appUpdateCore';
import { hasUnsavedChanges, isStandaloneDisplay, reloadPage } from '@/lib/pageRefresh';

// Entrée « Actualiser » des menus, pour l'application installée seulement
// (dans le navigateur, le bouton recharger de celui-ci suffit). Alternative
// accessible au geste « tirer vers le bas » (src/components/PullToRefresh.tsx).
// Absente au paiement, sur une commande ou une saisie vendeur ; demande
// confirmation si un formulaire a des modifications non enregistrées.
export default function RefreshMenuButton({ className, iconSize = 19, onDone }: {
  className: string;
  iconSize?: number;
  /** Ex. fermer le menu quand l'utilisateur annule. */
  onDone?: () => void;
}) {
  if (!isStandaloneDisplay() || isSensitivePath(window.location.pathname)) return null;
  const refresh = () => {
    if (hasUnsavedChanges() && !window.confirm('Vos modifications non enregistrées seront perdues. Actualiser quand même ?')) {
      onDone?.();
      return;
    }
    reloadPage();
  };
  return (
    <button type="button" onClick={refresh} className={className}>
      <RefreshCw size={iconSize} strokeWidth={1.5} className="text-ink/60" aria-hidden="true" />
      <span>Actualiser</span>
    </button>
  );
}
