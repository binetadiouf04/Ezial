// Livraison urgente : règles d'affichage (module pur, testé par urgentDelivery.test.mjs).
//
// Le serveur décide de tout (docs/sql/lancement-livraison-urgente.sql) :
// supplément fixe fixé côté serveur, créneaux réalisables, refus d'un créneau
// passé, désactivé ou trop proche. Le site ne fait qu'afficher ce que
// get_urgent_delivery_options() renvoie et n'envoie qu'un drapeau
// urgentDelivery: true avec la préférence de livraison existante (jour + créneau).
// Tant que la migration n'est pas exécutée, cette fonction n'existe pas :
// l'option n'est alors jamais affichée.

export interface UrgentSlot {
  label: string;
  start: string;
  end: string;
  cutoff: string;
}

export interface UrgentDay {
  /** AAAA-MM-JJ (jour de Dakar). */
  date: string;
  slots: UrgentSlot[];
}

export interface UrgentDeliveryOptions {
  fee: number;
  minLeadMinutes: number;
  /** Seulement les jours qui ont au moins un créneau réalisable à l'instant. */
  days: UrgentDay[];
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Réponse de get_urgent_delivery_options() -> options affichables, ou null si
 * l'option ne doit pas apparaître (désactivée, aucun créneau réalisable,
 * réponse illisible). Jamais de valeur inventée : un supplément absent ou
 * invalide masque l'option plutôt que d'afficher un montant faux.
 */
export function parseUrgentDeliveryOptions(raw: unknown): UrgentDeliveryOptions | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.enabled !== true) return null;
  const fee = Number(r.fee);
  if (!Number.isFinite(fee) || fee <= 0) return null;
  const days: UrgentDay[] = [];
  for (const d of Array.isArray(r.days) ? r.days : []) {
    const day = d as Record<string, unknown>;
    const date = str(day?.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const slots: UrgentSlot[] = [];
    for (const s of Array.isArray(day.slots) ? day.slots : []) {
      const slot = s as Record<string, unknown>;
      const label = str(slot?.label);
      if (label) slots.push({ label, start: str(slot.start), end: str(slot.end), cutoff: str(slot.cutoff) });
    }
    if (slots.length > 0) days.push({ date, slots });
  }
  if (days.length === 0) return null;
  const lead = Number(r.minLeadMinutes);
  return { fee: Math.round(fee), minLeadMinutes: Number.isFinite(lead) ? lead : 0, days };
}

/** Vrai si ce jour + créneau fait partie des choix proposés par le serveur. */
export function isUrgentChoiceOffered(options: UrgentDeliveryOptions | null, date: string | undefined, slot: string | undefined): boolean {
  if (!options || !date || !slot) return false;
  return options.days.some((d) => d.date === date && d.slots.some((s) => s.label === slot));
}

/** Premier choix proposé (jour le plus proche, premier créneau), pour pré-remplir. */
export function firstUrgentChoice(options: UrgentDeliveryOptions | null): { date: string; window: string } | null {
  const day = options?.days[0];
  const slot = day?.slots[0];
  return day && slot ? { date: day.date, window: slot.label } : null;
}

/**
 * Supplément urgent enregistré sur une ligne orders (0 si la commande n'est
 * pas urgente ou si les colonnes n'existent pas encore).
 */
export function urgentFeeOfRow(row: Record<string, unknown> | null | undefined): number {
  if (!row || row.is_urgent !== true) return 0;
  const fee = Number(row.urgent_fee);
  return Number.isFinite(fee) && fee > 0 ? Math.round(fee) : 0;
}

/** Vrai si la ligne orders est une commande urgente (colonne absente : faux). */
export function isUrgentRow(row: Record<string, unknown> | null | undefined): boolean {
  return Boolean(row && row.is_urgent === true);
}

/**
 * Supplément fixé côté serveur (ezial_private.urgent_delivery_fee() = 500 FCFA),
 * recopié ici pour l'écran de réglages d'Ezial Admin uniquement. Le site client
 * affiche toujours le montant renvoyé par le serveur, et le montant facturé est
 * toujours celui de create_order().
 */
export const URGENT_DELIVERY_FEE_FCFA = 500;

/** Libellé commun (récapitulatif, facture, suivi). */
export const URGENT_LABEL = 'Livraison urgente';
