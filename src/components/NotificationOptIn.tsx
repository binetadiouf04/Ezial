import { useEffect, useState } from 'react';
import { getPushSupportStatus, subscribeToPush, unsubscribeFromPush, isIosOutsideInstalledApp, type PushSupportStatus } from '@/lib/supabasePush';
import { Bell, Check, AlertCircle, Loader2, Share } from 'lucide-react';

// Explicit opt-in only — Web Push never subscribes silently. Reused for
// the customer account page, the seller "Ma boutique" page, the driver
// home, and the admin layout; the only difference between call sites is
// which userId (auth.uid()) subscriptions get tied to.
export default function NotificationOptIn({ userId, label }: { userId: string; label: string }) {
  const [status, setStatus] = useState<PushSupportStatus>('default');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setStatus(getPushSupportStatus()); }, []);

  const handleEnable = async () => {
    setError('');
    setLoading(true);
    const result = await subscribeToPush(userId);
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    setStatus('granted');
  };

  const handleDisable = async () => {
    setLoading(true);
    await unsubscribeFromPush(userId);
    setLoading(false);
    setStatus('default');
  };

  // iOS/iPadOS: Web Push only exists inside an installed (Home Screen) app —
  // a plain Safari tab can never show it. Rather than silently hide the
  // feature (which would look broken, not absent), this shows the one
  // concrete step that unlocks it, instead of promising push on a bare tab.
  if (status === 'unsupported' && isIosOutsideInstalledApp()) {
    return (
      <div className="card p-4 flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-burgundy/10 text-burgundy"><Bell size={16} /></span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="mt-1 text-xs text-ink/55">Pour les recevoir sur iPhone/iPad, ajoutez d'abord Ezial à votre écran d'accueil :</p>
          <ol className="mt-1 list-inside list-decimal space-y-0.5 text-xs text-ink/55">
            <li>Appuyez sur <Share size={12} className="inline-block align-text-bottom" /> (Partager)</li>
            <li>Choisissez « Sur l'écran d'accueil »</li>
          </ol>
        </div>
      </div>
    );
  }

  if (status === 'unsupported') return null; // not supported at all on this browser/device

  // Undecided (status === 'default') gets a deliberately bolder treatment —
  // this is the one state a seller/driver might otherwise never notice or
  // think to act on, so it reads as a prompt, not a quiet settings row.
  // It keeps reappearing on every visit until the browser's own permission
  // dialog is actually answered (granted or denied), which is the only
  // thing that moves status away from 'default' — no separate "dismiss"
  // state to track.
  if (status === 'default') {
    return (
      <div className="card flex items-center gap-3 border-burgundy/25 bg-burgundy/5 p-4">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-burgundy text-white"><Bell size={18} /></span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink">{label}</p>
          <p className="mt-0.5 text-xs text-ink/60">Activez pour être alerté immédiatement, même quand Ezial est fermé.</p>
          {error && <p className="mt-1 flex items-center gap-1 text-xs text-burgundy"><AlertCircle size={11} /> {error}</p>}
        </div>
        <button onClick={() => void handleEnable()} disabled={loading} className="btn-primary flex-shrink-0">
          {loading ? <Loader2 size={15} className="animate-spin" /> : 'Activer'}
        </button>
      </div>
    );
  }

  return (
    <div className="card p-4 flex items-center gap-3">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-burgundy/10 text-burgundy"><Bell size={16} /></span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {error && <p className="mt-0.5 flex items-center gap-1 text-xs text-burgundy"><AlertCircle size={11} /> {error}</p>}
        {status === 'denied' && <p className="mt-0.5 text-xs text-ink/45">Autorisation refusée — modifiable dans les réglages de votre navigateur.</p>}
      </div>
      {status === 'granted' && (
        <button onClick={() => void handleDisable()} disabled={loading} className="flex items-center gap-1.5 text-sm font-medium text-green-700 hover:text-ink/60 flex-shrink-0 transition-colors" title="Désactiver les notifications">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <><Check size={15} /> Activées</>}
        </button>
      )}
    </div>
  );
}
