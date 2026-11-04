import { Check } from 'lucide-react';
import { FREE_COMMISSION_PERCENT, PREMIUM_COMMISSION_PERCENT, PREMIUM_PRICE_FCFA } from '@/data/subscriptionPlans';

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

const premiumBenefits = [
  'Tous les avantages de Free',
  'Jusqu’à 30 produits publiés',
  'Commission réduite de 10 % à 8 %',
  'Possibilité de mise en avant sur l’accueil Ezial',
  'Priorité de sélection dans « Tendances du moment »',
  'Badge Ezial Premium sur la boutique',
  'Présence dans le filtre des boutiques Premium',
  'Priorité de sélection des produits pour les publications sur les réseaux sociaux Ezial',
  'Possibilité de présenter des produits dans les publicités collectives payantes d’Ezial',
  'Visibilité renforcée dans les emplacements promotionnels de la marketplace',
  'Essai Premium gratuit pendant 30 jours',
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

  /** Premium state: null = not subscribed, 'trial' = trial active, 'paid' = paid Premium active */
  premiumStatus?: 'trial' | 'paid' | null;
  /** Hide the trial button entirely (already used) */
  trialEligible?: boolean;
  onStartTrial?: () => void;
  onSubscribe?: () => void;
  subscribeButtonLabel?: string;
}

export default function PricingCards({
  freeIsCurrent, onContinueFree, freeButtonLabel = 'Continuer gratuitement', freeButtonDisabled,
  premiumStatus = null, trialEligible = true, onStartTrial, onSubscribe, subscribeButtonLabel,
}: PricingCardsProps) {
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
          {freeIsCurrent ? (
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

      {/* Ezial Premium — burgundy card, white text, visually emphasized */}
      <div className="flex flex-col rounded-2xl bg-burgundy p-7 text-white shadow-xl shadow-burgundy/20 sm:p-8">
        <div>
          <p className="font-display text-xl font-semibold text-white">Ezial Premium</p>
          <p className="mt-1 text-sm text-white/70">Plus de visibilité, plus de produits.</p>
        </div>
        <div className="mt-5">
          <span className="font-display text-3xl font-semibold text-white">{PREMIUM_PRICE_FCFA.toLocaleString('fr-FR')} FCFA</span>
          <span className="ml-1.5 text-sm font-normal text-white/70">/ 3 mois</span>
        </div>
        <p className="mt-1.5 text-xs text-white/60">Commission Ezial : {PREMIUM_COMMISSION_PERCENT} % sur chaque vente.</p>

        <BenefitList items={premiumBenefits} muted />

        <p className="mt-5 text-[11px] leading-relaxed text-white/55">
          La publicité Ezial est collective : les produits mis en avant sont sélectionnés par Ezial parmi les boutiques éligibles, avec priorité aux boutiques Premium. Aucune publicité individuelle, aucun budget dédié ni vente garantie ne sont promis.
        </p>

        <div className="mt-7 space-y-2.5">
          {premiumStatus === 'paid' ? (
            <div className="rounded-full bg-white/15 px-5 py-3 text-center text-sm font-medium text-white">Premium actif</div>
          ) : premiumStatus === 'trial' ? (
            <div className="rounded-full bg-white/15 px-5 py-3 text-center text-sm font-medium text-white">Essai Premium en cours</div>
          ) : trialEligible ? (
            <button onClick={onStartTrial} className="w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-burgundy transition-opacity hover:opacity-90">
              Essayer gratuitement 30 jours
            </button>
          ) : null}
          <button
            onClick={onSubscribe}
            className={`w-full rounded-full border-2 border-white px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 ${premiumStatus === 'paid' ? '' : ''}`}
          >
            {subscribeButtonLabel ?? (premiumStatus === 'paid' ? 'Renouveler Premium' : 'S’abonner à Premium')}
          </button>
        </div>
      </div>
    </div>
  );
}
