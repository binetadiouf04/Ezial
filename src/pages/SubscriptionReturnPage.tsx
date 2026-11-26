import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Crown, Loader2, RefreshCw } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { parseReturnParams, RETURN_POLL_MS, RETURN_POLL_WINDOW_MS } from '@/lib/paymentReturn';
import { returnCopy, type SubscriptionPayState } from '@/lib/subscriptionPaymentCore';
import { fetchSubscriptionReturnStatus } from '@/lib/supabaseSubscriptionPayment';

// Page de retour après le paiement de l'abonnement Ezial Plus (adresse de retour Wave ou Orange Money), lisible SANS connexion :
// sur iPhone, Max It rouvre Safari, qui n'a pas la session d'Ezial Pro. L'état vient de subscription_payment_return_status
// (uuid « ref= » non devinable ; aucun montant, nom ni numéro). « Abonnement activé » uniquement si la base répond « paid ».
type Result = { state: SubscriptionPayState; periodEnd: string | null } | 'unknown' | 'unavailable' | 'error';

export default function SubscriptionReturnPage() {
  const { navigate } = useApp();
  const [{ kind, ref }] = useState(() => parseReturnParams(window.location.search));
  const [result, setResult] = useState<Result | null>(null);
  const [polling, setPolling] = useState(!!ref && kind === 'retour');
  const [checking, setChecking] = useState(false);
  const pollUntil = useRef(Date.now() + RETURN_POLL_WINDOW_MS);

  const check = useCallback(async () => {
    if (!ref) return null;
    const r = await fetchSubscriptionReturnStatus(ref);
    setResult((prev) => (r === 'error' && prev && typeof prev === 'object' ? prev : r));
    if (r === 'unknown' || r === 'unavailable' || (typeof r === 'object' && r.state !== 'pending')) setPolling(false);
    return r;
  }, [ref]);

  useEffect(() => { void check(); }, [check]);
  useEffect(() => {
    if (!polling) return;
    const t = window.setInterval(() => { if (Date.now() >= pollUntil.current) { setPolling(false); return; } void check(); }, RETURN_POLL_MS);
    const onBack = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', onBack); window.removeEventListener('focus', onBack); };
  }, [polling, check]);

  const known = result && typeof result === 'object' ? result : null;
  const state: SubscriptionPayState | 'loading' | 'neutral' = known ? known.state : ref && result === null ? 'loading' : 'neutral';
  const copy = returnCopy(state, kind);
  const waiting = state === 'pending' && kind === 'retour';
  const icon = state === 'paid' ? <CheckCircle2 size={36} strokeWidth={1.5} className="text-green-700" aria-hidden="true" />
    : state === 'failed' || state === 'expired' ? <AlertTriangle size={34} strokeWidth={1.5} className="text-red-700" aria-hidden="true" />
    : <Loader2 size={34} className="animate-spin text-burgundy" aria-hidden="true" />;
  const endText = state === 'paid' && known?.periodEnd ? new Date(known.periodEnd).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : null;

  return (
    <div className="container-pro max-w-xl py-8">
      <section className="card p-6 text-center" aria-labelledby="retour-abo-titre">
        <div className="flex justify-center">{icon}</div>
        <h1 id="retour-abo-titre" className="mt-3 font-display text-2xl font-semibold text-ink" aria-live="polite">{copy.title}</h1>
        <p className="mt-1 text-sm text-ink/55">Abonnement Ezial Plus</p>
        <p className="mt-3 text-sm text-ink/70" aria-live="polite">{copy.text}{endText ? ` Valable jusqu’au ${endText}.` : ''}</p>
        {waiting && polling && <p className="mt-3 flex items-center justify-center gap-2 text-xs text-ink/50"><Loader2 size={13} className="animate-spin" aria-hidden="true" /> Mise à jour automatique</p>}
        {ref && state !== 'paid' && state !== 'loading' && !(waiting && polling) && result !== 'unavailable' && (
          <button type="button" onClick={async () => { setChecking(true); await check(); setChecking(false); }} disabled={checking} className="btn-outline mt-4 w-full gap-2">
            {checking ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Vérifier à nouveau
          </button>
        )}
        {(state === 'failed' || state === 'expired') && <p className="mt-3 text-sm text-ink/60">Un montant a été débité ? <button type="button" onClick={() => navigate('/info/contact')} className="font-medium text-burgundy hover:underline">Contactez-nous</button> : nous vérifions avec Wave ou Orange Money.</p>}
      </section>
      <section className="card mt-4 p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink"><Crown size={18} strokeWidth={1.5} className="text-burgundy" aria-hidden="true" /> Retourner dans Ezial Pro</h2>
        <p className="mt-1.5 text-sm text-ink/70">Votre abonnement s’active automatiquement dans Ezial Pro dès que le paiement est confirmé.</p>
        <button type="button" onClick={() => navigate('/pro/seller/abonnement')} className="btn-primary mt-4 w-full">Mon abonnement</button>
      </section>
    </div>
  );
}
