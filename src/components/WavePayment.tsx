import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Clock, Loader2, RefreshCw } from 'lucide-react';
import { useApp, type Order } from '@/store/AppContext';
import { formatFCFA } from '@/data/products';
import { canResumePayment, formatRemaining, paymentPhase } from '@/lib/orderPayment';
import { fetchOrderPaymentState } from '@/lib/supabaseOrangeMoney';
import { fetchOpenWaveSession, startWavePayment, type WaveSession } from '@/lib/supabaseWave';

// Paiement d'une commande par Wave (Checkout).
//   * Un bouton « Payer avec Wave » ouvre la page Wave dans le navigateur (jamais dans une vue
//     intégrée : Wave l'exige) ; la personne revient sur Ezial par l'adresse de retour.
//   * La page relit l'état réel de la commande toutes les 5 s et dès le retour dans
//     l'application ; elle n'affiche « payé » que lorsque la base l'a confirmé.
// autoOpen : la personne vient de toucher « Payer » ; la page Wave s'ouvre directement (une seule
// fois par session), le bouton restant affiché si l'ouverture n'a pas lieu.
export default function WavePayment({ order, autoStart = false, autoOpen = false }: { order: Order; autoStart?: boolean; autoOpen?: boolean }) {
  const { patchOrder, navigate } = useApp();
  const [now, setNow] = useState(() => Date.now());
  const [session, setSession] = useState<WaveSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const started = useRef(false);
  const opened = useRef(false);
  const orderId = order.supabaseOrderId;
  const phase = paymentPhase(order, now);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    if (!orderId) return;
    const state = await fetchOrderPaymentState(orderId);
    if (state) patchOrder(order.id, state);
  }, [orderId, order.id, patchOrder]);

  // Relecture de l'état : régulière, et immédiate au retour sur la page (après Wave).
  useEffect(() => {
    if (phase !== 'awaiting' && phase !== 'verifying') return;
    const t = window.setInterval(() => { void refresh(); }, phase === 'awaiting' ? 5000 : 15000);
    const onBack = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    window.addEventListener('pageshow', onBack);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
      window.removeEventListener('pageshow', onBack);
    };
  }, [phase, refresh]);

  const start = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError('');
    const res = await startWavePayment(orderId);
    setLoading(false);
    if ('error' in res) {
      setError(res.error);
      void refresh();
      return;
    }
    setSession(res.session);
  }, [orderId, refresh]);

  // Session déjà créée et encore valable (page rechargée) ; sinon création automatique si demandée.
  const awaiting = phase === 'awaiting';
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!orderId || !awaiting || started.current) return;
    started.current = true;
    void (async () => {
      const existing = await fetchOpenWaveSession(orderId);
      if (!mounted.current) return;
      if (existing) setSession(existing);
      else if (autoStart) await start();
    })();
  }, [orderId, awaiting, autoStart, start]);

  // Ouverture directe de la page Wave après le clic sur « Payer » (une seule fois par session).
  useEffect(() => {
    if (!autoOpen || !session || Date.parse(session.validUntil) <= Date.now()) return;
    const key = `ezial-wave-ouvert-${session.transactionId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch { /* stockage indisponible : on ouvre quand même une fois (verrou du composant) */ }
    if (opened.current) return;
    opened.current = true;
    window.location.assign(session.url);
  }, [autoOpen, session]);

  const checkNow = async () => {
    setChecking(true);
    await refresh();
    setChecking(false);
  };

  if (!orderId || phase === 'offline') return null;

  // Payé : la page l'annonce elle-même (titre « c'est confirmé », statut), pas de doublon ici.
  if (phase === 'paid') return null;

  if (phase === 'cancelled') {
    return (
      <div className="card mb-5 flex items-start gap-3 p-5" role="status">
        <AlertTriangle size={20} className="mt-0.5 flex-shrink-0 text-red-700" />
        <div>
          <p className="text-sm font-semibold text-ink">Commande annulée : paiement non reçu</p>
          <p className="mt-0.5 text-sm text-ink/60">Le paiement Wave n’a pas été reçu dans le délai. Les articles ont été remis en vente.</p>
          <p className="mt-2 text-sm text-ink/60">Un montant a été débité ? <button type="button" onClick={() => navigate('/info/contact')} className="font-medium text-burgundy hover:underline">Contactez-nous</button> : nous vérifions avec Wave.</p>
        </div>
      </div>
    );
  }

  if (phase === 'verifying') {
    return (
      <div className="card mb-5 p-5" role="status" aria-live="polite">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Loader2 size={16} className="animate-spin text-burgundy" /> Vérification du paiement auprès de Wave</p>
        <p className="mt-1.5 text-sm text-ink/60">Le délai de paiement est passé. Si vous avez payé, votre commande sera confirmée automatiquement dès que Wave nous l’aura confirmé. Sinon, elle sera annulée et vous en serez informé.</p>
        <button type="button" onClick={() => void checkNow()} disabled={checking} className="btn-outline mt-4 w-full gap-2">
          {checking ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Actualiser
        </button>
      </div>
    );
  }

  // phase === 'awaiting'
  const remaining = order.paymentDeadline ? Date.parse(order.paymentDeadline) - now : 0;
  const sessionExpired = !!session && Date.parse(session.validUntil) <= now;
  const resumable = canResumePayment(order, now);

  // Écran volontairement minimal : le montant, UN bouton, et la page se met à jour seule.
  return (
    <section className="card mb-5 p-5" aria-labelledby="wave-pay-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="wave-pay-title" className="text-base font-semibold text-ink">Payer avec Wave</h2>
        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800" aria-label={`Temps restant pour payer : ${formatRemaining(remaining)}`}>
          <Clock size={12} /> {formatRemaining(remaining)}
        </span>
      </div>
      <p className="mt-1 text-2xl font-semibold text-ink">{formatFCFA(order.total)}</p>

      {error && <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-red-50 p-3 text-sm text-red-700"><AlertTriangle size={15} className="mt-0.5 flex-shrink-0" /> {error}</p>}

      {(!session || sessionExpired) && (
        <div className="mt-4">
          {resumable ? (
            <button type="button" onClick={() => void start()} disabled={loading} className="btn-primary w-full gap-2">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Un instant…</> : 'Payer avec Wave'}
            </button>
          ) : (
            <p className="text-sm text-ink/60">Le délai de paiement est presque terminé : il n’est plus possible de payer cette commande.</p>
          )}
        </div>
      )}

      {session && !sessionExpired && (
        <div className="mt-4 space-y-3">
          {/* Lien ordinaire (jamais une vue intégrée) : le navigateur ouvre Wave, ou ses instructions. */}
          <a href={session.url} className="btn-primary w-full" rel="noopener">Payer dans Wave</a>
          <p className="flex items-center justify-center gap-2 text-center text-sm text-ink/60" aria-live="polite">
            <Loader2 size={14} className="animate-spin text-burgundy" /> En attente de votre paiement…
          </p>
        </div>
      )}
    </section>
  );
}
