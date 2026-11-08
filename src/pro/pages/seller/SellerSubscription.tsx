import { useEffect, useState } from 'react';
import { usePro } from '../../ProContext';
import { formatDate } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import PricingCards from '@/components/PricingCards';
import {
  fetchSellerSubscription,
  fetchActiveProductCount,
  fetchSubscriptionPayments,
  summarizeCurrentPlan,
  fetchCancellationState,
  cancelSellerSubscription,
  resumeSellerSubscription,
  billingPeriodOfPayment,
  subscriptionPaymentRoute,
  type SellerSubscriptionInfo,
  type SubscriptionPaymentRow,
  type CancellationState,
} from '@/lib/supabaseSellerSubscription';
import { BILLING_PERIOD_LABEL, PLUS_PLAN_NAME, formatFcfa } from '@/data/subscriptionPlans';
import { CANCELLATION_RULES } from '@/shared/plans.js';
import { Crown, Loader2 } from 'lucide-react';

// "Mon abonnement". A Free shop sees the Free / Ezial Plus cards to
// subscribe. A shop that is (or was) on Ezial Plus sees only its current
// status — formule, échéance — and the actions that apply to it; the cards
// are not shown again. The official Ezial shop is always Ezial Plus, with
// no action at all.

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-cream px-3 py-2.5">
      <p className="text-[11px] font-medium text-ink/50">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

