import { useState } from 'react';
import { CANCELLATION_RULES } from '@/shared/plans.js';
import { usePro } from '../../ProContext';
import { billingPeriodFromQuery, type SubscriptionPaymentMethod } from '@/lib/supabaseSellerSubscription';
import {
  PLUS_PLAN_NAME, PLUS_BILLING, PLUS_ANNUAL_REFERENCE_PRICE_FCFA, PLUS_ANNUAL_SAVINGS_FCFA, BILLING_PERIOD_LABEL,
  FREE_PRODUCT_LIMIT, FREE_COMMISSION_PERCENT, PLUS_SAME_BENEFITS_NOTE, TRIAL_DAYS, formatFcfa, type BillingPeriod,
} from '@/data/subscriptionPlans';
import BillingPeriodToggle from '@/components/BillingPeriodToggle';
import { ArrowLeft, Smartphone, AlertCircle } from 'lucide-react';

// Ezial no longer validates subscription payments manually: a payment must
// be confirmed automatically, server-side, by an authenticated Wave/Orange
// Money webhook — there is no "send the manual reference, wait for an
// admin to check it" step any more (that path, and confirmSubscriptionPayment/
// rejectSubscriptionPayment's manual-admin role in it, are retired for any
// NEW payment; see supabaseAdminSubscriptions.ts, kept only to let an admin
// resolve whatever was already pending_review before this change).
//
// Real Wave/Orange Money merchant credentials are not available yet, so
// there is nothing to wire this récapitulatif's "Payer" action to — rather
// than inventing a successful transaction or falling back to the old manual
// flow, this page says plainly that online payment is temporarily
// unavailable. Free and the 30-day trial stay fully available in the
// meantime (see SellerSubscription.tsx). When the gateway is connected, the
// payment it records carries only the billing period: the amount is set
// server-side from it (subscription_plan_price()), never taken from here.
export default function SellerSubscriptionPayment() {
  const { navigate } = usePro();
  const [method, setMethod] = useState<SubscriptionPaymentMethod>('wave');
  const [period, setPeriod] = useState<BillingPeriod>(() => billingPeriodFromQuery(window.location.search));
  const { priceFcfa, months } = PLUS_BILLING[period];
  const isAnnual = period === 'annual';

  return (
    <div className="mx-auto max-w-md space-y-6 py-2">
      <button onClick={() => navigate('/seller/abonnement')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={16} /> Retour
      </button>

      <h1 className="font-display text-xl font-semibold text-ink">S'abonner à {PLUS_PLAN_NAME}</h1>

      <BillingPeriodToggle value={period} onChange={setPeriod} />
      <p className="-mt-3 text-center text-xs text-ink/45">{PLUS_SAME_BENEFITS_NOTE}</p>

      {/* Récapitulatif */}
      <div className="card p-5">
        <p className="text-sm font-semibold text-ink mb-3">Récapitulatif</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-ink/55">Abonnement</span><span className="font-medium text-ink">{PLUS_PLAN_NAME}</span></div>
          <div className="flex justify-between"><span className="text-ink/55">Périodicité</span><span className="font-medium text-ink">{BILLING_PERIOD_LABEL[period]}</span></div>
          <div className="flex justify-between"><span className="text-ink/55">Durée</span><span className="font-medium text-ink">{months} mois</span></div>
          {isAnnual && (
            <>
              <div className="flex justify-between"><span className="text-ink/55">Prix de référence</span><span className="text-ink/45 line-through">{formatFcfa(PLUS_ANNUAL_REFERENCE_PRICE_FCFA)}</span></div>
              <div className="flex justify-between"><span className="text-ink/55">Économie</span><span className="font-medium text-burgundy">{formatFcfa(PLUS_ANNUAL_SAVINGS_FCFA)}</span></div>
            </>
          )}
          <div className="flex justify-between border-t border-line pt-2 mt-1"><span className="font-semibold text-ink">Total</span><span className="font-display text-lg font-semibold text-burgundy">{formatFcfa(priceFcfa)}</span></div>
        </div>
      </div>

      {/* Moyen de paiement */}
      <div className="card p-5">
        <p className="text-sm font-semibold text-ink mb-3">Moyen de paiement</p>
        <div className="flex gap-2">
          <button
            onClick={() => setMethod('wave')}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${method === 'wave' ? 'border-burgundy bg-burgundy/5 text-burgundy' : 'border-line text-ink/60'}`}
          >
            <Smartphone size={15} /> Wave
          </button>
          <button
            onClick={() => setMethod('orange_money')}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${method === 'orange_money' ? 'border-burgundy bg-burgundy/5 text-burgundy' : 'border-line text-ink/60'}`}
          >
            <Smartphone size={15} /> Orange Money
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <AlertCircle size={16} className="mt-0.5 flex-shrink-0 text-amber-700" />
        <p className="text-sm text-amber-800">
          Le paiement en ligne {PLUS_PLAN_NAME} est en cours d’activation : la connexion sécurisée à {method === 'wave' ? 'Wave' : 'Orange Money'} n’est pas encore ouverte. En attendant, le forfait Free et l’essai gratuit de {TRIAL_DAYS} jours d’{PLUS_PLAN_NAME} (une fois par boutique) sont disponibles.
        </p>
      </div>

      <button disabled className="btn-primary w-full opacity-50">
        Payer {formatFcfa(priceFcfa)}
      </button>

      <p className="text-xs text-ink/45 text-center">
        Important : après un premier abonnement {PLUS_PLAN_NAME} payé, cette boutique ne revient plus au forfait Free. À l’expiration, elle conserve ses données et ses produits ; jusqu’au renouvellement, elle est soumise aux limites de Free ({FREE_PRODUCT_LIMIT} produits publiés, commission de {FREE_COMMISSION_PERCENT} %). L’abonnement est activé uniquement après la confirmation authentifiée du paiement par l’opérateur.
      </p>
      <p className="text-xs text-ink/45 text-center">
        {CANCELLATION_RULES}{' '}
        <a href="/info/politique-de-resiliation/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-burgundy">Politique de résiliation</a>
      </p>
    </div>
  );
}
