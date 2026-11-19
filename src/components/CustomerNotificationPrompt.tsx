import { useEffect, useState } from 'react';
import { Bell, Check, Loader2, X } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { getPushSupportStatus, isDeviceRegisteredForUser, subscribeToPush } from '@/lib/supabasePush';

// Invitation à activer les notifications, pour l'acheteur connecté : une petite
// carte en bas de l'écran (jamais un écran bloquant), avec un bouton « Activer »
// qui ouvre la demande d'autorisation du téléphone, et « Plus tard ».
//
// Règles :
// - seulement quand l'appareil sait recevoir des notifications et que la
//   question n'a pas encore été tranchée (ni acceptée, ni refusée) ;
// - jamais pendant le paiement, ni sur une fiche produit (la barre d'achat
//   occupe le bas de l'écran) ;
// - « Plus tard » la masque 14 jours ;
// - sur iPhone, seulement dans l'application installée (iOS n'autorise pas
//   les notifications dans Safari) : sinon l'explication reste dans Mon compte.
const DISMISSED_KEY = 'ezial-notif-prompt-dismissed-at';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
const SHOW_AFTER_MS = 5000;

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

function rememberDismissal(): void {
  try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* sans stockage : réaffichée à la prochaine visite */ }
}

export default function CustomerNotificationPrompt() {
  const { customerUser, route } = useApp();
  const userId = customerUser?.id;
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(false);

  const path = route.split('?')[0];
  const blockedRoute = path === '/checkout' || path.startsWith('/produit/') || path.startsWith('/paiement');

  useEffect(() => {
    setReady(false);
    setDone(false);
    setError('');
    if (!userId || recentlyDismissed()) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const status = getPushSupportStatus();
        // « granted » : l'autorisation existe mais cet appareil n'est pas (ou plus) enregistré pour ce compte.
        const needed = status === 'default' || (status === 'granted' && !(await isDeviceRegisteredForUser()));
        if (!cancelled && needed) setReady(true);
      })();
    }, SHOW_AFTER_MS);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [userId]);

  if (!userId || !ready || hidden || blockedRoute) return null;

  const enable = async () => {
    setError('');
    setLoading(true);
    const result = await subscribeToPush(userId);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDone(true);
    window.setTimeout(() => setHidden(true), 2500);
  };

  const later = () => {
    rememberDismissal();
    setHidden(true);
  };

  return (
    <div
      role="dialog"
      aria-label="Activer les notifications"
      className="fixed left-4 right-4 z-[60] mx-auto max-w-sm rounded-2xl border border-line bg-white p-4 shadow-xl sm:left-auto sm:right-6"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
    >
      {done ? (
        <p className="flex items-center gap-2 text-sm font-medium text-ink"><Check size={16} className="text-burgundy" /> Notifications activées. Merci !</p>
      ) : (
        <>
          <button onClick={later} aria-label="Fermer" className="absolute right-2 top-2 rounded-full p-1.5 text-ink/40 hover:text-ink"><X size={16} /></button>
          <div className="flex items-start gap-3 pr-6">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-burgundy/10 text-burgundy"><Bell size={18} /></span>
            <div>
              <p className="text-sm font-semibold text-ink">Suivez vos commandes en direct</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink/60">Recevez une notification quand votre commande est confirmée, préparée et en cours de livraison.</p>
            </div>
          </div>
          {error && <p className="mt-2 text-xs text-burgundy">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button onClick={() => void enable()} disabled={loading} className="btn-primary flex-1 !py-2 text-sm">
              {loading ? <Loader2 size={15} className="mx-auto animate-spin" /> : 'Activer'}
            </button>
            <button onClick={later} className="rounded-lg px-3 py-2 text-sm text-ink/60 hover:text-ink">Plus tard</button>
          </div>
        </>
      )}
    </div>
  );
}
