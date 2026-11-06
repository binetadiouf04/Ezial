import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import {
  FREE_COMMISSION_PERCENT, PREMIUM_COMMISSION_PERCENT, PREMIUM_PRODUCT_LIMIT, PLUS_PLAN_NAME, PLUS_BILLING,
  PLUS_ANNUAL_REFERENCE_PRICE_FCFA, PLUS_ANNUAL_SAVINGS_FCFA, PLUS_ANNUAL_DISCOUNT_PERCENT, formatFcfa, type BillingPeriod,
} from '@/data/subscriptionPlans';
import BillingPeriodToggle from './BillingPeriodToggle';

const freeBenefits = [
  'Jusqu’à 10 produits publiés',
  'Boutique personnalisée',
  'Ajout de photos et descriptions de produits',
  'Gestion des prix, tailles, couleurs et variantes',
  'Gestion des stocks',
  'Réception et suivi des commandes',
  'Tableau de bord des ventes et revenus',
  'Présence dans le catalogue Ezial',
  'Visibilité dans les recherches et catégories',
  'Possibilité de participer aux promotions générales d’Ezial',
  'Aucun abonnement à payer',
];

// Identical whichever billing period is chosen — only the price and the
// duration differ. No promise of featured placement or priority visibility.
const premiumBenefits = [
  'Tous les avantages de Free',
  `Jusqu’à ${PREMIUM_PRODUCT_LIMIT} produits publiés`,
  `Commission réduite de ${FREE_COMMISSION_PERCENT} % à ${PREMIUM_COMMISSION_PERCENT} %`,
  'Badge Ezial Plus sur la boutique',
  'Essai Ezial Plus gratuit pendant 30 jours',
];

