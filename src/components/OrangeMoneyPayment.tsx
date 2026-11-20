import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw } from 'lucide-react';
import { useApp, type Order } from '@/store/AppContext';
import { formatFCFA } from '@/data/products';
import { canResumePayment, formatRemaining, isHandheld, paymentPhase } from '@/lib/orderPayment';
import { fetchOpenOrangeQr, fetchOrderPaymentState, startOrangeMoneyPayment, type OrangeQr } from '@/lib/supabaseOrangeMoney';

// Paiement d'une commande Orange Money (« QR CODE – OM »).
//   * Téléphone / tablette : un bouton qui ouvre Max It (ou Orange Money) (action explicite
//     de la personne : iOS bloque l'ouverture automatique d'une application).
//   * Ordinateur : QR code à scanner avec le téléphone.
//   * La page relit l'état réel de la commande toutes les 5 s et dès le retour dans
//     l'application ; elle n'affiche « payé » que lorsque la base l'a confirmé.
export default function OrangeMoneyPayment({ order, autoStart = false }: { order: Order; autoStart?: boolean }) {
  const { patchOrder, navigate } = useApp();
  const [now, setNow] = useState(() => Date.now());
  const [qr, setQr] = useState<OrangeQr | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [showQr, setShowQr] = useState(false);
  const started = useRef(false);
  const orderId = order.supabaseOrderId;
  const phase = paymentPhase(order, now);
  const handheld = useMemo(() => typeof navigator !== 'undefined'
    && isHandheld(navigator.userAgent, typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches), []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    if (!orderId) return;
    const state = await fetchOrderPaymentState(orderId);
    if (state) patchOrder(order.id, state);
  }, [orderId, order.id, patchOrder]);

  // Relecture de l'état : régulière, et immédiate au retour dans l'application (après Max It).
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
    const res = await startOrangeMoneyPayment(orderId);
    setLoading(false);
    if ('error' in res) {
      setError(res.error);
      void refresh();
      return;
    }
    setQr(res.qr);
  }, [orderId, refresh]);

  // QR déjà créé et encore valable (page rechargée) ; sinon création automatique si demandée.
  // Une seule lecture par affichage (verrou « started ») ; son résultat n'est ignoré que si le
  // composant a réellement disparu (un effet relancé ne doit pas perdre le QR déjà créé).
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
      const existing = await fetchOpenOrangeQr(orderId);
      if (!mounted.current) return;
      if (existing) setQr(existing);
      else if (autoStart) await start();
    })();
  }, [orderId, awaiting, autoStart, start]);

  const checkNow = async () => {
    setChecking(true);
    await refresh();
    setChecking(false);
  };

  if (!orderId || phase === 'offline') return null;

  if (phase === 'paid') {
    return (
      <div className="card mb-5 flex items-start gap-3 p-5" role="status">
        <CheckCircle2 size={20} className="mt-0.5 flex-shrink-0 text-green-700" />
        <div>
          <p className="text-sm font-semibold text-ink">Paiement Orange Money reçu</p>
          <p className="mt-0.5 text-sm text-ink/60">Votre commande est confirmée : les boutiques la préparent.</p>
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
  const qrExpired = !!qr && Date.parse(qr.validUntil) <= now;
  const resumable = canResumePayment(order, now);
  const showImage = !!qr?.qrCode && (!handheld || showQr || (!qr.maxitLink && !qr.omLink));

  // Écran volontairement minimal : le montant, UN bouton, et la page se met à jour seule.
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

      {(!qr || qrExpired) && (
        <div className="mt-4">
          {resumable ? (
            <button type="button" onClick={() => void start()} disabled={loading} className="btn-primary w-full gap-2">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Un instant…</> : 'Payer maintenant'}
            </button>
          ) : (
            <p className="text-sm text-ink/60">Le délai de paiement est presque terminé : il n’est plus possible de payer cette commande.</p>
          )}
        </div>
      )}

      {qr && !qrExpired && (
        <div className="mt-4 space-y-3">
          {handheld && appLink && (
            <a href={appLink} className="btn-primary w-full">Payer dans {appName}</a>
          )}
          {showImage && qr.qrCode && (
            <div className="flex flex-col items-center gap-2">
              <img src={`data:image/png;base64,${qr.qrCode}`} alt={`QR code de paiement Orange Money de ${formatFCFA(order.total)}`} width={220} height={220} className="h-[220px] w-[220px] object-contain [image-rendering:pixelated]" />
              <p className="text-center text-sm text-ink/60">Scannez avec Max It ou Orange Money.</p>
            </div>
          )}
          <p className="flex items-center justify-center gap-2 text-center text-sm text-ink/60" aria-live="polite">
            <Loader2 size={14} className="animate-spin text-burgundy" /> En attente de votre paiement…
          </p>
          {handheld && appLink && qr.qrCode && (
            <button type="button" onClick={() => setShowQr((v) => !v)} className="mx-auto block text-xs text-ink/50 underline">
              {showQr ? 'Masquer le QR code' : 'Payer avec un autre téléphone'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