export default function SellerSubscription() {
  const { sellerSupabaseShopId, sellerShopIsOfficial, navigate } = usePro();
  const [info, setInfo] = useState<SellerSubscriptionInfo | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [payments, setPayments] = useState<SubscriptionPaymentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cancellation, setCancellation] = useState<CancellationState>({ supported: false, requestedAt: null });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelAccepted, setCancelAccepted] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState('');

  useEffect(() => {
    if (!sellerSupabaseShopId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      fetchSellerSubscription(sellerSupabaseShopId, { isOfficial: sellerShopIsOfficial }),
      fetchActiveProductCount(sellerSupabaseShopId),
      fetchSubscriptionPayments(sellerSupabaseShopId),
      fetchCancellationState(sellerSupabaseShopId),
    ]).then(([sub, count, pays, cancel]) => {
      if (cancelled) return;
      setInfo(sub);
      setCancellation(cancel);
      setActiveCount(count);
      setPayments(pays);
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [sellerSupabaseShopId, sellerShopIsOfficial]);

  if (!sellerSupabaseShopId) {
    return (
      <div className="card p-10 text-center">
        <Crown size={36} className="mx-auto text-ink/20" />
        <p className="mt-3 text-sm text-ink/55">Votre compte vendeur n'est relié à aucune boutique Supabase réelle. Contactez EZIAL.</p>
      </div>
    );
  }

  if (isLoading || !info) {
    return <div className="p-10 text-center"><p className="text-sm text-ink/50">Chargement…</p></div>;
  }

  const summary = summarizeCurrentPlan(info, payments);
  const isOfficial = info.isOfficial;
  const isFree = !isOfficial && !info.isProActive && !info.isPremiumExpired;
  const isPaidActive = !isOfficial && info.isProActive && !info.isTrialActive;
  const hasPendingPayment = !isOfficial && payments.some((p) => p.status === 'pending_review');
  // A renewal or a trial → paid subscription starts on the seller's last
  // paid billing period; the payment page lets them switch it.
  const subscribeRoute = subscriptionPaymentRoute(summary.billingPeriod ?? 'quarterly');

  // Résiliation : seulement pour un abonnement payant en cours (pas l'essai).
  const canCancel = isPaidActive && cancellation.supported;
  const isCancelled = canCancel && cancellation.requestedAt !== null;

  const closeCancel = () => { if (!cancelBusy) { setCancelOpen(false); setCancelAccepted(false); setCancelError(''); } };
  const confirmCancel = async () => {
    setCancelBusy(true); setCancelError('');
    const result = await cancelSellerSubscription();
    setCancelBusy(false);
    if (result.error) { setCancelError(result.error); return; }
    setCancellation({ supported: true, requestedAt: new Date().toISOString() });
    setCancelOpen(false); setCancelAccepted(false);
  };
  const resume = async () => {
    setCancelBusy(true); setCancelError('');
    const result = await resumeSellerSubscription();
    setCancelBusy(false);
    if (result.error) { setCancelError(result.error); return; }
    setCancellation({ supported: true, requestedAt: null });
  };

  const facts: { label: string; value: string }[] = [];
  if (!isOfficial) {
    if (info.isProActive && info.proUntil) {
      const days = info.isTrialActive ? info.trialDaysRemaining : null;
      facts.push({
        label: info.isTrialActive ? 'Fin de l’essai' : 'Échéance',
        value: `${formatDate(info.proUntil)}${days !== null ? ` · ${days} jour${days > 1 ? 's' : ''} restant${days > 1 ? 's' : ''}` : ''}`,
      });
    } else if (info.isPremiumExpired && info.proUntil) {
      facts.push({ label: 'Expiré le', value: formatDate(info.proUntil) });
    } else if (isFree) {
      facts.push({ label: 'Échéance', value: 'Sans limite de durée' });
    }
    if (isPaidActive && (summary.amountLabel || summary.periodLabel)) {
      facts.push({ label: 'Formule', value: [summary.periodLabel, summary.amountLabel].filter(Boolean).join(' · ') });
    }
    facts.push({ label: 'Produits publiés', value: `${activeCount} / ${info.productLimit}` });
    facts.push({ label: 'Commission', value: `${info.commissionPercent} %` });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Mon abonnement</h1>
        <p className="mt-1 text-sm text-ink/55">Votre forfait Ezial</p>
      </div>

      {/* Current plan, compact */}
      <div className="card p-5">
        <div className="flex items-center gap-2">
          <Crown size={18} className={info.isProActive ? 'text-burgundy' : 'text-ink/30'} aria-hidden="true" />
          <p className="font-display text-lg font-semibold text-ink">{summary.name}</p>
        </div>

        {hasPendingPayment && (
          <p className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
            Votre demande de paiement est en cours de vérification par Ezial.
          </p>
        )}

        {facts.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {facts.map((f) => <Fact key={f.label} label={f.label} value={f.value} />)}
          </div>
        )}

        {/* Only the actions that apply: trial → subscribe, paid or expired → renew. */}
        {!isOfficial && !isFree && (
          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
            <button onClick={() => navigate(subscribeRoute)} className="btn-primary w-full sm:w-auto">
              {info.isTrialActive ? `S’abonner à ${PLUS_PLAN_NAME}` : `Renouveler ${PLUS_PLAN_NAME}`}
            </button>
          </div>
        )}
        {info.isTrialActive && info.proUntil && (
          <p className="mt-3 text-xs text-ink/50">Sans abonnement, votre boutique repasse à Ezial Free le {formatDate(info.proUntil)}.</p>
        )}

        {isCancelled && info.proUntil && (
          <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
            <p className="font-medium">Abonnement résilié</p>
            <p className="mt-1 text-xs leading-relaxed">
              {PLUS_PLAN_NAME} reste actif jusqu’au {formatDate(info.proUntil)}, puis ne sera pas renouvelé : votre boutique repassera alors à Ezial Free. La résiliation n’est pas remboursable.
            </p>
            <button onClick={() => void resume()} disabled={cancelBusy} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold underline underline-offset-2 disabled:opacity-60">
              {cancelBusy && <Loader2 size={12} className="animate-spin" />} Annuler la résiliation
            </button>
          </div>
        )}
        {cancelError && !cancelOpen && <p className="mt-3 text-xs text-burgundy">{cancelError}</p>}

        {canCancel && !isCancelled && (
          <button onClick={() => setCancelOpen(true)} className="mt-4 text-xs font-medium text-ink/50 underline underline-offset-2 hover:text-burgundy">
            Résilier mon abonnement
          </button>
        )}
      </div>

      {/* Avertissement permanent sur les abonnements (voir la politique de résiliation) */}
      {!isOfficial && (
        <p className="text-xs leading-relaxed text-ink/45">
          {PLUS_PLAN_NAME} est résiliable à tout moment, mais non remboursable : l’abonnement payé reste actif jusqu’à la fin de la durée prévue.{' '}
          <a href="/info/politique-de-resiliation/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-burgundy">Politique de résiliation</a>
        </p>
      )}

      {cancelOpen && info.proUntil && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" onClick={closeCancel}>
          <div role="dialog" aria-modal="true" aria-labelledby="cancel-title" className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h2 id="cancel-title" className="font-display text-lg font-semibold text-ink">Résilier mon abonnement ?</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink/70">{CANCELLATION_RULES}</p>
            <p className="mt-2 text-sm font-medium text-ink">Votre abonnement reste actif jusqu’au {formatDate(info.proUntil)}.</p>
            <label className="mt-4 flex items-start gap-2.5 text-sm text-ink/75">
              <input type="checkbox" checked={cancelAccepted} onChange={(e) => setCancelAccepted(e.target.checked)} className="mt-0.5 h-5 w-5 flex-shrink-0 accent-burgundy" />
              <span>
                J’ai compris que la résiliation n’est pas remboursable. Voir la{' '}
                <a href="/info/politique-de-resiliation/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">politique de résiliation</a>.
              </span>
            </label>
            {cancelError && <p className="mt-3 text-sm text-burgundy">{cancelError}</p>}
            <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button onClick={closeCancel} disabled={cancelBusy} className="btn-outline w-full sm:w-auto">Garder mon abonnement</button>
              <button onClick={() => void confirmCancel()} disabled={!cancelAccepted || cancelBusy} className="btn-primary w-full sm:w-auto disabled:opacity-50">
                {cancelBusy ? <><Loader2 size={16} className="animate-spin" /> Résiliation…</> : 'Résilier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Free shop: the two plans, to subscribe */}
      {isFree && (
        <PricingCards
          freeIsCurrent
          freeOfferDisallowed={info.premiumPaidEver}
          trialEligible={!info.trialUsed && !info.premiumPaidEver}
          onStartTrial={() => navigate('/seller/abonnement/essai')}
          onSubscribe={(period) => navigate(subscriptionPaymentRoute(period))}
        />
      )}

      {/* Payment history */}
      {payments.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-ink mb-3">Historique des paiements</h2>
          <div className="card divide-y divide-line">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{formatFcfa(p.amount)} · {BILLING_PERIOD_LABEL[billingPeriodOfPayment(p)]} — {p.method === 'wave' ? 'Wave' : 'Orange Money'}</p>
                  <p className="text-xs text-ink/45 mt-0.5 font-mono">{p.reference}</p>
                  <p className="text-xs text-ink/40 mt-0.5">{formatDate(p.requestedAt)}</p>
                </div>
                <StatusChip
                  status={p.status}
                  label={p.status === 'pending_review' ? 'En vérification' : p.status === 'confirmed' ? 'Confirmé' : 'Refusée'}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