function BenefitList({ items, muted }: { items: string[]; muted?: boolean }) {
  return (
    <ul className="mt-5 space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-sm leading-snug">
          <Check size={16} className={`mt-0.5 flex-shrink-0 ${muted ? 'text-white/80' : 'text-burgundy'}`} />
          <span className={muted ? 'text-white/90' : 'text-ink/70'}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export interface PricingCardsProps {
  /** Hidden/disabled for a seller already on Free (shows a "Forfait actuel" state instead) */
  freeIsCurrent?: boolean;
  onContinueFree?: () => void;
  freeButtonLabel?: string;
  freeButtonDisabled?: boolean;
  /** Once a seller has paid for Ezial Plus even once, Free is never offered
   * to them again — not disabled, replaced outright by an explanatory
   * message, regardless of freeIsCurrent/onContinueFree. */
  freeOfferDisallowed?: boolean;

  /** Ezial Plus state: null = not subscribed, 'trial' = trial active, 'paid' = paid plan active, 'expired' = paid before, lapsed, never offered Free again */
  premiumStatus?: 'trial' | 'paid' | 'expired' | null;
  /** Hide the trial button entirely (already used) */
  trialEligible?: boolean;
  onStartTrial?: () => void;
  onSubscribe?: (period: BillingPeriod) => void;
  subscribeButtonLabel?: string;
  /** Preselected billing period (e.g. the seller's last paid one, for a renewal) */
  initialPeriod?: BillingPeriod;
}

export default function PricingCards({
  freeIsCurrent, onContinueFree, freeButtonLabel = 'Continuer gratuitement', freeButtonDisabled, freeOfferDisallowed,
  premiumStatus = null, trialEligible = true, onStartTrial, onSubscribe, subscribeButtonLabel, initialPeriod = 'quarterly',
}: PricingCardsProps) {
  const [period, setPeriod] = useState<BillingPeriod>(initialPeriod);
  useEffect(() => { setPeriod(initialPeriod); }, [initialPeriod]);
  const isAnnual = period === 'annual';

  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-stretch">
      {/* Ezial Free — white card, discreet border */}
      <div className="flex flex-col rounded-2xl border border-line bg-white p-7 sm:p-8">
        <div>
          <p className="font-display text-xl font-semibold text-ink">Ezial Free</p>
          <p className="mt-1 text-sm text-ink/50">Gratuit, sans limite de durée.</p>
        </div>
        <div className="mt-5">
          <span className="font-display text-3xl font-semibold text-ink">0 FCFA</span>
        </div>
        <p className="mt-1.5 text-xs text-ink/45">Commission Ezial : {FREE_COMMISSION_PERCENT} % sur chaque vente.</p>

        <BenefitList items={freeBenefits} />

        <div className="mt-7">
          {freeOfferDisallowed ? (
            <div className="rounded-full border border-line bg-cream px-5 py-3 text-center text-xs text-ink/50">Non disponible : un abonnement Ezial Plus a déjà été payé sur cette boutique.</div>
          ) : freeIsCurrent ? (
            <div className="rounded-full border border-line px-5 py-3 text-center text-sm font-medium text-ink/50">Forfait actuel</div>
          ) : (
            <button
              onClick={onContinueFree}
              disabled={freeButtonDisabled}
              className="w-full rounded-full border-2 border-burgundy px-5 py-3 text-sm font-semibold text-burgundy transition-colors hover:bg-burgundy/5 disabled:opacity-50"
            >
              {freeButtonLabel}
            </button>
          )}
        </div>
      </div>

      {/* Ezial Plus — burgundy card, white text, visually emphasized */}
      <div className="flex flex-col rounded-2xl bg-burgundy p-7 text-white shadow-xl shadow-burgundy/20 sm:p-8">
        <div>
          <p className="font-display text-xl font-semibold text-white">{PLUS_PLAN_NAME}</p>
          <p className="mt-1 text-sm text-white/70">Plus de produits, une commission réduite.</p>
        </div>

        <div className="mt-5">
          <BillingPeriodToggle value={period} onChange={setPeriod} tone="dark" />
        </div>

        <div className="mt-5">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl font-semibold text-white">{formatFcfa(PLUS_BILLING[period].priceFcfa)}</span>
            <span className="text-sm font-normal text-white/70">{isAnnual ? '/an' : '/ 3 mois'}</span>
          </div>
          {isAnnual && (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-sm text-white/55 line-through">{formatFcfa(PLUS_ANNUAL_REFERENCE_PRICE_FCFA)}</span>
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white">−{PLUS_ANNUAL_DISCOUNT_PERCENT} %</span>
            </div>
          )}
          <p className="mt-1.5 text-xs text-white/60">
            {isAnnual
              ? `Payé une fois pour 12 mois — ${formatFcfa(PLUS_ANNUAL_SAVINGS_FCFA)} d’économie par an.`
              : 'Payé tous les 3 mois.'}
          </p>
        </div>
        <p className="mt-1.5 text-xs text-white/60">Commission Ezial : {PREMIUM_COMMISSION_PERCENT} % sur chaque vente.</p>

        <BenefitList items={premiumBenefits} muted />

        <p className="mt-5 text-[11px] leading-relaxed text-white/55">
          Les avantages sont identiques en formule trimestrielle ou annuelle.
        </p>

        <div className="mt-7 space-y-2.5">
          {premiumStatus === 'paid' ? (
            <div className="rounded-full bg-white/15 px-5 py-3 text-center text-sm font-medium text-white">Ezial Plus actif</div>
          ) : premiumStatus === 'trial' ? (
            <div className="rounded-full bg-white/15 px-5 py-3 text-center text-sm font-medium text-white">Essai Ezial Plus en cours</div>
          ) : premiumStatus === 'expired' ? (
            <div className="rounded-full bg-white/15 px-5 py-3 text-center text-sm font-medium text-white">Ezial Plus expiré</div>
          ) : trialEligible ? (
            <button onClick={onStartTrial} className="w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-burgundy transition-opacity hover:opacity-90">
              Essayer gratuitement 30 jours
            </button>
          ) : null}
          <button
            onClick={() => onSubscribe?.(period)}
            className="w-full rounded-full border-2 border-white px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            {subscribeButtonLabel ?? (premiumStatus === 'paid' || premiumStatus === 'expired' ? 'Renouveler Ezial Plus' : 'S’abonner à Ezial Plus')}
          </button>
        </div>
      </div>
    </div>
  );
}
