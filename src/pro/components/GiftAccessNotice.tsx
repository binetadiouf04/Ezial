import { Check, Gift } from 'lucide-react';
import { formatDate } from '../data';
import type { SellerGiftInfo } from '@/lib/supabaseSellerSubscription';
import {
  PLUS_PLAN_NAME, PREMIUM_PRODUCT_LIMIT, PREMIUM_COMMISSION_PERCENT, FREE_PRODUCT_LIMIT, FREE_COMMISSION_PERCENT,
} from '@/data/subscriptionPlans';

// Bandeau « accès Ezial Plus offert » (premium_grants) affiché sur l'accueil
// vendeur et sur « Mon abonnement ». Aucun paiement n'est demandé pendant un
// don ; le vendeur ne peut ni le prolonger ni l'annuler.

const EXPIRY_WARNING_DAYS = 7;

function giftDaysLabel(days: number): string {
  return `${days} jour${days > 1 ? 's' : ''}`;
}

export default function GiftAccessNotice({ gift, subscriptionTakesOver = false }: {
  gift: SellerGiftInfo;
  // Vrai quand un abonnement payant est déjà enregistré après la fin du don :
  // la note « repasse à Ezial Free » ne s'applique alors pas.
  subscriptionTakesOver?: boolean;
}) {
  const endDate = formatDate(gift.endsAt);
  const expiresSoon = gift.daysRemaining <= EXPIRY_WARNING_DAYS;

  return (
    <div className="rounded-xl border border-burgundy/15 bg-burgundy/5 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Gift size={20} className="mt-0.5 flex-shrink-0 text-burgundy" aria-hidden="true" />
        <p className="min-w-0 text-sm font-semibold leading-snug text-ink">
          Votre accès {PLUS_PLAN_NAME} offert est actif jusqu’au {endDate}.
        </p>
      </div>

      {expiresSoon && !subscriptionTakesOver && (
        <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Votre accès offert se termine dans {giftDaysLabel(gift.daysRemaining)}.
        </p>
      )}

      <ul className="mt-3 space-y-1.5">
        {[
          `Forfait ${PLUS_PLAN_NAME} actif`,
          `Date d’expiration : ${endDate}`,
          `${giftDaysLabel(gift.daysRemaining)} restant${gift.daysRemaining > 1 ? 's' : ''}`,
          `Jusqu’à ${PREMIUM_PRODUCT_LIMIT} produits publiés`,
          `Commission de ${PREMIUM_COMMISSION_PERCENT} % sur vos ventes`,
        ].map((line) => (
          <li key={line} className="flex items-start gap-2 text-sm leading-snug text-ink/70">
            <Check size={14} strokeWidth={3} className="mt-0.5 flex-shrink-0 text-burgundy" aria-hidden="true" />
            <span className="min-w-0">{line}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs leading-relaxed text-ink/55">
        Cet accès est offert par Ezial : aucun paiement ni moyen de paiement n’est demandé.{' '}
        {subscriptionTakesOver
          ? 'Votre abonnement prend le relais à la fin de cette période ; vos produits ne sont jamais supprimés.'
          : `À la fin de la période, votre boutique repasse automatiquement à Ezial Free (${FREE_PRODUCT_LIMIT} produits publiés, commission de ${FREE_COMMISSION_PERCENT} %) sans prélèvement, sauf si vous vous abonnez ; vos produits ne sont jamais supprimés.`}
      </p>
    </div>
  );
}
