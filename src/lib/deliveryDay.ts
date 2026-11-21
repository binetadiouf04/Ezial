// Jour de livraison souhaité, stocké « AAAA-MM-JJ » (champ date du paiement) :
// affiché en clair, « dimanche 22 novembre ». Date du calendrier, sans fuseau horaire
// (jamais décalée d'un jour). Toute autre valeur est rendue telle quelle.
export function formatDeliveryDay(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return v;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(m[3])) return v;
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** « dimanche 22 novembre · 09h–12h » ; le créneau seul ou le jour seul si l'autre manque. */
export function formatDeliveryWish(date: string | null | undefined, window: string | null | undefined): string {
  return [formatDeliveryDay(date), (window ?? '').trim()].filter(Boolean).join(' · ');
}
