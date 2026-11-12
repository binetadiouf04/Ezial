import { ArrowLeft } from 'lucide-react';
import { useApp } from '@/store/AppContext';

// Bouton « Retour » unique et identique sur toutes les pages du site (sauf
// l'accueil, le paiement et la confirmation de commande, qui ont le leur) :
// revient à la page précédente du site ; sans page précédente (arrivée
// directe depuis un moteur de recherche), mène à l'accueil.
export default function BackBar() {
  const { goBack, canGoBack } = useApp();
  return (
    <div className="container-pro pt-3">
      <button
        type="button"
        onClick={() => goBack('/')}
        className="inline-flex items-center gap-1.5 rounded-full py-1.5 pr-3 text-sm font-medium text-ink/60 transition-colors hover:text-ink"
        aria-label={canGoBack ? 'Retour à la page précédente' : 'Retour à l’accueil'}
      >
        <ArrowLeft size={16} aria-hidden="true" /> {canGoBack ? 'Retour' : 'Accueil'}
      </button>
    </div>
  );
}
