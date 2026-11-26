import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, Loader2, QrCode, RefreshCw } from 'lucide-react';
import { formatFcfa } from '@/data/subscriptionPlans';
import type { SubscriptionPayPeriod } from '@/lib/subscriptionPaymentCore';
import { formatRemaining, isHandheld } from '@/lib/orderPayment';
import { attemptView, forgetLaunch, readLaunch, rememberLaunch, VERIFY_POLL_MS } from '@/lib/paymentReturn';
import type { OrangeQr } from '@/lib/supabaseOrangeMoney';
import { fetchSubscriptionAttemptState, startSubscriptionPayment, type SubscriptionAttemptState } from '@/lib/supabaseSubscriptionPayment';

// Paiement de l'abonnement Ezial Plus avec Orange Money (« QR CODE – OM »), même écran que le paiement d'une commande :
//   * téléphone / tablette : « Payer dans Max It » (action explicite) + encadré « Afficher le code QR » ;
//   * ordinateur : QR à scanner ; compte à rebours de validité (30 min) ;
//   * l'état réel est relu régulièrement et au retour dans l'application ; « Abonnement activé » seulement quand la base
//     (après confirmation d'Orange) l'a dit ; jamais de second paiement créé automatiquement : un nouveau QR n'est créé
//     que sur action explicite de la personne.
export default function SubscriptionOrangePayment({ shopId, period, amount, onPaid }: { shopId: string; period: SubscriptionPayPeriod; amount: number; onPaid: () => void }) {
  const launchKey = `abo-${shopId}`;
  const [now, setNow] = useState(() => Date.now());
  const [attempt, setAttempt] = useState<SubscriptionAttemptState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [qr, setQr] = useState<OrangeQr | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [launch, setLaunch] = useState<{ at: number; ref: string | null } | null>(() => readLaunch(launchKey));
  const [paid, setPaid] = useState(false);
  const announced = useRef(false);
  const opened = useRef(false);
  const handheld = useMemo(() => typeof navigator !== 'undefined'
    && isHandheld(navigator.userAgent, typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches), []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    const latest = await fetchSubscriptionAttemptState(shopId);
    if (latest === undefined) return; // lecture impossible : on garde l'état connu
    // Une tentative en attente ou échouée d'un autre moyen (Wave) ne concerne pas cet écran.
    setAttempt(latest && latest.state !== 'paid' && latest.provider !== 'orange_money' ? null : latest);
    setLoaded(true);
  }, [shopId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Paiement confirmé par la base : annoncé une seule fois.
  useEffect(() => {
    if (attempt?.state !== 'paid' || announced.current) return;
    announced.current = true;
    forgetLaunch(launchKey);
    setPaid(true);
    onPaid();
  }, [attempt, launchKey, onPaid]);

  const waiting = !paid && (attempt?.state === 'pending' || (!!qr && !attempt));
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(() => { void refresh(); }, launch ? VERIFY_POLL_MS : 5000);
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
  }, [waiting, launch, refresh]);

  const start = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await startSubscriptionPayment(shopId, period);
    setLoading(false);
    if ('error' in res) { setError(res.error); void refresh(); return; }
    if (!('qr' in res)) { setError('Orange Money n’a pas renvoyé de QR code. Réessayez dans un instant.'); return; }
    forgetLaunch(launchKey);
    setLaunch(null);
    setShowQr(false);
    setQr(res.qr);
    setAttempt({ attemptId: res.qr.transactionId, state: 'pending', period, provider: 'orange_money', expiresAt: res.qr.validUntil, createdAt: new Date().toISOString() });
    setLoaded(true);
  }, [shopId, period, launchKey, refresh]);

  const markLaunched = useCallback((ref: string) => setLaunch({ at: rememberLaunch(launchKey, ref), ref }), [launchKey]);

  const link = qr?.maxitLink ?? qr?.omLink ?? null;
  const validQr = !!qr && Date.parse(qr.validUntil) > now;
  const launchedAt = launch && attempt && (!launch.ref || launch.ref === attempt.attemptId) ? launch.at : null;
  const status = attempt ? (attempt.state === 'paid' ? 'confirmed' : attempt.state === 'pending' ? 'pending' : attempt.state) : null;
  // Une tentative en attente dont nous n'avons plus le QR (page rouverte) : « Reprendre » (réutilise le même QR côté serveur).
  const view = paid ? 'paid' : attemptView({ loaded, status, hasValidQr: validQr, launchedAt, now });

  // Ouverture directe de Max It après le clic sur « Payer » (téléphone uniquement, une fois par tentative).
  const [autoOpen, setAutoOpen] = useState(false);
  useEffect(() => {
    if (!autoOpen || !handheld || view !== 'qr' || !qr || !link || opened.current) return;
    opened.current = true;
    markLaunched(qr.transactionId);
    window.location.assign(link);
  }, [autoOpen, handheld, view, qr, link, markLaunched]);

  const payClick = async () => { setAutoOpen(true); await start(); };
  const checkNow = async () => { setChecking(true); await refresh(); setChecking(false); };
  const backToPayment = () => { forgetLaunch(launchKey); setLaunch(null); setShowQr(false); };
  const remaining = qr ? Date.parse(qr.validUntil) - now : 0;
  const appName = qr?.maxitLink ? 'Max It' : 'Orange Money';
  const price = formatFcfa(amount);

  if (view === 'paid') {
    return (
      <div className="card flex items-start gap-3 p-5" role="status" aria-live="polite">
        <CheckCircle2 size={22} className="mt-0.5 flex-shrink-0 text-green-700" />
        <div>
          <p className="text-base font-semibold text-ink">Abonnement activé, merci !</p>
          <p className="mt-0.5 text-sm text-ink/60">Orange Money a confirmé votre paiement de {price}. Votre abonnement Ezial Plus est actif.</p>
        </div>
      </div>
    );
  }

  if (view === 'loading') {
    return <div className="card flex items-center justify-center gap-2 p-5 text-sm text-ink/60" role="status"><Loader2 size={16} className="animate-spin text-burgundy" /> Chargement du paiement…</div>;
  }

  if (view === 'verifying' || view === 'verifying_retry') {
    const late = view === 'verifying_retry';
    return (
      <section className="card p-5" aria-labelledby="abo-verif-title" aria-live="polite">
        <h2 id="abo-verif-title" className="flex items-center gap-2 text-base font-semibold text-ink">
          <Loader2 size={17} className="animate-spin text-burgundy" aria-hidden="true" /> Paiement en cours de vérification…
        </h2>
        {!late ? (
          <p className="mt-1.5 text-sm text-ink/70">Cela peut prendre 1 à 2 minutes. Cette page se met à jour toute seule dès qu’Orange Money confirme votre paiement : inutile de payer à nouveau.</p>
        ) : (
          <p className="mt-1.5 text-sm text-ink/70">Votre paiement n’est toujours pas confirmé. Si vous avez été débité, ne payez pas une seconde fois : la confirmation peut encore arriver, sinon contactez-nous. Si vous n’avez pas validé le paiement dans Max It, vous pouvez réessayer.</p>
        )}
        <p className="mt-1 text-sm text-ink/55">Montant : {price}</p>
        <button type="button" onClick={() => void checkNow()} disabled={checking} className="btn-outline mt-4 w-full gap-2">
          {checking ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Vérifier maintenant
        </button>
        {late && (
          <button type="button" onClick={qr ? backToPayment : () => void payClick()} disabled={loading} className="btn-primary mt-3 w-full gap-2">
            {loading ? <><Loader2 size={16} className="animate-spin" /> Un instant…</> : 'Réessayer le paiement'}
          </button>
        )}
        {!late && launch && qr && (
          <button type="button" onClick={backToPayment} className="mx-auto mt-3 block min-h-[44px] text-sm text-ink/55 underline">Max It ne s’est pas ouvert ? Revenir au paiement</button>
        )}
      </section>
    );
  }

  const showImage = !!qr?.qrCode && (!handheld || showQr || !link);
  return (
    <section className="card p-5" aria-labelledby="abo-pay-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="abo-pay-title" className="text-base font-semibold text-ink">Payer avec Orange Money</h2>
        {view === 'qr' && qr && (
          <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800" aria-label={`Temps restant pour payer : ${formatRemaining(remaining)}`}>
            <Clock size={12} /> {formatRemaining(remaining)}
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-semibold text-ink">{price}</p>
      {error && <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-red-50 p-3 text-sm text-red-700"><AlertTriangle size={15} className="mt-0.5 flex-shrink-0" /> {error}</p>}
      {view === 'failed' && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="status"><span className="font-semibold">Paiement non abouti.</span> Orange Money n’a confirmé aucun paiement pour cette tentative. Vous pouvez réessayer.</p>
      )}
      {(view === 'start' || view === 'failed') && (
        <div className="mt-4">
          <button type="button" onClick={() => void payClick()} disabled={loading} className="btn-primary w-full gap-2">
            {loading ? <><Loader2 size={16} className="animate-spin" /> Un instant…</> : attempt?.state === 'pending' ? 'Reprendre le paiement' : view === 'failed' ? 'Réessayer le paiement' : `Payer ${price} avec Orange Money`}
          </button>
          <p className="mt-2 text-center text-xs text-ink/50">Le QR est valable 30 minutes. Aucun prélèvement automatique.</p>
        </div>
      )}
      {view === 'qr' && qr && (
        <div className="mt-4 space-y-3">
          {handheld && link && <a href={link} onClick={() => markLaunched(qr.transactionId)} className="btn-primary w-full">Payer dans {appName}</a>}
          {handheld && link && qr.qrCode && (
            <button type="button" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-2xl border border-beige bg-cream px-4 py-3 text-left transition-colors hover:border-burgundy/40 active:bg-beige/40">
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
              <img src={`data:image/png;base64,${qr.qrCode}`} alt={`QR code de paiement Orange Money de ${price}`} width={220} height={220} className="h-[220px] w-[220px] object-contain [image-rendering:pixelated]" />
              <p className="text-center text-sm text-ink/60">{handheld ? 'Scannez ce code avec Max It ou Orange Money depuis un autre téléphone.' : 'Scannez avec Max It ou Orange Money.'}</p>
            </div>
          )}
          <p className="flex items-center justify-center gap-2 text-center text-sm text-ink/60" aria-live="polite"><Loader2 size={14} className="animate-spin text-burgundy" /> En attente de votre paiement…</p>
        </div>
      )}
    </section>
  );
}
