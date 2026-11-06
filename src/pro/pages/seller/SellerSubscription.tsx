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
import { BILLING_PERIOD_LABEL, formatFcfa } from '@/data/subscriptionPlans';
import { Crown, Package, Calendar, Percent, Hourglass, Wallet, Repeat } from 'lucide-react';

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
      fetchSellerSubscription(sellerSupabaseShopId),
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
  }, [sellerSupabaseShopId]);

  const hasPendingPayment = payments.some((p) => p.status === 'pending_review');

  if (sellerShopIsOfficial) {
    return (
      <div className="card p-10 text-center">
        <Crown size={36} className="mx-auto text-ink/20" />
        <p className="mt-3 text-sm text-ink/55">Les boutiques officielles Ezial ne sont pas soumises aux abonnements.</p>
      </div>
    );
  }

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
  const startedAt = info.isTrialActive ? info.trialStart : info.proStartedAt;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Mon abonnement</h1>
        <p className="mt-1 text-sm text-ink/55">Votre forfait Ezial et vos limites de produits</p>
      </div>

      {/* Current plan summary */}
      <div className="card p-5">
        <div className="flex items-center gap-2">
          <Crown size={18} className={info.isProActive ? 'text-burgundy' : 'text-ink/30'} />
          <p className="font-display text-lg font-semibold text-ink">{summary.name}</p>
        </div>

        {hasPendingPayment && (
          <p className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
            Votre demande de paiement est en cours de vérification par Ezial.
          </p>
        )}

        {info.isPremiumExpired && (
          <p className="mt-3 rounded-lg bg-burgundy/5 border border-burgundy/20 px-3 py-2 text-xs text-burgundy">
            Votre abonnement Ezial Plus a expiré. Vos données et commandes restent accessibles ; renouvelez pour retrouver vos 30 produits, votre badge et la commission à 8 %. Cette boutique ne peut plus revenir au forfait Free.
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          {summary.amountLabel && (
            <div className="rounded-lg bg-cream p-3">
              <p className="text-xs font-medium text-ink/50 flex items-center gap-1.5"><Wallet size={13} /> Montant</p>
              <p className="mt-1 text-lg font-semibold text-ink">{summary.amountLabel}</p>
            </div>
          )}
          {summary.periodLabel && (
            <div className="rounded-lg bg-cream p-3">
              <p className="text-xs font-medium text-ink/50 flex items-center gap-1.5"><Repeat size={13} /> Périodicité</p>
              <p className="mt-1 text-lg font-semibold text-ink">{summary.periodLabel}</p>
            </div>
          )}
          <div className="rounded-lg bg-cream p-3">
            <p className="text-xs font-medium text-ink/50 flex items-center gap-1.5"><Package size={13} /> Produits publiés</p>
            <p className="mt-1 text-lg font-semibold text-ink">{activeCount} / {info.productLimit}</p>
          </div>
          <div className="rounded-lg bg-cream p-3">
            <p className="text-xs font-medium text-ink/50 flex items-center gap-1.5"><Percent size={13} /> Commission applicable</p>
            <p className="mt-1 text-lg font-semibold text-ink">{info.commissionPercent} %</p>
          </div>
          {startedAt && (
            <div className="rounded-lg bg-cream p-3">
              <p className="text-xs font-medium text-ink/50 flex items-center gap-1.5"><Calendar size={13} /> Début de l'abonnement</p>
              <p className="mt-1 text-lg font-semibold text-ink">{formatDate(startedAt)}</p>
            </div>
          )}
          {(info.isProActive || info.isPremiumExpired) && info.proUntil && (
            <div className="rounded-lg bg-cream p-3">
              <p className="text-xs font-medium text-ink/50 flex items-center gap-1.5"><Calendar size={13} /> {info.isProActive ? "Date d'expiration" : 'Expiré le'}</p>
              <p className="mt-1 text-lg font-semibold text-ink">{formatDate(info.proUntil)}</p>
            </div>
          )}
          {info.isTrialActive && info.trialDaysRemaining !== null && (
            <div className="rounded-lg bg-cream p-3 col-span-2">
              <p className="text-xs font-medium text-ink/50 flex items-center gap-1.5"><Hourglass size={13} /> Jours restants de l'essai</p>
              <p className="mt-1 text-lg font-semibold text-ink">{info.trialDaysRemaining} jour{info.trialDaysRemaining > 1 ? 's' : ''}</p>
            </div>
          )}
        </div>
      </div>

      {/* Same Free / Ezial Plus cards as the signup flow; a renewal starts
          on the seller's last paid billing period. */}
      <PricingCards
        freeIsCurrent={!info.isProActive && !info.isPremiumExpired}
        freeOfferDisallowed={info.premiumPaidEver}
        premiumStatus={info.isProActive ? (info.isTrialActive ? 'trial' : 'paid') : (info.isPremiumExpired ? 'expired' : null)}
        trialEligible={!info.trialUsed && !info.premiumPaidEver}
        initialPeriod={summary.billingPeriod ?? 'quarterly'}
        onStartTrial={() => navigate('/seller/abonnement/essai')}
        onSubscribe={(period) => navigate(subscriptionPaymentRoute(period))}
        subscribeButtonLabel={(info.isProActive && !info.isTrialActive) || info.isPremiumExpired ? 'Renouveler Ezial Plus' : 'S’abonner à Ezial Plus'}
      />

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
