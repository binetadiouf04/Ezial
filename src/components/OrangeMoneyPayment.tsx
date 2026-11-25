import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, Loader2, QrCode, RefreshCw } from 'lucide-react';
import { useApp, type Order } from '@/store/AppContext';
import { formatFCFA } from '@/data/products';
import { canResumePayment, formatRemaining, isHandheld, paymentPhase } from '@/lib/orderPayment';
import { attemptView, forgetLaunch, parseReturnParams, readLaunch, rememberLaunch, VERIFY_POLL_MS } from '@/lib/paymentReturn';
import { fetchLatestOrangeAttempt, fetchOrderPaymentState, startOrangeMoneyPayment, type OrangeAttempt, type OrangeQr } from '@/lib/supabaseOrangeMoney';

// Paiement d'une commande Orange Money (« QR CODE – OM »).
//   * Téléphone / tablette : un bouton qui ouvre Max It (ou Orange Money) (action explicite
//     de la personne : iOS bloque l'ouverture automatique d'une application), et un bouton
//     secondaire pour afficher le QR à scanner depuis un autre téléphone.
//   * Ordinateur : QR code à scanner avec le téléphone.
//   * La page relit l'état réel de la commande et de la dernière tentative (payment_transactions,
//     droits du client) régulièrement et dès le retour dans l'application ; elle n'affiche
//     « payé » que lorsque la base l'a confirmé.
//   * Paiement lancé (Max It ouvert, retour de paiement) et pas encore confirmé : « vérification
//     en cours », SANS bouton de paiement. « Réessayer le paiement » seulement si la tentative a
//     réellement échoué / expiré, ou après 5 min sans confirmation. Aucun second paiement n'est
//     jamais créé automatiquement : la création automatique n'a lieu que s'il n'existe AUCUNE tentative.
// autoOpen : la personne vient de toucher « Payer » ; sur téléphone, Max It s'ouvre directement
// (une seule fois par tentative), le bouton restant affiché si l'ouverture n'a pas lieu.
export default function OrangeMoneyPayment({ order, autoStart = false, autoOpen = false }: { order: Order; autoStart?: boolean; autoOpen?: boolean }) {
  const { patchOrder, navigate } = useApp();
  const [now, setNow] = useState(() => Date.now());
  const [attempt, setAttempt] = useState<OrangeAttempt | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [showQr, setShowQr] = useState(false);
  // Arrivée par l'adresse de retour du fournisseur (« ?paiement=retour&ref=… ») : lue une fois.
  const [returnParams] = useState(() => (typeof window === 'undefined' ? { kind: null, ref: null } : parseReturnParams(window.location.search)));
  const [launch, setLaunch] = useState<{ at: number; ref: string | null; local: boolean } | null>(() => {
    if (returnParams.kind === 'retour') return { at: rememberLaunch(order.id, returnParams.ref), ref: returnParams.ref, local: false };
    const saved = readLaunch(order.id);
    return saved ? { ...saved, local: true } : null;
  });
  const [justPaid, setJustPaid] = useState(false);
  const started = useRef(false);
  const opened = useRef(false);
  const orderId = order.supabaseOrderId;
  const phase = paymentPhase(order, now);
  const handheld = useMemo(() => typeof navigator !== 'undefined'
    && isHandheld(navigator.userAgent, typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches), []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const loadAttempt = useCallback(async () => {
    if (!orderId) return;
    const latest = await fetchLatestOrangeAttempt(orderId);
    if (latest === undefined) return; // lecture impossible : on garde l'état connu, nouvel essai au prochain tour
    setAttempt(latest);
    setLoaded(true);
  }, [orderId]);

  const refresh = useCallback(async () => {
    if (!orderId) return;
    const [state] = await Promise.all([fetchOrderPaymentState(orderId), loadAttempt()]);
    if (state) patchOrder(order.id, state);
  }, [orderId, order.id, patchOrder, loadAttempt]);

  // Paiement lancé depuis cet appareil : ne compte que pour LA tentative concernée
  // (une ancienne tentative échouée ne doit pas masquer un nouveau QR).
  const launchedAt = launch && attempt && (!launch.ref || launch.ref === attempt.transactionId) ? launch.at : null;
  const view = attemptView({ loaded, status: attempt?.status ?? null, hasValidQr: !!attempt?.qr && Date.parse(attempt.qr.validUntil) > now, launchedAt, now });
  const qr: OrangeQr | null = attempt?.qr ?? null;
  const verifyingNow = phase === 'awaiting' && (view === 'verifying' || view === 'verifying_retry');

  // Relecture de l'état : régulière, et immédiate au retour dans l'application (après Max It).
  useEffect(() => {
    if (phase !== 'awaiting' && phase !== 'verifying') return;
    const every = verifyingNow ? VERIFY_POLL_MS : phase === 'awaiting' ? 5000 : 15000;
    const t = window.setInterval(() => { void refresh(); }, every);
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
  }, [phase, verifyingNow, refresh]);

  // Paiement confirmé pendant que la personne attendait : on l'annonce clairement.
  useEffect(() => {
    if (phase !== 'paid' || !launch) return;
    setJustPaid(true);
    forgetLaunch(order.id);
  }, [phase, launch, order.id]);

  const start = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError('');
    const res = await startOrangeMoneyPayment(orderId);
    setLoading(false);
    if ('error' in res) {
      setError(res.error);
      void refresh();
      return;
    }
    forgetLaunch(order.id);
    setLaunch(null);
    setAttempt({ transactionId: res.qr.transactionId, status: 'pending', qr: res.qr });
    setLoaded(true);
  }, [orderId, order.id, refresh]);

  // Première lecture : tentative existante (QR encore valable, vérification, échec) ; création
  // automatique UNIQUEMENT s'il n'existe aucune tentative pour cette commande.
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
      const latest = await fetchLatestOrangeAttempt(orderId);
      if (!mounted.current) return;
      if (latest === undefined) { setLoaded(true); return; }
      setAttempt(latest);
      setLoaded(true);
      if (latest === null && autoStart && returnParams.kind !== 'retour') await start();
    })();
  }, [orderId, awaiting, autoStart, start, returnParams.kind]);

  const markLaunched = useCallback((ref: string) => {
    setLaunch({ at: rememberLaunch(order.id, ref), ref, local: true });
  }, [order.id]);

  // Ouverture directe de Max It après le clic sur « Payer » (téléphone uniquement).
  useEffect(() => {
    const link = qr?.maxitLink ?? qr?.omLink;
    if (!autoOpen || !handheld || view !== 'qr' || !qr || !link || Date.parse(qr.validUntil) <= Date.now()) return;
    const key = `ezial-om-ouvert-${qr.transactionId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch { /* stockage indisponible : on ouvre quand même une fois (verrou du composant) */ }
    if (opened.current) return;
    opened.current = true;
    markLaunched(qr.transactionId);
    window.location.assign(link);
  }, [autoOpen, handheld, qr, view, markLaunched]);

  const checkNow = async () => {
    setChecking(true);
    await refresh();
    setChecking(false);
  };

  /** Revenir à l'écran de paiement de la MÊME tentative (aucune nouvelle tentative créée). */
  const backToPayment = () => {
    forgetLaunch(order.id);
    setLaunch(null);
    setShowQr(false);
  };

  if (!orderId || phase === 'offline') return null;

  if (phase === 'paid') {
    if (!justPaid) return null; // la page l'annonce elle-même (titre, statut), pas de doublon ici
    return (
      <div className="card mb-5 flex items-start gap-3 p-5" role="status" aria-live="polite">
        <CheckCircle2 size={22} className="mt-0.5 flex-shrink-0 text-green-700" />
        <div>
          <p className="text-base font-semibold text-ink">Paiement reçu, merci !</p>
          <p className="mt-0.5 text-sm text-ink/60">Orange Money a confirmé votre paiement de {formatFCFA(order.total)}. Votre commande {order.id} est confirmée.</p>
        </div>
      </div>
    );
  }

  if (phase === 'cancelled') {
    return (
      <div className="card mb-5 flex items-start gap-3 p-5" role="status">
        <AlertTriangle size={20} className="mt-0.5 flex-shrink-0 text-red-700" />
        <div>
          <p className="text-sm font-semibold text-ink">Commande annulée : paiement non reçu</p>
          <p className="mt-0.5 text-sm text-ink/60">Le paiement Orange Money n’a pas été reçu dans le délai. Les articles ont été remis en vente.</p>
          <p className="mt-2 text-sm text-ink/60">Un montant a été débité ? <button type="button" onClick={() => navigate('/info/contact')} className="font-medium text-burgundy hover:underline">Contactez-nous</button> : nous vérifions avec Orange Money.</p>
        </div>
      </div>
    );
  }

  if (phase === 'verifying') {
    return (
      <div className="card mb-5 p-5" role="status" aria-live="polite">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Loader2 size={16} className="animate-spin text-burgundy" /> Vérification du paiement auprès d’Orange Money</p>
        <p className="mt-1.5 text-sm text-ink/60">Le délai de paiement est passé. Si vous avez payé, votre commande sera confirmée automatiquement dès qu’Orange Money nous l’aura confirmé. Sinon, elle sera annulée et vous en serez informé.</p>
        <button type="button" onClick={() => void checkNow()} disabled={checking} className="btn-outline mt-4 w-full gap-2">
          {checking ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Actualiser
        </button>
      </div>
    );
  }

  // phase === 'awaiting'
  const remaining = order.paymentDeadline ? Date.parse(order.paymentDeadline) - now : 0;
  const resumable = canResumePayment(order, now);

  if (view === 'loading') {
    return (
      <div className="card mb-5 flex items-center justify-center gap-2 p-5 text-sm text-ink/60" role="status">
        <Loader2 size={16} className="animate-spin text-burgundy" /> Chargement du paiement…
      </div>
    );
  }

  if (view === 'verifying' || view === 'verifying_retry') {
    const late = view === 'verifying_retry';
    const retryLink = qr?.maxitLink ?? qr?.omLink ?? null;
    return (
      <section className="card mb-5 p-5" aria-labelledby="om-verif-title" aria-live="polite">
        <h2 id="om-verif-title" className="flex items-center gap-2 text-base font-semibold text-ink">
          <Loader2 size={17} className="animate-spin text-burgundy" aria-hidden="true" /> Paiement en cours de vérification
        </h2>
        {!late ? (
          <>
            <p className="mt-1.5 text-sm text-ink/70">Cela peut prendre 1 à 2 minutes. Cette page se met à jour toute seule dès qu’Orange Money confirme votre paiement : inutile de payer à nouveau.</p>
            <p className="mt-1 text-sm text-ink/55">Montant : {formatFCFA(order.total)}</p>
          </>
        ) : (
          <>
            <p className="mt-1.5 text-sm text-ink/70">Votre paiement n’est toujours pas confirmé. Si vous avez été débité, ne payez pas une seconde fois : la confirmation peut encore arriver, sinon <button type="button" onClick={() => navigate('/info/contact')} className="font-medium text-burgundy hover:underline">contactez-nous</button>.</p>
            <p className="mt-1 text-sm text-ink/70">Si vous n’avez pas validé le paiement dans Max It, vous pouvez réessayer.</p>
          </>
        )}
        <button type="button" onClick={() => void checkNow()} disabled={checking} className="btn-outline mt-4 w-full gap-2">
          {checking ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Vérifier maintenant
        </button>
        {late && resumable && (
          qr
            ? (handheld && retryLink
              ? <a href={retryLink} onClick={() => markLaunched(qr.transactionId)} className="btn-primary mt-3 w-full">Réessayer le paiement</a>
              : <button type="button" onClick={backToPayment} className="btn-primary mt-3 w-full">Réessayer le paiement</button>)
            : <button type="button" onClick={() => void start()} disabled={loading} className="btn-primary mt-3 w-full gap-2">
                {loading ? <><Loader2 size={16} className="animate-spin" /> Un instant…</> : 'Réessayer le paiement'}
              </button>
        )}
        {!late && launch?.local && qr && (
          <button type="button" onClick={backToPayment} className="mx-auto mt-3 block min-h-[44px] text-sm text-ink/55 underline">
            Max It ne s’est pas ouvert ? Revenir au paiement
          </button>
        )}
        {error && <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-red-50 p-3 text-sm text-red-700"><AlertTriangle size={15} className="mt-0.5 flex-shrink-0" /> {error}</p>}
      </section>
    );
  }

  const showImage = !!qr?.qrCode && (!handheld || showQr || (!qr.maxitLink && !qr.omLink));
  // Écran volontairement minimal : le montant, UN bouton principal, et la page se met à jour seule.
  // Max It en priorité (application Orange actuelle), Orange Money seulement à défaut.
  const appLink = qr?.maxitLink ?? qr?.omLink ?? null;
  const appName = qr?.maxitLink ? 'Max It' : 'Orange Money';

  return (
    <section className="card mb-5 p-5" aria-labelledby="om-pay-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="om-pay-title" className="text-base font-semibold text-ink">Payer avec Orange Money</h2>
        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800" aria-label={`Temps restant pour payer : ${formatRemaining(remaining)}`}>
          <Clock size={12} /> {formatRemaining(remaining)}
        </span>
      </div>
      <p className="mt-1 text-2xl font-semibold text-ink">{formatFCFA(order.total)}</p>

      {error && <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-red-50 p-3 text-sm text-red-700"><AlertTriangle size={15} className="mt-0.5 flex-shrink-0" /> {error}</p>}

      {view === 'failed' && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="status">
          <span className="font-semibold">Paiement non abouti.</span> Orange Money n’a confirmé aucun paiement pour cette tentative. Vous pouvez réessayer.
        </p>
      )}

      {(view === 'start' || view === 'failed') && (
        <div className="mt-4">
          {resumable ? (
            <button type="button" onClick={() => void start()} disabled={loading} className="btn-primary w-full gap-2">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Un instant…</> : view === 'failed' ? 'Réessayer le paiement' : 'Payer maintenant'}
            </button>
          ) : (
            <p className="text-sm text-ink/60">Le délai de paiement est presque terminé : il n’est plus possible de payer cette commande.</p>
          )}
        </div>
      )}

      {view === 'qr' && qr && (
        <div className="mt-4 space-y-3">
          {handheld && appLink && (
            <a href={appLink} onClick={() => markLaunched(qr.transactionId)} className="btn-primary w-full">Payer dans {appName}</a>
          )}
          {handheld && appLink && qr.qrCode && (
            // Discret mais visible : encadré crème (identité Ezial), jamais un second bouton plein
            // qui concurrencerait « Payer dans Max It ». Toute la zone est cliquable (≥ 44 px).
            <button
              type="button"
              onClick={() => setShowQr((v) => !v)}
              aria-expanded={showQr}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-2xl border border-beige bg-cream px-4 py-3 text-left transition-colors hover:border-burgundy/40 active:bg-beige/40"
            >
              <QrCode size={26} strokeWidth={1.25} className="flex-shrink-0 text-burgundy" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-ink/70">{showQr ? 'Code QR affiché ci-dessous.' : `Vous n’avez pas ${appName} sur cet appareil ?`}</span>
                <span className="mt-0.5 block text-sm font-semibold text-burgundy">{showQr ? 'Masquer le code QR' : 'Afficher le code QR'}</span>
              </span>
              <ChevronRight size={18} strokeWidth={1.5} className={`flex-shrink-0 text-burgundy transition-transform ${showQr ? 'rotate-90' : ''}`} aria-hidden="true" />
            </button>
          )}
          {showImage && qr.qrCode && (
            <div className="flex flex-col items-center gap-2">
              <img src={`data:image/png;base64,${qr.qrCode}`} alt={`QR code de paiement Orange Money de ${formatFCFA(order.total)}`} width={220} height={220} className="h-[220px] w-[220px] object-contain [image-rendering:pixelated]" />
              <p className="text-center text-sm text-ink/60">{handheld ? 'Scannez ce code avec Max It ou Orange Money depuis un autre téléphone.' : 'Scannez avec Max It ou Orange Money.'}</p>
            </div>
          )}
          <p className="flex items-center justify-center gap-2 text-center text-sm text-ink/60" aria-live="polite">
            <Loader2 size={14} className="animate-spin text-burgundy" /> En attente de votre paiement…
          </p>
        </div>
      )}
    </section>
  );
}
