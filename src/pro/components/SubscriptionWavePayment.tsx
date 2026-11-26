import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw } from 'lucide-react';
import { formatFcfa } from '@/data/subscriptionPlans';
import type { SubscriptionPayPeriod } from '@/lib/subscriptionPaymentCore';
import { formatRemaining } from '@/lib/orderPayment';
import type { WaveSession } from '@/lib/supabaseWave';
import { fetchSubscriptionAttemptState, startSubscriptionPayment, type SubscriptionAttemptState } from '@/lib/supabaseSubscriptionPayment';

// Paiement de l'abonnement Ezial Plus par Wave (Checkout), même écran que le paiement d'une commande :
//   * UN bouton « Payer avec Wave » : le serveur crée la session (ou réutilise celle qui est encore valable) ;
//   * la page Wave s'ouvre dans le navigateur (jamais dans une vue intégrée : Wave l'exige), une seule fois par
//     session, le lien « Payer dans Wave » restant affiché si l'ouverture n'a pas lieu ;
//   * l'état réel est relu toutes les 5 s et dès le retour dans l'application ; « Abonnement activé » seulement
//     quand la base (après confirmation de Wave) répond « paid » : l'adresse de retour ne prouve rien.
export default function SubscriptionWavePayment({ shopId, period, amount, onPaid }: { shopId: string; period: SubscriptionPayPeriod; amount: number; onPaid: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [attempt, setAttempt] = useState<SubscriptionAttemptState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState<WaveSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [paid, setPaid] = useState(false);
  const announced = useRef(false);
  const opened = useRef(false);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    const latest = await fetchSubscriptionAttemptState(shopId);
    if (latest === undefined) return; // lecture impossible : on garde l'état connu
    // Une tentative en attente ou échouée d'un autre moyen (Orange Money) ne concerne pas cet écran.
    setAttempt(latest && latest.state !== 'paid' && latest.provider !== 'wave' ? null : latest);
    setLoaded(true);
  }, [shopId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Paiement confirmé par la base : annoncé une seule fois.
  useEffect(() => {
    if (attempt?.state !== 'paid' || announced.current) return;
    announced.current = true;
    setPaid(true);
    onPaid();
  }, [attempt, onPaid]);

  const waiting = !paid && (attempt?.state === 'pending' || !!session);
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(() => { void refresh(); }, 5000);
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
  }, [waiting, refresh]);

  const start = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await startSubscriptionPayment(shopId, period, 'wave');
    setLoading(false);
    if ('error' in res) { setError(res.error); void refresh(); return; }
    if (!('wave' in res)) { setError('Wave n’a pas renvoyé de page de paiement. Réessayez dans un instant.'); return; }
    setSession(res.wave);
    setAttempt({ attemptId: res.wave.transactionId, state: 'pending', period, provider: 'wave', expiresAt: res.wave.validUntil, createdAt: new Date().toISOString() });
    setLoaded(true);
    // Ouverture directe de la page Wave après le clic (une seule fois par session de paiement).
    if (Date.parse(res.wave.validUntil) <= Date.now()) return;
    const key = `ezial-wave-ouvert-${res.wave.transactionId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch { /* stockage indisponible : on ouvre quand même une fois (verrou du composant) */ }
    if (opened.current) return;
    opened.current = true;
    window.location.assign(res.wave.url);
  }, [shopId, period, refresh]);

  const checkNow = async () => { setChecking(true); await refresh(); setChecking(false); };
  const price = formatFcfa(amount);
  const sessionValid = !!session && Date.parse(session.validUntil) > now;
  const failed = !paid && (attempt?.state === 'failed' || attempt?.state === 'expired' || (!!session && !sessionValid));

  if (paid) {
    return (
      <div className="card flex items-start gap-3 p-5" role="status" aria-live="polite">
        <CheckCircle2 size={22} className="mt-0.5 flex-shrink-0 text-green-700" />
        <div>
          <p className="text-base font-semibold text-ink">Abonnement activé, merci !</p>
          <p className="mt-0.5 text-sm text-ink/60">Wave a confirmé votre paiement de {price}. Votre abonnement Ezial Plus est actif.</p>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return <div className="card flex items-center justify-center gap-2 p-5 text-sm text-ink/60" role="status"><Loader2 size={16} className="animate-spin text-burgundy" /> Chargement du paiement…</div>;
  }

  const remaining = session ? Date.parse(session.validUntil) - now : 0;
  const pendingNoSession = attempt?.state === 'pending' && !sessionValid;

  return (
    <section className="card p-5" aria-labelledby="abo-wave-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="abo-wave-title" className="text-base font-semibold text-ink">Payer avec Wave</h2>
        {sessionValid && (
          <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800" aria-label={`Temps restant pour payer : ${formatRemaining(remaining)}`}>
            <Clock size={12} /> {formatRemaining(remaining)}
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-semibold text-ink">{price}</p>

      {error && <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-red-50 p-3 text-sm text-red-700"><AlertTriangle size={15} className="mt-0.5 flex-shrink-0" /> {error}</p>}
      {failed && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="status"><span className="font-semibold">Paiement non abouti.</span> Wave n’a confirmé aucun paiement pour cette tentative. Vous pouvez réessayer.</p>
      )}

      {!sessionValid && (
        <div className="mt-4">
          <button type="button" onClick={() => void start()} disabled={loading} className="btn-primary w-full gap-2">
            {loading ? <><Loader2 size={16} className="animate-spin" /> Un instant…</> : failed ? 'Réessayer le paiement' : 'Payer avec Wave'}
          </button>
          {pendingNoSession && !failed ? (
            <>
              <p className="mt-3 flex items-center justify-center gap-2 text-center text-sm text-ink/60" aria-live="polite"><Loader2 size={14} className="animate-spin text-burgundy" /> En attente de votre paiement…</p>
              <button type="button" onClick={() => void checkNow()} disabled={checking} className="btn-outline mt-3 w-full gap-2">
                {checking ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Vérifier maintenant
              </button>
            </>
          ) : (
            <p className="mt-2 text-center text-xs text-ink/50">La page de paiement Wave est valable 30 minutes. Aucun prélèvement automatique.</p>
          )}
        </div>
      )}

      {sessionValid && session && (
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
