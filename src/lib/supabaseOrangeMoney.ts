import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { isOrangeLink } from './orderPayment';
import { isReturnState, type ReturnState } from './paymentReturn';

// Paiement Orange Money (« QR CODE – OM ») côté site.
//   * le QR est créé par la fonction Edge payment-initiate (identifiants Orange
//     uniquement côté serveur, jamais dans le site) ;
//   * l'état du paiement est relu dans la base, avec les droits du client
//     (règles d'accès : uniquement SES commandes et SES tentatives) ;
//   * le site ne déclare JAMAIS un paiement réussi : seule la base, après
//     vérification auprès d'Orange, passe la commande à « payée ».

// Nom de la fonction Edge (déployée sous ce nom avec la CLI Supabase).
export const PAYMENT_INITIATE_FUNCTION = 'payment-initiate';

export interface OrangeQr {
  transactionId: string;
  qrCode: string | null;          // image PNG en base64
  maxitLink: string | null;
  omLink: string | null;
  shortLink: string | null;
  validUntil: string;
}

interface CheckoutDataJson {
  qrCode?: unknown; deepLink?: unknown; deepLinks?: { maxit?: unknown; om?: unknown }; shortLink?: unknown; validUntil?: unknown;
}

function toQr(transactionId: string, data: CheckoutDataJson | null | undefined, expiresAt: unknown): OrangeQr | null {
  if (!data) return null;
  const qrCode = typeof data.qrCode === 'string' && /^[A-Za-z0-9+/=]+$/.test(data.qrCode) ? data.qrCode : null;
  const maxit = isOrangeLink(data.deepLinks?.maxit) ? data.deepLinks?.maxit as string : (isOrangeLink(data.deepLink) ? data.deepLink as string : null);
  const om = isOrangeLink(data.deepLinks?.om) ? data.deepLinks?.om as string : null;
  const validUntil = typeof data.validUntil === 'string' ? data.validUntil : (typeof expiresAt === 'string' ? expiresAt : null);
  if ((!qrCode && !maxit && !om) || !validUntil) return null;
  return { transactionId, qrCode, maxitLink: maxit, omLink: om, shortLink: isOrangeLink(data.shortLink) ? data.shortLink as string : null, validUntil };
}

/** Crée (ou réutilise, s'il est encore valable) le QR de paiement d'une commande. */
export async function startOrangeMoneyPayment(orderId: string): Promise<{ qr: OrangeQr } | { error: string }> {
  const { data, error } = await supabase.functions.invoke(PAYMENT_INITIATE_FUNCTION, { body: { orderId, provider: 'orange_money' } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        if (typeof body?.error === 'string') return { error: body.error };
      } catch { /* réponse illisible : message générique ci-dessous */ }
    }
    return { error: 'Le paiement Orange Money n’a pas pu être lancé. Vérifiez votre connexion et réessayez.' };
  }
  const qr = toQr(String(data?.transactionId ?? ''), data?.checkoutData, data?.expiresAt);
  if (!qr || !qr.transactionId) return { error: 'Orange Money n’a pas renvoyé de QR code. Réessayez dans un instant.' };
  return { qr };
}

export interface OrangeAttempt {
  transactionId: string;
  /** payment_transactions.status réel (initiated, pending, confirmed, failed, cancelled, expired, superseded, duplicate). */
  status: string;
  /** QR / liens encore valables (tentative en attente uniquement). */
  qr: OrangeQr | null;
}

/**
 * Dernière tentative Orange Money de la commande (droits du client : RLS, uniquement SES commandes).
 * undefined = lecture impossible (réseau) ; null = aucune tentative.
 */
export async function fetchLatestOrangeAttempt(orderId: string): Promise<OrangeAttempt | null | undefined> {
  const { data, error } = await supabase
    .from('payment_transactions')
    .select('id, status, checkout_data, expires_at')
    .eq('order_id', orderId)
    .eq('provider', 'orange_money')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return undefined;
  if (!data) return null;
  const status = String(data.status ?? '');
  const expiresAt = typeof data.expires_at === 'string' ? Date.parse(data.expires_at) : NaN;
  const open = status === 'pending' && (!Number.isFinite(expiresAt) || expiresAt > Date.now());
  const qr = open ? toQr(data.id as string, data.checkout_data as CheckoutDataJson | null, data.expires_at) : null;
  return { transactionId: data.id as string, status, qr: qr && Date.parse(qr.validUntil) > Date.now() ? qr : null };
}

/**
 * État du paiement SANS connexion, pour la page de retour (Safari n'a pas la session
 * de l'application installée). Fonction serveur payment_return_status (docs/sql/retour-paiement.sql) :
 * numéro de commande + état, à partir de l'uuid de la tentative ; aucune donnée personnelle.
 *   - { state, orderNumber } : réponse de la base ;
 *   - 'unknown'     : identifiant inconnu ;
 *   - 'unavailable' : fonction absente (migration pas encore exécutée) ;
 *   - 'error'       : réseau / erreur passagère.
 */
export async function fetchPaymentReturnStatus(ref: string): Promise<{ state: ReturnState; orderNumber: string } | 'unknown' | 'unavailable' | 'error'> {
  const { data, error } = await supabase.rpc('payment_return_status', { p_ref: ref });
  if (error) {
    // PGRST202 : fonction introuvable (migration absente) ; 42883 : idem côté Postgres.
    if (error.code === 'PGRST202' || error.code === '42883') return 'unavailable';
    return 'error';
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return 'unknown';
  const state = (row as { payment_state?: unknown }).payment_state;
  const orderNumber = (row as { order_number?: unknown }).order_number;
  if (!isReturnState(state) || typeof orderNumber !== 'string') return 'error';
  return { state, orderNumber };
}

export interface OrderPaymentState {
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  orderStatus: string;
  paymentRequired: boolean;
  paymentDeadline: string | null;
  paymentGraceUntil: string | null;
}

/** État réel du paiement d'une commande du client connecté. */
export async function fetchOrderPaymentState(orderId: string): Promise<OrderPaymentState | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('payment_status, status, payment_required, payment_deadline, payment_grace_until')
    .eq('id', orderId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    paymentStatus: data.payment_status as OrderPaymentState['paymentStatus'],
    orderStatus: data.status as string,
    paymentRequired: data.payment_required === true,
    paymentDeadline: (data.payment_deadline as string | null) ?? null,
    paymentGraceUntil: (data.payment_grace_until as string | null) ?? null,
  };
}
