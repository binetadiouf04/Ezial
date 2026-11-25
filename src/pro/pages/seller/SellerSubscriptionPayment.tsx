import { useEffect, useState } from 'react';
import { fetchTestPlanAvailable } from '@/lib/supabaseSubscriptionPayment';
import { TEST_PLAN_PRICE_FCFA } from '@/lib/subscriptionPaymentCore';
import SubscriptionOrangePayment from '../../components/SubscriptionOrangePayment';
import { CANCELLATION_RULES } from '@/shared/plans.js';
import { usePro } from '../../ProContext';
import { billingPeriodFromQuery } from '@/lib/supabaseSellerSubscription';
import {
  PLUS_PLAN_NAME, PLUS_BILLING, PLUS_ANNUAL_REFERENCE_PRICE_FCFA, PLUS_ANNUAL_SAVINGS_FCFA, BILLING_PERIOD_LABEL,
  FREE_PRODUCT_LIMIT, FREE_COMMISSION_PERCENT, PLUS_SAME_BENEFITS_NOTE, formatFcfa, type BillingPeriod,
} from '@/data/subscriptionPlans';
import BillingPeriodToggle from '@/components/BillingPeriodToggle';
import { ArrowLeft } from 'lucide-react';

// Paiement de l'abonnement Ezial Plus avec Orange Money (QR « QR CODE – OM », comme les commandes). Le montant n'est jamais
// envoyé : la base le recalcule depuis la périodicité. L'abonnement est activé TOUT SEUL par la base à la confirmation
// d'Orange ; il n'existe plus de « demande » ni de paiement hors du site. Aucun paiement en espèces. Wave suivra.
export default function SellerSubscriptionPayment() {
  const { navigate, sellerSupabaseShopId } = usePro();
  const [paid, setPaid] = useState(false);
  // Option « Test 25 FCFA » : proposée seulement si le SERVEUR répond que le compte est testeur.
  const [testAvailable, setTestAvailable] = useState(false);
  const [testMode, setTestMode] = useState(false);
  useEffect(() => { void fetchTestPlanAvailable().then(setTestAvailable); }, []);
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

      {testAvailable && (
        <label className="flex items-start gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} className="mt-0.5 h-5 w-5 flex-shrink-0 accent-burgundy" />
          <span><span className="mr-1.5 rounded bg-amber-200 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">Test</span><strong>Test {TEST_PLAN_PRICE_FCFA} FCFA</strong> : active {PLUS_PLAN_NAME} pour 1 jour seulement, pour vérifier le paiement. Réservé aux comptes testeurs.</span>
        </label>
      )}

      {/* Récapitulatif */}
      <div className="card p-5">
        <p className="text-sm font-semibold text-ink mb-3">Récapitulatif</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-ink/55">Abonnement</span><span className="font-medium text-ink">{PLUS_PLAN_NAME}</span></div>
          <div className="flex justify-between"><span className="text-ink/55">Périodicité</span><span className="font-medium text-ink">{testMode ? 'Test' : BILLING_PERIOD_LABEL[period]}</span></div>
          <div className="flex justify-between"><span className="text-ink/55">Durée</span><span className="font-medium text-ink">{testMode ? '1 jour' : `${months} mois`}</span></div>
          {isAnnual && !testMode && (
            <>
              <div className="flex justify-between"><span className="text-ink/55">Prix de référence</span><span className="text-ink/45 line-through">{formatFcfa(PLUS_ANNUAL_REFERENCE_PRICE_FCFA)}</span></div>
              <div className="flex justify-between"><span className="text-ink/55">Économie</span><span className="font-medium text-burgundy">{formatFcfa(PLUS_ANNUAL_SAVINGS_FCFA)}</span></div>
            </>
          )}
          <div className="flex justify-between border-t border-line pt-2 mt-1"><span className="font-semibold text-ink">Total{testMode ? ' (test)' : ''}</span><span className="font-display text-lg font-semibold text-burgundy">{formatFcfa(testMode ? TEST_PLAN_PRICE_FCFA : priceFcfa)}</span></div>
        </div>
      </div>

      {/* Paiement : Orange Money uniquement (Wave suivra) */}
      {sellerSupabaseShopId ? (
        <SubscriptionOrangePayment key={testMode ? 'test' : period} shopId={sellerSupabaseShopId} period={testMode ? 'test_25' : period} amount={testMode ? TEST_PLAN_PRICE_FCFA : priceFcfa} onPaid={() => setPaid(true)} />
      ) : (
        <div className="card p-5 text-sm text-ink/60">Votre compte vendeur n’est relié à aucune boutique. Contactez Ezial.</div>
      )}
      {paid && (
        <button onClick={() => navigate('/seller/abonnement')} className="btn-outline w-full">Voir mon abonnement</button>
      )}

      <p className="text-xs text-ink/45 text-center">
        Important : après un premier abonnement {PLUS_PLAN_NAME} payé, cette boutique ne revient plus au forfait Free. À l’expiration, elle conserve ses données et ses produits ; jusqu’au renouvellement, elle est soumise aux limites de Free ({FREE_PRODUCT_LIMIT} produits publiés, commission de {FREE_COMMISSION_PERCENT} %). L’abonnement est activé automatiquement, uniquement après la confirmation du paiement par Orange Money.
      </p>
      <p className="text-xs text-ink/45 text-center">
        {CANCELLATION_RULES}{' '}
        <a href="/info/politique-de-resiliation/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-burgundy">Politique de résiliation</a>
      </p>
    </div>
  );
}
