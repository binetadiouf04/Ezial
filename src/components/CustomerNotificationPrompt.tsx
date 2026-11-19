import { useEffect, useState } from 'react';
import { Bell, Check, Loader2, MessageCircle, X } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { getPushSupportStatus, isDeviceRegisteredForUser, subscribeToPush } from '@/lib/supabasePush';
import { getMyWhatsAppConsent, setMyWhatsAppConsent } from '@/lib/supabaseWhatsApp';

// Invitation à activer les notifications, pour l'acheteur connecté : une petite
// carte en bas de l'écran (jamais un écran bloquant), avec un bouton « Activer »
// et « Plus tard ». Deux étapes, l'une après l'autre : les notifications du
// téléphone (demande d'autorisation du téléphone), puis les messages WhatsApp
// (consentement explicite, désactivé par défaut). Chaque étape ne s'affiche que
// si elle est utile : WhatsApp est proposé même quand le téléphone ne sait pas
// recevoir de notifications.
//
// Règles :
// - notifications du téléphone : seulement quand l'appareil sait en recevoir et
//   que la question n'a pas encore été tranchée (ni acceptée, ni refusée) ;
// - WhatsApp : seulement si le module est installé et le consentement pas donné ;
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

type Step = 'push' | 'whatsapp';

export default function CustomerNotificationPrompt() {
  const { customerUser, route } = useApp();
  const userId = customerUser?.id;
  const [steps, setSteps] = useState<Step[]>([]);
  const [current, setCurrent] = useState<Step | null>(null);
  const [done, setDone] = useState<Step | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(false);

  const path = route.split('?')[0];
  const blockedRoute = path === '/checkout' || path.startsWith('/produit/') || path.startsWith('/paiement');

  useEffect(() => {
    setSteps([]);
    setCurrent(null);
    setDone(null);
    setError('');
    if (!userId || recentlyDismissed()) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const status = getPushSupportStatus();
        // « granted » : l'autorisation existe mais cet appareil n'est pas (ou plus) enregistré pour ce compte.
        const needsPush = status === 'default' || (status === 'granted' && !(await isDeviceRegisteredForUser()));
        const whatsapp = await getMyWhatsAppConsent();
        const needsWhatsApp = whatsapp.supported && !('error' in whatsapp) && !whatsapp.optedIn;
        const needed: Step[] = [...(needsPush ? (['push'] as Step[]) : []), ...(needsWhatsApp ? (['whatsapp'] as Step[]) : [])];
        if (!cancelled && needed.length > 0) { setSteps(needed); setCurrent(needed[0]); }
      })();
    }, SHOW_AFTER_MS);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [userId]);

  if (!userId || !current || hidden || blockedRoute) return null;

  const next = (finished: Step) => {
    const following = steps[steps.indexOf(finished) + 1];
    setDone(finished);
    window.setTimeout(() => {
      setDone(null);
      if (following) setCurrent(following); else setHidden(true);
    }, 1800);
  };

  const enable = async () => {
    setError('');
    setLoading(true);
    if (current === 'push') {
      const result = await subscribeToPush(userId);
      setLoading(false);
      if (result.error) { setError(result.error); return; }
    } else {
      const result = await setMyWhatsAppConsent(true, 'compte');
      setLoading(false);
      if (!result.supported) { setHidden(true); return; }
      if ('error' in result) { setError(result.error); return; }
    }
    next(current);
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
        <p className="flex items-center gap-2 text-sm font-medium text-ink"><Check size={16} className="text-burgundy" /> {done === 'push' ? 'Notifications activées. Merci !' : 'Messages WhatsApp activés. Merci !'}</p>
      ) : (
        <>
          <button onClick={later} aria-label="Fermer" className="absolute right-2 top-2 rounded-full p-1.5 text-ink/40 hover:text-ink"><X size={16} /></button>
          <div className="flex items-start gap-3 pr-6">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-burgundy/10 text-burgundy">
              {current === 'push' ? <Bell size={18} /> : <MessageCircle size={18} />}
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">{current === 'push' ? 'Suivez vos commandes en direct' : 'Recevez-les aussi sur WhatsApp'}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink/60">
                {current === 'push'
                  ? 'Recevez une notification quand votre commande est confirmée, préparée et en cours de livraison.'
                  : 'La confirmation de votre commande et l’avis de livraison en cours, par message WhatsApp. 2 messages au plus par commande, désactivable à tout moment.'}
              </p>
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
