import { useState, useEffect } from 'react';
import { getPushSupportStatus, subscribeToPush, isIosOutsideInstalledApp, type PushSupportStatus } from '@/lib/supabasePush';
import { Bell, Share, Loader2, AlertCircle } from 'lucide-react';

// Blocking variant of NotificationOptIn, for roles (seller/driver) where
// missing a new order/mission because push was never enabled has a real
// business cost — a card on the page is easy to scroll past; this is a
// full-screen modal on their landing page that only closes once the
// browser's own permission dialog has actually been answered (granted or
// denied — either is a real decision), or, on iOS outside an installed
// app, once they acknowledge there's nothing to click yet. No site can
// skip that dialog; this only makes sure the person actually sees it.
export default function NotificationGateModal({ userId, label }: { userId: string; label: string }) {
  const [status, setStatus] = useState<PushSupportStatus | 'checking'>('checking');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [iosDismissed, setIosDismissed] = useState(false);

  useEffect(() => { setStatus(getPushSupportStatus()); }, []);

  const handleEnable = async () => {
    setError('');
    setLoading(true);
    const result = await subscribeToPush(userId);
    setLoading(false);
    setStatus(getPushSupportStatus());
    if (result.error) setError(result.error);
  };

  if (status === 'checking' || status === 'granted' || status === 'denied') return null;
  const isIosHint = status === 'unsupported' && isIosOutsideInstalledApp();
  if (status === 'unsupported' && !isIosHint) return null;
  if (isIosHint && iosDismissed) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/60 p-4">
      <div className="card w-full max-w-sm p-6 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-burgundy/10 text-burgundy"><Bell size={26} /></span>
        <h2 className="mt-4 font-display text-lg font-semibold text-ink">{label}</h2>

        {isIosHint ? (
          <>
            <p className="mt-2 text-sm text-ink/60">Pour les recevoir sur iPhone/iPad, ajoutez d'abord Ezial à votre écran d'accueil :</p>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-left text-sm text-ink/60">
              <li>Appuyez sur <Share size={14} className="inline-block align-text-bottom" /> (Partager)</li>
              <li>Choisissez « Sur l'écran d'accueil »</li>
            </ol>
            <button onClick={() => setIosDismissed(true)} className="btn-outline w-full mt-5">J'ai compris</button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink/60">Activez les notifications pour ne jamais manquer une nouvelle commande ou mission, même quand Ezial est fermé.</p>
            {error && <p className="mt-2 flex items-center justify-center gap-1 text-xs text-burgundy"><AlertCircle size={12} /> {error}</p>}
            <button onClick={() => void handleEnable()} disabled={loading} className="btn-primary w-full mt-5">
              {loading ? <Loader2 size={16} className="mx-auto animate-spin" /> : 'Activer les notifications'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
