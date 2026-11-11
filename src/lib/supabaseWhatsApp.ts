import { supabase } from './supabaseClient';

// Notifications WhatsApp automatiques (whatsapp_notifications,
// whatsapp_settings, consentement par compte). Aucun envoi ne part du site :
// la file est remplie par des déclencheurs serveur et vidée par un futur
// service d'envoi (Edge Function). Ce fichier ne fait que lire l'état réel
// (réservé aux admins par la RLS) et enregistrer le consentement du compte
// connecté via ses propres RPC (auth.uid(), jamais un identifiant passé).
//
// Tant que la migration n'est pas exécutée, les tables et RPC n'existent pas :
// chaque fonction renvoie alors { supported: false } et l'interface se masque
// ou affiche « pas encore installé », sans jamais simuler un état.

export type WhatsAppKind = 'buyer_order_confirmed' | 'buyer_out_for_delivery' | 'seller_new_order' | 'seller_order_reminder';
export type WhatsAppStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped' | 'expired';

/** Filtres proposés à l'admin : « En attente » regroupe pending et sending. */
export type WhatsAppStatusFilter = 'pending' | 'sent' | 'failed' | 'skipped' | 'expired';

export interface WhatsAppSettings {
  confirmationRequiresPaid: boolean;
  provider: string | null;
  providerReady: boolean;
  lastDispatchAt: string | null;
  lastDispatchError: string | null;
}

export interface WhatsAppNotification {
  id: string;
  kind: WhatsAppKind;
  orderId: string;
  orderNumber: string | null;
  orderShopId: string | null;
  shopId: string | null;
  recipientMasked: string | null;
  status: WhatsAppStatus;
  skipReason: string | null;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  provider: string | null;
  expiresAt: string | null;
  createdAt: string;
  sentAt: string | null;
}

export type WhatsAppCounts = Record<WhatsAppStatusFilter, number>;

type Unsupported = { supported: false };
type Supported<T> = { supported: true } & T;
/** error : erreur de chargement réelle (réseau, droits), distincte de « pas installé ». */
export type WhatsAppResult<T> = Unsupported | Supported<T> | { supported: true; error: string };

// Le numéro complet (recipient_phone) n'est volontairement jamais lu ici.
const NOTIFICATION_COLUMNS = 'id, kind, order_id, order_shop_id, shop_id, recipient_masked, status, skip_reason, attempts, next_attempt_at, last_error, provider, expires_at, created_at, sent_at';

const MISSING_CODES = ['42P01', '42883', 'PGRST202', 'PGRST205'];

/** Vrai quand la table ou la fonction n'existe pas encore (migration non exécutée). */
export function isWhatsAppModuleMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (MISSING_CODES.includes(error.code ?? '')) return true;
  return /does not exist|schema cache|could not find/i.test(error.message ?? '');
}

function statusesFor(filter: WhatsAppStatusFilter): WhatsAppStatus[] {
  return filter === 'pending' ? ['pending', 'sending'] : [filter];
}

export async function fetchWhatsAppSettings(): Promise<WhatsAppResult<{ settings: WhatsAppSettings | null }>> {
  const { data, error } = await supabase
    .from('whatsapp_settings')
    .select('confirmation_requires_paid, provider, provider_ready, last_dispatch_at, last_dispatch_error')
    .maybeSingle();
  if (error) return isWhatsAppModuleMissing(error) ? { supported: false } : { supported: true, error: 'Impossible de lire les réglages WhatsApp.' };
  if (!data) return { supported: true, settings: null };
  return {
    supported: true,
    settings: {
      confirmationRequiresPaid: Boolean(data.confirmation_requires_paid),
      provider: (data.provider as string | null) ?? null,
      providerReady: Boolean(data.provider_ready),
      lastDispatchAt: (data.last_dispatch_at as string | null) ?? null,
      lastDispatchError: (data.last_dispatch_error as string | null) ?? null,
    },
  };
}

