import { useState } from 'react';
import type { SubscriptionProvider } from '@/lib/subscriptionPaymentCore';
import { paymentMethods } from '@/data/payments';
import SubscriptionOrangePayment from '../../components/SubscriptionOrangePayment';
import SubscriptionWavePayment from '../../components/SubscriptionWavePayment';
import { CANCELLATION_RULES } from '@/shared/plans.js';
import { usePro } from '../../ProContext';
import { billingPeriodFromQuery } from '@/lib/supabaseSellerSubscription';
import {
  PLUS_PLAN_NAME, PLUS_BILLING, PLUS_ANNUAL_REFERENCE_PRICE_FCFA, PLUS_ANNUAL_SAVINGS_FCFA, BILLING_PERIOD_LABEL,
  FREE_PRODUCT_LIMIT, FREE_COMMISSION_PERCENT, PLUS_SAME_BENEFITS_NOTE, formatFcfa, type BillingPeriod,
} from '@/data/subscriptionPlans';
import BillingPeriodToggle from '@/components/BillingPeriodToggle';
import { ArrowLeft, Smartphone, Wallet } from 'lucide-react';

// Paiement de l'abonnement Ezial Plus avec Wave ou Orange Money (au choix, comme les commandes). Le montant n'est jamais
// envoyé : la base le recalcule depuis la périodicité. L'abonnement est activé TOUT SEUL par la base à la confirmation
// de l'opérateur ; il n'existe plus de « demande » ni de paiement hors du site. Aucun paiement en espèces.
export default function SellerSubscriptionPayment() {
  const { navigate, sellerSupabaseShopId } = usePro();
  const [paid, setPaid] = useState(false);
  const [provider, setProvider] = useState<SubscriptionProvider>('orange_money');
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

      {/* Moyen de paiement : Wave ou Orange Money (mêmes cartes que le paiement d'une commande) */}
      {sellerSupabaseShopId && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Wallet size={17} className="text-burgundy" aria-hidden="true" /> Mode de paiement</h2>
          <div role="radiogroup" aria-label="Mode de paiement" className="space-y-2">
            {paymentMethods.map((p) => {
              const active = provider === p.id;
              return (
                <button key={p.id} type="button" role="radio" aria-checked={active} onClick={() => setProvider(p.id as SubscriptionProvider)} className={`opt-row min-h-[44px] items-center !p-4 ${active ? 'opt-row-active' : ''}`}>
                  <Smartphone size={19} className={`flex-shrink-0 ${active ? 'text-burgundy' : 'text-ink/40'}`} aria-hidden="true" />
                  <p className="text-sm font-medium text-ink">{p.label}</p>
                  <span aria-hidden="true" className={`ml-auto flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border ${active ? 'border-burgundy' : 'border-ink/30'}`}>
                    {active && <span className="h-2.5 w-2.5 rounded-full bg-burgundy" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Paiement : le composant du moyen choisi */}
      {sellerSupabaseShopId ? (
        provider === 'wave'
          ? <SubscriptionWavePayment key={`${period}-wave`} shopId={sellerSupabaseShopId} period={period} amount={priceFcfa} onPaid={() => setPaid(true)} />
          : <SubscriptionOrangePayment key={`${period}-orange_money`} shopId={sellerSupabaseShopId} period={period} amount={priceFcfa} onPaid={() => setPaid(true)} />
      ) : (
        <div className="card p-5 text-sm text-ink/60">Votre compte vendeur n’est relié à aucune boutique. Contactez Ezial.</div>
      )}
      {paid && (
        <button onClick={() => navigate('/seller/abonnement')} className="btn-outline w-full">Voir mon abonnement</button>
      )}

      <p className="text-xs text-ink/45 text-center">
        Important : après un premier abonnement {PLUS_PLAN_NAME} payé, cette boutique ne revient plus au forfait Free. À l’expiration, elle conserve ses données et ses produits ; jusqu’au renouvellement, elle est soumise aux limites de Free ({FREE_PRODUCT_LIMIT} produits publiés, commission de {FREE_COMMISSION_PERCENT} %). L’abonnement est activé automatiquement, uniquement après la confirmation du paiement par Wave ou Orange Money.
      </p>
      <p className="text-xs text-ink/45 text-center">
        {CANCELLATION_RULES}{' '}
        <a href="/info/politique-de-resiliation/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-burgundy">Politique de résiliation</a>
      </p>
    </div>
  );
}
