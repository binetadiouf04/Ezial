import { useEffect, useState } from 'react';
import { Check, Crown } from 'lucide-react';
import {
  FREE_COMMISSION_PERCENT, PREMIUM_COMMISSION_PERCENT, PREMIUM_PRODUCT_LIMIT, FREE_PRODUCT_LIMIT, PLUS_PLAN_NAME, PLUS_BILLING,
  PLUS_ANNUAL_REFERENCE_PRICE_FCFA, PLUS_ANNUAL_SAVINGS_FCFA, PLUS_ANNUAL_DISCOUNT_PERCENT, FREE_AD_PRODUCTS_LABEL, PLUS_AD_PRODUCTS_LABEL,
  TRIAL_DAYS, FREE_BENEFITS, PLUS_HIGHLIGHTS, PLUS_BENEFITS, PLUS_SAME_BENEFITS_NOTE, TRIAL_PRELAUNCH_NOTE,
  formatFcfa, type BillingPeriod, type PlusHighlight,
} from '@/data/subscriptionPlans';
import { LAUNCH_DATE_ISO } from '@/shared/siteInfo';
import BillingPeriodToggle from './BillingPeriodToggle';
import { PlusHighlightIcon } from './PlusHighlights';

// Free / Ezial Plus cards — sign-up flow ("Choisissez votre formule"),
// "Mon abonnement" and the public pricing page. Every sales text comes from
// src/shared/plans.js; the one-line summaries of the four Ezial Plus
// advantages below are built from the same validated numbers (the full
// texts are shown by <PlusHighlights />).
const COMPACT_HIGHLIGHT_TEXT: Record<PlusHighlight['id'], string> = {
  products: `Trois fois plus qu’avec Free (${FREE_PRODUCT_LIMIT} produits).`,
  commission: `Au lieu de ${FREE_COMMISSION_PERCENT} %, sur chaque vente, même pendant vos promotions.`,
  ads: `${PLUS_AD_PRODUCTS_LABEL} produits dans nos campagnes, contre ${FREE_AD_PRODUCTS_LABEL} avec Free.`,
  editorial: 'Les recommandations d’Ezial sont réservées aux boutiques Ezial Plus.',
};

function BenefitList({ items, onDark }: { items: string[]; onDark?: boolean }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-sm leading-snug">
          <span className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full ${onDark ? 'bg-white/15 text-white' : 'bg-burgundy/10 text-burgundy'}`}>
            <Check size={11} strokeWidth={3} aria-hidden="true" />
          </span>
          <span className={onDark ? 'text-white/90' : 'text-ink/70'}>{item}</span>
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
  // Trials activated before the official launch start counting on launch day.
  const beforeLaunch = Date.now() < Date.parse(`${LAUNCH_DATE_ISO}T00:00:00Z`);
  const showTrialButton = premiumStatus === null && trialEligible;

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
        <p className="mt-1.5 text-xs text-ink/50">Commission Ezial : {FREE_COMMISSION_PERCENT} % sur chaque vente, promotions comprises.</p>

        <div className="mt-6 border-t border-line pt-6">
          <BenefitList items={FREE_BENEFITS} />
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
        <div className="relative flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div>
            <p className="flex items-center gap-2 font-display text-2xl font-semibold text-white">
              <Crown size={20} className="text-champagne" aria-hidden="true" /> {PLUS_PLAN_NAME}
            </p>
            <p className="mt-1 text-sm text-white/75">{PREMIUM_PRODUCT_LIMIT} produits et seulement {PREMIUM_COMMISSION_PERCENT} % de commission.</p>
          </div>
          {showTrialButton && (
            <span className="rounded-full bg-champagne px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-burgundy-deep">Essai gratuit {TRIAL_DAYS} jours</span>
          )}
        </div>

        <div className="relative mt-5">
          <BillingPeriodToggle value={period} onChange={setPeriod} tone="dark" />
        </div>

        <div className="relative mt-5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-4xl font-semibold text-white">{formatFcfa(PLUS_BILLING[period].priceFcfa)}</span>
            <span className="text-sm font-normal text-white/70">{isAnnual ? '/ an' : '/ 3 mois'}</span>
          </div>
          {isAnnual && (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-sm text-white/55 line-through">{formatFcfa(PLUS_ANNUAL_REFERENCE_PRICE_FCFA)}</span>
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white">−{PLUS_ANNUAL_DISCOUNT_PERCENT} %</span>
            </div>
          )}
          <p className="mt-1.5 text-xs text-white/65">
            {isAnnual
              ? `Payé une fois pour 12 mois — ${formatFcfa(PLUS_ANNUAL_SAVINGS_FCFA)} d’économie par an.`
              : 'Payé tous les 3 mois.'}
          </p>
        </div>

        {/* Commission — the headline advantage over Free, set apart visually */}
        <div className="relative mt-5 flex items-center gap-4 rounded-xl bg-white/10 px-4 py-3.5 ring-1 ring-white/20">
          <span className="flex-shrink-0 whitespace-nowrap font-display text-4xl font-semibold leading-none text-white">{PREMIUM_COMMISSION_PERCENT}&nbsp;%</span>
          <span className="text-sm leading-snug text-white/85">
            de commission sur chaque vente, <span className="whitespace-nowrap">au lieu de <span className="line-through decoration-white/60">{FREE_COMMISSION_PERCENT} %</span> en Free</span>
            <span className="mt-0.5 block text-xs text-white/65">Même taux pendant vos promotions.</span>
          </span>
        </div>

        {/* The other Ezial Plus advantages, compact (commission is the box above) */}
        <ul className="relative mt-6 space-y-4">
          {PLUS_HIGHLIGHTS.filter((h) => h.id !== 'commission').map((h) => (
            <li key={h.id} className="flex items-start gap-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-champagne">
                <PlusHighlightIcon id={h.id} size={17} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug text-white">{h.title}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-white/75">{COMPACT_HIGHLIGHT_TEXT[h.id]}</p>
                {h.note && <p className="mt-1 text-[11px] leading-snug text-white/50">{h.note}</p>}
              </div>
            </li>
          ))}
        </ul>

        <div className="relative mt-6 border-t border-white/15 pt-5">
          <BenefitList items={PLUS_BENEFITS} onDark />
          <p className="mt-4 text-[11px] leading-relaxed text-white/60">{PLUS_SAME_BENEFITS_NOTE}</p>
        </div>

        <div className="relative mt-auto space-y-2.5 pt-7">
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
          {showTrialButton && beforeLaunch && (
            <p className="px-1 pb-1 text-center text-[11px] leading-snug text-white/65">{TRIAL_PRELAUNCH_NOTE}</p>
          )}
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
