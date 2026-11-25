import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Smartphone } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import CustomerAuthPanel from '@/components/CustomerAuthPanel';
import { rememberLaunch, RETURN_POLL_MS, RETURN_POLL_WINDOW_MS, type ReturnKind, type ReturnState } from '@/lib/paymentReturn';
import { fetchPaymentReturnStatus } from '@/lib/supabaseOrangeMoney';

// Page de retour après paiement (adresse de retour Orange Money / Wave), lisible SANS connexion.
// Sur iPhone, Max It renvoie vers Safari et non vers l'application installée : Safari n'a pas
// la session du client. L'état vient de la fonction serveur payment_return_status (uuid de la
// tentative « ref= », jamais le numéro de commande) ; sans elle (migration pas encore exécutée,
// ancienne adresse sans ref), message neutre qui renvoie vers l'application.
// Ne déclare JAMAIS un paiement réussi sans la réponse « paid » de la base.

type Result = { state: ReturnState; orderNumber: string } | 'unknown' | 'unavailable' | 'error';

export default function PaymentReturnStatus({ orderNumber, kind, paymentRef }: { orderNumber: string; kind: ReturnKind; paymentRef: string | null }) {
  const { customerUser, authLoading, navigate } = useApp();
  const [result, setResult] = useState<Result | null>(null);
  const [polling, setPolling] = useState(!!paymentRef && kind === 'retour');
  const [checking, setChecking] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const pollUntil = useRef(Date.now() + RETURN_POLL_WINDOW_MS);

  // Dans ce navigateur, la page de la commande saura qu'un paiement vient d'être fait :
  // elle affichera « vérification en cours » au lieu de proposer de payer à nouveau.
  useEffect(() => {
    if (kind === 'retour') rememberLaunch(orderNumber, paymentRef);
  }, [kind, orderNumber, paymentRef]);

  const check = useCallback(async (): Promise<Result | null> => {
    if (!paymentRef) return null;
    const r = await fetchPaymentReturnStatus(paymentRef);
    // Erreur passagère : on garde la dernière réponse connue.
    setResult((prev) => (r === 'error' && prev && typeof prev === 'object' ? prev : r));
    // Réponse définitive (payé, échec, identifiant inconnu, fonction absente) : plus de sondage.
    if (r === 'unknown' || r === 'unavailable' || (typeof r === 'object' && r.state !== 'pending')) setPolling(false);
    return r;
  }, [paymentRef]);

  // Première lecture, puis sondage toutes les 4 s pendant 3 min (retour de paiement uniquement).
  useEffect(() => { void check(); }, [check]);
  useEffect(() => {
    if (!polling) return;
    const t = window.setInterval(() => {
      if (Date.now() >= pollUntil.current) { setPolling(false); return; }
      void check();
    }, RETURN_POLL_MS);
    const onBack = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
    };
  }, [polling, check]);

  const checkAgain = async () => {
    setChecking(true);
    const r = await check();
    setChecking(false);
    if (kind === 'retour' && r && typeof r === 'object' && r.state === 'pending') {
      pollUntil.current = Date.now() + RETURN_POLL_WINDOW_MS;
      setPolling(true);
    }
  };

  const known = result && typeof result === 'object' ? result : null;
  const number = known?.orderNumber ?? orderNumber;
  const state: ReturnState | 'neutral' | 'loading' = known
    ? known.state
    : paymentRef && result === null ? 'loading' : 'neutral';

  const openOrder = () => {
    if (customerUser) navigate(`/compte/commande/${encodeURIComponent(number)}`);
    else setShowLogin(true);
  };

  let icon = <Loader2 size={34} className="animate-spin text-burgundy" aria-hidden="true" />;
  let title = 'Paiement en cours de vérification…';
  let text: ReactNode = 'Orange Money nous confirme le paiement en général en 1 à 2 minutes. Cette page se met à jour toute seule : inutile de payer à nouveau.';
  if (state === 'loading') {
    title = 'Vérification du paiement…';
    text = 'Un instant, nous lisons l’état de votre paiement.';
  } else if (state === 'paid') {
    icon = <CheckCircle2 size={36} strokeWidth={1.5} className="text-green-700" aria-hidden="true" />;
    title = 'Paiement reçu, merci !';
    text = `Le paiement de la commande ${number} est confirmé.`;
  } else if (state === 'failed' || state === 'expired') {
    icon = <AlertTriangle size={34} strokeWidth={1.5} className="text-red-700" aria-hidden="true" />;
    title = 'Paiement non abouti';
    text = state === 'failed'
      ? 'Aucun paiement n’a été confirmé pour cette tentative. Vous pouvez réessayer depuis votre commande dans l’application Ezial.'
      : 'Aucun paiement n’a été confirmé : le délai de paiement est dépassé ou la commande a été annulée.';
  } else if (state === 'pending' && kind === 'annule') {
    icon = <AlertTriangle size={34} strokeWidth={1.5} className="text-amber-700" aria-hidden="true" />;
    title = 'Paiement non finalisé';
    text = 'Le paiement n’a pas été validé. Si vous n’avez pas payé, vous pouvez réessayer depuis votre commande dans l’application Ezial.';
  } else if (state === 'neutral') {
    title = 'Paiement en cours de vérification';
    text = 'Revenez dans l’application Ezial pour suivre votre commande : son état s’y met à jour automatiquement dès que le paiement est confirmé.';
  }
  const waiting = state === 'pending' && kind === 'retour';

  return (
    <div className="container-pro max-w-xl py-8">
      <section className="card p-6 text-center" aria-labelledby="retour-paiement-titre">
        <div className="flex justify-center">{icon}</div>
        <h1 id="retour-paiement-titre" className="mt-3 font-display text-2xl font-semibold text-ink" aria-live="polite">{title}</h1>
        <p className="mt-1 font-mono text-sm text-ink/55">Commande {number}</p>
        <p className="mt-3 text-sm text-ink/70" aria-live="polite">{text}</p>

        {waiting && polling && (
          <p className="mt-3 flex items-center justify-center gap-2 text-xs text-ink/50"><Loader2 size={13} className="animate-spin" aria-hidden="true" /> Mise à jour automatique</p>
        )}
        {paymentRef && state !== 'paid' && state !== 'loading' && !(waiting && polling) && result !== 'unavailable' && (
          <button type="button" onClick={() => void checkAgain()} disabled={checking} className="btn-outline mt-4 w-full gap-2">
            {checking ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Vérifier à nouveau
          </button>
        )}
        {(state === 'failed' || state === 'expired') && (
          <p className="mt-3 text-sm text-ink/60">Un montant a été débité ? <button type="button" onClick={() => navigate('/info/contact')} className="font-medium text-burgundy hover:underline">Contactez-nous</button> : nous vérifions avec Orange Money.</p>
        )}
      </section>

      <section className="card mt-4 p-5" aria-labelledby="retour-app-titre">
        <h2 id="retour-app-titre" className="flex items-center gap-2 text-base font-semibold text-ink">
          <Smartphone size={18} strokeWidth={1.5} className="text-burgundy" aria-hidden="true" /> Suivre votre commande
        </h2>
        <p className="mt-1.5 text-sm text-ink/70">Vous pouvez revenir dans l’application Ezial pour suivre votre commande.</p>
        {(!showLogin || customerUser) && (
          <button type="button" onClick={openOrder} disabled={authLoading} className="btn-primary mt-4 w-full gap-2">
            {authLoading ? <Loader2 size={16} className="animate-spin" /> : null} Voir ma commande
          </button>
        )}
      </section>

      {showLogin && !customerUser && (
        <div className="mt-4">
          <CustomerAuthPanel subtitle="Connectez-vous pour voir votre commande." />
        </div>
      )}
    </div>
  );
}