export async function fetchWhatsAppNotifications(
  options: { status?: WhatsAppStatusFilter; limit?: number } = {},
): Promise<WhatsAppResult<{ notifications: WhatsAppNotification[] }>> {
  let query = supabase
    .from('whatsapp_notifications')
    .select(NOTIFICATION_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 100);
  if (options.status) query = query.in('status', statusesFor(options.status));

  const { data, error } = await query;
  if (error) return isWhatsAppModuleMissing(error) ? { supported: false } : { supported: true, error: 'Impossible de charger l’historique WhatsApp.' };
  const rows = (data ?? []) as Record<string, unknown>[];

  // Numéros de commande en une seule requête (les admins lisent orders).
  const orderIds = [...new Set(rows.map((r) => r.order_id as string).filter(Boolean))];
  const orderNumbers = new Map<string, string>();
  if (orderIds.length > 0) {
    const { data: orders } = await supabase.from('orders').select('id, order_number').in('id', orderIds);
    for (const o of (orders ?? []) as { id: string; order_number: string | null }[]) {
      if (o.order_number) orderNumbers.set(o.id, o.order_number);
    }
  }

  return {
    supported: true,
    notifications: rows.map((row) => ({
      id: row.id as string,
      kind: row.kind as WhatsAppKind,
      orderId: row.order_id as string,
      orderNumber: orderNumbers.get(row.order_id as string) ?? null,
      orderShopId: (row.order_shop_id as string | null) ?? null,
      shopId: (row.shop_id as string | null) ?? null,
      recipientMasked: (row.recipient_masked as string | null) ?? null,
      status: row.status as WhatsAppStatus,
      skipReason: (row.skip_reason as string | null) ?? null,
      attempts: (row.attempts as number | null) ?? 0,
      nextAttemptAt: (row.next_attempt_at as string | null) ?? null,
      lastError: (row.last_error as string | null) ?? null,
      provider: (row.provider as string | null) ?? null,
      expiresAt: (row.expires_at as string | null) ?? null,
      createdAt: (row.created_at as string) ?? '',
      sentAt: (row.sent_at as string | null) ?? null,
    })),
  };
}

/** Compteurs par statut sur tout l'historique (requêtes head:true, aucune ligne transférée). */
export async function fetchWhatsAppCounts(): Promise<WhatsAppResult<{ counts: WhatsAppCounts }>> {
  const filters: WhatsAppStatusFilter[] = ['pending', 'sent', 'failed', 'skipped', 'expired'];
  const results = await Promise.all(
    filters.map((f) => supabase.from('whatsapp_notifications').select('id', { count: 'exact', head: true }).in('status', statusesFor(f))),
  );
  const firstError = results.find((r) => r.error)?.error;
  if (firstError) return isWhatsAppModuleMissing(firstError) ? { supported: false } : { supported: true, error: 'Impossible de compter les notifications WhatsApp.' };
  const counts = Object.fromEntries(filters.map((f, i) => [f, results[i].count ?? 0])) as WhatsAppCounts;
  return { supported: true, counts };
}

export async function getMyWhatsAppConsent(): Promise<WhatsAppResult<{ optedIn: boolean; updatedAt: string | null }>> {
  const { data, error } = await supabase.rpc('get_my_whatsapp_consent');
  if (error) return isWhatsAppModuleMissing(error) ? { supported: false } : { supported: true, error: 'Impossible de lire votre préférence WhatsApp.' };
  const value = (data ?? {}) as { optedIn?: boolean; updatedAt?: string | null };
  return { supported: true, optedIn: Boolean(value.optedIn), updatedAt: value.updatedAt ?? null };
}

export async function setMyWhatsAppConsent(optIn: boolean, source: 'compte' | 'boutique'): Promise<WhatsAppResult<{ optedIn: boolean }>> {
  const { data, error } = await supabase.rpc('set_my_whatsapp_consent', { p_opt_in: optIn, p_source: source });
  if (error) {
    if (isWhatsAppModuleMissing(error)) return { supported: false };
    return { supported: true, error: error.code === 'P0001' ? error.message : 'Votre préférence WhatsApp n’a pas pu être enregistrée. Réessayez dans un instant.' };
  }
  const value = (data ?? {}) as { optedIn?: boolean };
  return { supported: true, optedIn: Boolean(value.optedIn) };
}
