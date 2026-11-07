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
  billingPeriodOfPayment,
  subscriptionPaymentRoute,
  type SellerSubscriptionInfo,
  type SubscriptionPaymentRow,
} from '@/lib/supabaseSellerSubscription';
import { BILLING_PERIOD_LABEL, PLUS_PLAN_NAME, formatFcfa } from '@/data/subscriptionPlans';
import { Crown } from 'lucide-react';

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
    ]).then(([sub, count, pays]) => {
      if (cancelled) return;
      setInfo(sub);
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
      </div>

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
