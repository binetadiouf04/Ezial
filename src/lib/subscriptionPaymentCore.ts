// Paiement de l'abonnement Ezial Plus (Wave ou Orange Money) : règles d'affichage pures (testées par subscriptionPaymentCore.test.mjs).
// Le site ne conclut JAMAIS « abonnement activé » sans la réponse « paid » de la base (qui active après la confirmation de l'opérateur).

/** Périodicités payables : les deux plans Ezial Plus. */
export type SubscriptionPayPeriod = 'quarterly' | 'annual';

/** Moyen de paiement de l'abonnement, au choix de la personne. */
export type SubscriptionProvider = 'wave' | 'orange_money';
export const SUBSCRIPTION_PROVIDER_LABEL: Record<SubscriptionProvider, string> = { wave: 'Wave', orange_money: 'Orange Money' };

export type SubscriptionPayState = 'paid' | 'pending' | 'failed' | 'expired';

export function isSubscriptionPayState(v: unknown): v is SubscriptionPayState {
  return v === 'paid' || v === 'pending' || v === 'failed' || v === 'expired';
}

/** Rappel de renouvellement : à 7 jours ou moins de la fin (et pas encore expiré), « Renouveler » mène au paiement. */
export const RENEWAL_REMINDER_DAYS = 7;

export function renewalDaysLeft(proUntil: string | null, now: number): number | null {
  if (!proUntil) return null;
  const end = Date.parse(proUntil);
  if (!Number.isFinite(end) || end <= now) return null;
  return Math.ceil((end - now) / 86_400_000);
}

export function isRenewalDue(proUntil: string | null, now: number): boolean {
  const d = renewalDaysLeft(proUntil, now);
  return d !== null && d <= RENEWAL_REMINDER_DAYS;
}

/** Textes de la page de retour (lisible sans connexion). */
export function returnCopy(state: SubscriptionPayState | 'loading' | 'neutral', kind: 'retour' | 'annule' | null): { title: string; text: string } {
  switch (state) {
    case 'paid': return { title: 'Abonnement activé, merci !', text: 'Votre paiement a été confirmé : votre abonnement Ezial Plus est actif.' };
    case 'failed': return { title: 'Paiement non abouti', text: 'Aucun paiement n’a été confirmé pour cette tentative. Vous pouvez réessayer depuis « Mon abonnement » dans Ezial Pro.' };
    case 'expired': return { title: 'Paiement non abouti', text: 'Le délai de paiement est passé sans paiement. Vous pouvez recommencer depuis « Mon abonnement » dans Ezial Pro.' };
    case 'loading': return { title: 'Vérification du paiement…', text: 'Un instant, nous lisons l’état de votre paiement.' };
    case 'pending':
      return kind === 'annule'
        ? { title: 'Paiement non finalisé', text: 'Le paiement n’a pas été validé. Si vous n’avez pas payé, vous pouvez réessayer depuis « Mon abonnement » dans Ezial Pro.' }
        : { title: 'Paiement en cours de vérification…', text: 'La confirmation du paiement par Wave ou Orange Money prend en général 1 à 2 minutes. Cette page se met à jour toute seule : inutile de payer à nouveau.' };
    default: return { title: 'Paiement en cours de vérification', text: 'Revenez dans Ezial Pro : l’abonnement s’y active automatiquement dès que Wave ou Orange Money confirme le paiement.' };
  }
}
