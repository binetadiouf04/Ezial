import { useEffect, useState } from 'react';
import { Check, Crown } from 'lucide-react';
import {
  PLUS_PLAN_NAME, PLUS_BILLING, PLUS_ANNUAL_REFERENCE_PRICE_FCFA, PLUS_ANNUAL_SAVINGS_FCFA, PLUS_ANNUAL_DISCOUNT_PERCENT,
  TRIAL_DAYS, FREE_CARD_ITEMS, PLUS_CARD_ITEMS, formatFcfa, type BillingPeriod, type PlanCardItem,
} from '@/data/subscriptionPlans';
import BillingPeriodToggle from './BillingPeriodToggle';

// Free / Ezial Plus cards — sign-up flow ("Choisissez votre formule"),
// "Mon abonnement" (Free shops only), the Ezial Pro landing and the public
// pricing page. No explanatory paragraphs: each card is its price and an
// ordered list of key facts with the important values highlighted, all from
// src/shared/plans.js (FREE_CARD_ITEMS / PLUS_CARD_ITEMS).

function FactList({ items, onDark }: { items: PlanCardItem[]; onDark?: boolean }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-2.5 text-sm leading-snug">
          <span className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full ${onDark ? 'bg-white/15 text-champagne' : 'bg-burgundy/10 text-burgundy'}`}>
            <Check size={11} strokeWidth={3} aria-hidden="true" />
          </span>
          <span className={onDark ? 'text-white/75' : 'text-ink/60'}>
            {item.before}
            <strong className={`font-semibold ${onDark ? 'text-white' : 'text-ink'}`}>{item.strong}</strong>
            {item.after}
          </span>
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
    <div className="grid gap-5 md:grid-cols-2 md:items-stretch lg:gap-6">
      {/* Ezial Free — white card, discreet border */}
      <div className="flex flex-col rounded-2xl border border-line bg-white p-6 sm:p-8">
        <div>
          <p className="font-display text-2xl font-semibold text-ink">Ezial Free</p>
          <p className="mt-1 text-sm text-ink/50">Gratuit, sans limite de durée.</p>
        </div>
        <div className="mt-5 flex items-baseline gap-2">
          <span className="font-display text-4xl font-semibold text-ink">0 FCFA</span>
        </div>

        <div className="mt-6 border-t border-line pt-6">
          <FactList items={FREE_CARD_ITEMS} />
        </div>

        <div className="mt-auto pt-8">
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
      <div className="relative flex flex-col overflow-hidden rounded-2xl bg-burgundy p-6 text-white shadow-xl shadow-burgundy/20 sm:p-8">
        <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/[0.06]" />
        <p className="relative flex items-center gap-2 font-display text-2xl font-semibold text-white">
          <Crown size={20} className="text-champagne" aria-hidden="true" /> {PLUS_PLAN_NAME}
        </p>

        <div className="relative mt-5">
          <BillingPeriodToggle value={period} onChange={setPeriod} tone="dark" />
        </div>

        <div className="relative mt-5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-4xl font-semibold text-white">{formatFcfa(PLUS_BILLING[period].priceFcfa)}</span>
            <span className="text-sm font-normal text-white/70">{isAnnual ? '/ an' : '/ 3 mois'}</span>
          </div>
          {isAnnual && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="text-sm text-white/55 line-through">{formatFcfa(PLUS_ANNUAL_REFERENCE_PRICE_FCFA)}</span>
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white">−{PLUS_ANNUAL_DISCOUNT_PERCENT} %</span>
              <span className="text-xs text-white/65">{formatFcfa(PLUS_ANNUAL_SAVINGS_FCFA)} d’économie par an</span>
            </div>
          )}
        </div>

        <div className="relative mt-6 border-t border-white/15 pt-6">
          <FactList items={PLUS_CARD_ITEMS} onDark />
        </div>

        <div className="relative mt-auto space-y-2.5 pt-8">
          {premiumStatus === 'paid' ? (
            <div className="rounded-full bg-white/15 px-5 py-3 text-center text-sm font-medium text-white">Ezial Plus actif</div>
          ) : premiumStatus === 'trial' ? (
            <div className="rounded-full bg-white/15 px-5 py-3 text-center text-sm font-medium text-white">Essai Ezial Plus en cours</div>
          ) : premiumStatus === 'expired' ? (
            <div className="rounded-full bg-white/15 px-5 py-3 text-center text-sm font-medium text-white">Ezial Plus expiré</div>
          ) : trialEligible ? (
            <button onClick={onStartTrial} className="w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-burgundy transition-opacity hover:opacity-90">
              Essayer gratuitement {TRIAL_DAYS} jours
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
