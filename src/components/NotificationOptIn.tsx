import { useEffect, useState } from 'react';
import { getPushSupportStatus, subscribeToPush, type PushSupportStatus } from '@/lib/supabasePush';
import { Bell, Check, AlertCircle, Loader2 } from 'lucide-react';

// Explicit opt-in only — Web Push never subscribes silently. Reused for
// both the customer account page and the seller "Ma boutique" page; the
// only difference between them is which userId (auth.uid()) subscriptions
// get tied to.
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

  if (status === 'unsupported') return null; // never shown where it can't work (e.g. iOS Safari outside an installed PWA)

  return (
    <div className="card p-4 flex items-center gap-3">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-burgundy/10 text-burgundy"><Bell size={16} /></span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {error && <p className="mt-0.5 flex items-center gap-1 text-xs text-burgundy"><AlertCircle size={11} /> {error}</p>}
        {status === 'denied' && <p className="mt-0.5 text-xs text-ink/45">Autorisation refusée — modifiable dans les réglages de votre navigateur.</p>}
      </div>
      {status === 'granted' ? (
        <span className="flex items-center gap-1 text-sm font-medium text-green-700 flex-shrink-0"><Check size={15} /> Activées</span>
      ) : status === 'default' ? (
        <button onClick={() => void handleEnable()} disabled={loading} className="btn-outline flex-shrink-0">
          {loading ? <Loader2 size={15} className="animate-spin" /> : 'Activer'}
        </button>
      ) : null}
    </div>
  );
}
