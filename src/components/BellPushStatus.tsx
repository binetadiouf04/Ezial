import { useEffect, useState } from 'react';
import { Bell, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { getPushSupportStatus, isDeviceRegisteredForUser, isPushKeyConfigured, subscribeToPush, type PushSupportStatus } from '@/lib/supabasePush';

// État des notifications de CET appareil, directement dans la cloche : un
// bouton « Activer » quand c'est possible, sinon une phrase claire qui dit
// pourquoi ce ne l'est pas (au lieu de masquer l'option sans explication).
type BellPushState = PushSupportStatus | 'registered' | 'checking';

export default function BellPushStatus() {
  const [state, setState] = useState<BellPushState>('checking');
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const id = data.session?.user.id ?? null;
      const browser = getPushSupportStatus();
      // Autorisation déjà donnée : encore faut-il que CET appareil soit enregistré pour CE compte.
      const next: BellPushState = browser === 'granted' ? ((await isDeviceRegisteredForUser()) ? 'registered' : 'default') : browser;
      if (cancelled) return;
      setUserId(id);
      setState(next);
    })();
    return () => { cancelled = true; };
  }, []);

  if (state === 'checking' || !userId) return null;

  const enable = async () => {
    setError('');
    setLoading(true);
    const result = await subscribeToPush(userId);
    setLoading(false);
    if (result.error) { setError(result.error); setState(getPushSupportStatus() === 'denied' ? 'denied' : 'default'); return; }
    setState('registered');
  };

  const note = (text: string) => <p className="border-b border-line bg-cream/60 px-3 py-2 text-xs leading-relaxed text-ink/60">{text}</p>;

  if (state === 'registered' || state === 'granted') {
    return <p className="flex items-center gap-1.5 border-b border-line bg-cream/60 px-3 py-2 text-xs text-ink/60"><Check size={13} className="text-green-700" /> Notifications activées sur cet appareil.</p>;
  }
  if (state === 'default') {
    return (
      <div className="border-b border-line bg-burgundy/5 px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-burgundy text-white"><Bell size={14} /></span>
          <p className="min-w-0 flex-1 text-xs leading-snug text-ink/70">Recevez vos alertes de commande, même quand Ezial est fermé.</p>
          <button onClick={() => void enable()} disabled={loading} className="btn-primary flex-shrink-0 !px-3 !py-1.5 text-xs">
            {loading ? <Loader2 size={14} className="animate-spin" /> : 'Activer'}
          </button>
        </div>
        {error && <p className="mt-1.5 text-xs text-burgundy">{error}</p>}
      </div>
    );
  }
  if (state === 'ios-install-required') return note('Sur iPhone, ouvrez Ezial depuis son icône sur l\u2019écran d\u2019accueil pour activer les notifications.');
  if (state === 'denied') return note('Les notifications sont bloquées pour Ezial. Autorisez-les dans les réglages de votre téléphone (Notifications, Ezial).');
  // 'unsupported'
  return note(isPushKeyConfigured()
    ? 'Ce navigateur ne permet pas les notifications.'
    : 'Les notifications ne sont pas encore activées sur Ezial.');
}
