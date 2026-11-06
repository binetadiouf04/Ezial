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
import {
  BILLING_PERIOD_LABEL, FREE_COMMISSION_PERCENT, PREMIUM_COMMISSION_PERCENT, PREMIUM_PRODUCT_LIMIT, PLAN_END_RULES, TRIAL_DAYS, formatFcfa,
} from '@/data/subscriptionPlans';
import { Crown, Package, Calendar, Percent, Hourglass, Wallet, Repeat, Sparkles, Info } from 'lucide-react';

// "12 décembre 2026" — the long form, for the sentences explaining a trial
// that starts on launch day.
function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Dakar' });
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
  // Trial activated before the official launch: its 30 days start on
  // launch day, while the Ezial Plus advantages are already active.
  const trialStartsLater = info.trialStartsLater && !!info.trialStart;

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

        {trialStartsLater && (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-burgundy px-4 py-3.5 text-white">
            <Sparkles size={16} className="mt-0.5 flex-shrink-0 text-champagne" aria-hidden="true" />
            <p className="text-sm leading-snug">
              <span className="font-semibold">Votre essai démarre le {formatLongDate(info.trialStart!)} ; vos avantages Ezial Plus sont déjà actifs.</span>
              <span className="mt-1 block text-xs text-white/75">
                Vous publiez dès maintenant jusqu’à {PREMIUM_PRODUCT_LIMIT} produits, avec {PREMIUM_COMMISSION_PERCENT} % de commission. Vos {TRIAL_DAYS} jours d’essai se terminent le {formatLongDate(info.proUntil!)}.
              </span>
            </p>
          </div>
        )}

        {info.isPremiumExpired && (
          <p className="mt-3 rounded-lg bg-burgundy/5 border border-burgundy/20 px-3 py-2 text-xs text-burgundy">
            Votre abonnement Ezial Plus a expiré. Vos données et vos produits sont conservés ; renouvelez pour retrouver vos {PREMIUM_PRODUCT_LIMIT} produits publiés, la commission à {PREMIUM_COMMISSION_PERCENT} %, votre badge et l’accès à la Sélection Ezial. Cette boutique ne repasse pas au forfait Free.
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
            <p className="mt-0.5 text-[11px] leading-snug text-ink/50">
              {info.isProActive
                ? `Au lieu de ${FREE_COMMISSION_PERCENT} % en Free, promotions comprises`
                : `${PREMIUM_COMMISSION_PERCENT} % avec Ezial Plus`}
            </p>
          </div>
          {startedAt && (
            <div className="rounded-lg bg-cream p-3">
              <p className="text-xs font-medium text-ink/50 flex items-center gap-1.5"><Calendar size={13} /> {info.isTrialActive ? (trialStartsLater ? "L'essai démarre le" : "Début de l'essai") : "Début de l'abonnement"}</p>
              <p className="mt-1 text-lg font-semibold text-ink">{formatDate(startedAt)}</p>
            </div>
          )}
          {(info.isProActive || info.isPremiumExpired) && info.proUntil && (
            <div className="rounded-lg bg-cream p-3">
              <p className="text-xs font-medium text-ink/50 flex items-center gap-1.5"><Calendar size={13} /> {info.isProActive ? (info.isTrialActive ? "Fin de l'essai" : "Date d'expiration") : 'Expiré le'}</p>
              <p className="mt-1 text-lg font-semibold text-ink">{formatDate(info.proUntil)}</p>
            </div>
          )}
          {info.isTrialActive && (trialStartsLater ? (
            <div className="rounded-lg bg-cream p-3 col-span-2">
              <p className="text-xs font-medium text-ink/50 flex items-center gap-1.5"><Hourglass size={13} /> Durée de l'essai</p>
              <p className="mt-1 text-lg font-semibold text-ink">{TRIAL_DAYS} jours à partir du {formatLongDate(info.trialStart!)}</p>
            </div>
          ) : info.trialDaysRemaining !== null && (
            <div className="rounded-lg bg-cream p-3 col-span-2">
              <p className="text-xs font-medium text-ink/50 flex items-center gap-1.5"><Hourglass size={13} /> Jours restants de l'essai</p>
              <p className="mt-1 text-lg font-semibold text-ink">{info.trialDaysRemaining} jour{info.trialDaysRemaining > 1 ? 's' : ''}</p>
            </div>
          ))}
        </div>

        {(info.isProActive || info.isPremiumExpired) && (
          <p className="mt-4 flex items-start gap-2 border-t border-line pt-4 text-xs leading-relaxed text-ink/55">
            <Info size={14} className="mt-0.5 flex-shrink-0 text-ink/35" aria-hidden="true" />
            <span><span className="font-medium text-ink/70">Fin d’Ezial Plus : </span>{PLAN_END_RULES}</span>
          </p>
        )}
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
