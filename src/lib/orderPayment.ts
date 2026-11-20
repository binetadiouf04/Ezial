// Statut de paiement affiché au client, calculé UNIQUEMENT à partir des données
// réelles de la commande (orders.payment_status, payment_required, payment_deadline,
// status). Aucune supposition : une commande dont le paiement n'est pas confirmé
// n'est jamais présentée comme payée.
//
// TypeScript pur (testé par orderPayment.test.mjs).

export interface PaymentFields {
  paymentStatus?: string;
  paymentRequired?: boolean;
  paymentDeadline?: string | null;
  orderStatus?: string;
}

/**
 * - paid        : paiement confirmé ;
 * - awaiting    : paiement Orange Money attendu, fenêtre ouverte ;
 * - verifying   : fenêtre passée, vérification auprès d'Orange Money en cours (jamais « échoué » sans preuve) ;
 * - cancelled   : commande annulée sans paiement ;
 * - offline     : commande sans paiement en ligne obligatoire (Wave, anciennes commandes).
 */
export type PaymentPhase = 'paid' | 'awaiting' | 'verifying' | 'cancelled' | 'offline';

export function paymentPhase(o: PaymentFields, now: number): PaymentPhase {
  if (o.paymentStatus === 'paid') return 'paid';
  if (!o.paymentRequired) return 'offline';
  if (o.orderStatus === 'cancelled') return 'cancelled';
  const deadline = o.paymentDeadline ? Date.parse(o.paymentDeadline) : NaN;
  if (Number.isFinite(deadline) && now < deadline) return 'awaiting';
  return 'verifying';
}

/** Reprise possible seulement s'il reste au moins une minute (le serveur refuse en dessous). */
export function canResumePayment(o: PaymentFields, now: number): boolean {
  if (paymentPhase(o, now) !== 'awaiting') return false;
  return Date.parse(o.paymentDeadline as string) - now >= 60_000;
}

export type BadgeTone = 'success' | 'warning' | 'info' | 'danger' | 'neutral';

export function paymentBadge(o: PaymentFields, now: number): { label: string; tone: BadgeTone } {
  switch (paymentPhase(o, now)) {
    case 'paid': return { label: 'Payé', tone: 'success' };
    case 'awaiting': return { label: 'En attente de paiement', tone: 'warning' };
    case 'verifying': return { label: 'Vérification du paiement', tone: 'info' };
    case 'cancelled': return { label: 'Annulée, paiement non reçu', tone: 'danger' };
    default:
      if (o.paymentStatus === 'refunded') return { label: 'Remboursé', tone: 'neutral' };
      if (o.paymentStatus === 'failed') return { label: 'Paiement non abouti', tone: 'danger' };
      return { label: 'Paiement non confirmé', tone: 'neutral' };
  }
}

/** « 28:05 » ; « 1:02:05 » au-delà d'une heure ; jamais négatif. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Téléphone ou tablette : on propose d'abord d'ouvrir l'application ; sur ordinateur, le QR. */
export function isHandheld(userAgent: string, coarsePointer: boolean): boolean {
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(userAgent)) return true;
  // iPad récent en « version ordinateur » : Macintosh + écran tactile
  if (/Macintosh/i.test(userAgent) && coarsePointer) return true;
  return coarsePointer && !/Windows NT|X11|CrOS/i.test(userAgent);
}

/** Seuls des liens https d'Orange Sonatel sont ouverts (jamais une adresse arbitraire). */
export function isOrangeLink(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'orange-sonatel.com' || u.hostname.endsWith('.orange-sonatel.com'));
  } catch {
    return false;
  }
}
