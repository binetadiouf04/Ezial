import { supabase } from './supabaseClient';
import { isModuleMissing, type FeatureResult } from './supabaseFeatureDetect';

// Paiements Wave / Orange Money, moyens de réception des vendeurs et
// décaissements. Ce fichier ne fait que LIRE l'état écrit par le serveur
// (tables protégées par la RLS : un vendeur ne voit que sa boutique, un admin
// lit tout) et appeler les fonctions prévues pour le navigateur
// (submit_payout_method, admin_review_payout_method, admin_confirm_pickup,
// seller_finance_summary). Aucun solde, aucune commission et aucun statut de
// paiement ou de versement n'est jamais écrit d'ici.
//
// Tant que la migration n'est pas exécutée, chaque fonction renvoie
// { supported: false } et l'interface garde son comportement actuel.

export type PaymentProvider = 'wave' | 'orange_money';
export type PaymentCapability = 'collection' | 'disbursement';
export type PaymentTransactionStatus = 'initiated' | 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'expired';
export type SellerPayoutStatus = 'scheduled' | 'processing' | 'unknown' | 'succeeded' | 'failed' | 'blocked' | 'cancelled';
export type PayoutMethodStatus = 'pending_review' | 'approved' | 'rejected' | 'superseded';

export const PROVIDER_LABELS: Record<PaymentProvider, string> = {
  wave: 'Wave',
  orange_money: 'Orange Money',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentTransactionStatus, string> = {
  initiated: 'Initié',
  pending: 'En attente',
  confirmed: 'Confirmé',
  failed: 'Échoué',
  cancelled: 'Annulé',
  expired: 'Expiré',
};

export const PAYOUT_STATUS_LABELS: Record<SellerPayoutStatus, string> = {
  scheduled: 'Programmé',
  processing: 'En cours',
  unknown: 'Vérification en cours',
  succeeded: 'Versé',
  failed: 'Échoué',
  blocked: 'En attente de fonds',
  cancelled: 'Annulé',
};

export function providerLabel(provider: string | null | undefined): string {
  return provider && provider in PROVIDER_LABELS ? PROVIDER_LABELS[provider as PaymentProvider] : (provider ?? '');
}

/** « 77 •• •• 45 67 » : seuls les 2 premiers et les 4 derniers chiffres du numéro local restent visibles. */
export function maskWalletPhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  const local = digits.startsWith('221') && digits.length === 12 ? digits.slice(3) : digits;
  if (local.length < 6) return local ? `•• ${local.slice(-2)}` : '';
  return `${local.slice(0, 2)} •• •• ${local.slice(-4, -2)} ${local.slice(-2)}`;
}

/** Numéro complet lisible (admins) : +221 77 123 45 67. */
export function formatWalletPhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('221')) {
    const l = digits.slice(3);
    return `+221 ${l.slice(0, 2)} ${l.slice(2, 5)} ${l.slice(5, 7)} ${l.slice(7)}`;
  }
  return phone ?? '';
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** 'AAAA-MM-JJ' (heure locale du navigateur) → ISO, début ou fin de journée. */
function dayBoundary(day: string | undefined, end: boolean): string | null {
  if (!day) return null;
  const d = new Date(`${day}T${end ? '23:59:59.999' : '00:00:00'}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function orderNumbersFor(orderIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(orderIds.filter(Boolean))];
  if (ids.length === 0) return map;
  const { data } = await supabase.from('orders').select('id, order_number').in('id', ids);
  for (const o of (data ?? []) as { id: string; order_number: string | null }[]) {
    if (o.order_number) map.set(o.id, o.order_number);
  }
  return map;
}

async function shopNamesFor(shopIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(shopIds.filter(Boolean))];
  if (ids.length === 0) return map;
  const { data } = await supabase.from('shops').select('id, name').in('id', ids);
  for (const s of (data ?? []) as { id: string; name: string | null }[]) {
    if (s.name) map.set(s.id, s.name);
  }
  return map;
}

// =====================================================================
// Vendeur
// =====================================================================

export interface SellerPaymentSummary {
  grossSales: number;
  commissions: number;
  netEarned: number;
  pending: number;
  available: number;
  inTransfer: number;
  paidOut: number;
  cancelledOrRefunded: number;
}

/** Résumé calculé côté serveur pour la boutique du vendeur connecté (auth.uid()). */
export async function fetchSellerFinanceSummary(): Promise<FeatureResult<{ summary: SellerPaymentSummary }>> {
  const { data, error } = await supabase.rpc('seller_finance_summary');
  if (error) {
    if (isModuleMissing(error)) return { supported: false };
    return { supported: true, error: error.code === 'P0001' ? error.message : 'Impossible de charger le résumé de vos paiements.' };
  }
  const v = (data ?? {}) as Record<string, unknown>;
  return {
    supported: true,
    summary: {
      grossSales: num(v.grossSales),
      commissions: num(v.commissions),
      netEarned: num(v.netEarned),
      pending: num(v.pending),
      available: num(v.available),
      inTransfer: num(v.inTransfer),
      paidOut: num(v.paidOut),
      cancelledOrRefunded: num(v.cancelledOrRefunded),
    },
  };
}

export interface PayoutMethod {
  id: string;
  shopId: string;
  provider: PaymentProvider;
  phone: string;
  holderName: string | null;
  status: PayoutMethodStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
}

const METHOD_COLUMNS = 'id, shop_id, provider, phone, holder_name, status, submitted_at, reviewed_at, review_note';

function mapMethod(row: Record<string, unknown>): PayoutMethod {
  return {
    id: row.id as string,
    shopId: row.shop_id as string,
    provider: row.provider as PaymentProvider,
    phone: (row.phone as string) ?? '',
    holderName: str(row.holder_name),
    status: row.status as PayoutMethodStatus,
    submittedAt: (row.submitted_at as string) ?? '',
    reviewedAt: str(row.reviewed_at),
    reviewNote: str(row.review_note),
  };
}

/** Moyen validé en cours et demande en attente de la boutique (la RLS limite déjà à la boutique du vendeur). */
export async function fetchMyPayoutMethods(shopId: string): Promise<FeatureResult<{ methods: PayoutMethod[] }>> {
  const { data, error } = await supabase
    .from('seller_payout_methods')
    .select(METHOD_COLUMNS)
    .eq('shop_id', shopId)
    .in('status', ['approved', 'pending_review'])
    .order('submitted_at', { ascending: false });
  if (error) return isModuleMissing(error) ? { supported: false } : { supported: true, error: 'Impossible de charger vos informations de paiement.' };
  // Au plus un compte validé et une demande en attente par fournisseur.
  return { supported: true, methods: ((data ?? []) as Record<string, unknown>[]).map(mapMethod) };
}

export async function submitPayoutMethod(input: {
  provider: PaymentProvider;
  phone: string;
  holderName: string;
  consent: boolean;
}): Promise<FeatureResult<{ id: string | null; status: 'approved' | 'pending_review' }>> {
  const { data, error } = await supabase.rpc('submit_payout_method', {
    p_provider: input.provider,
    p_phone: input.phone,
    p_holder_name: input.holderName,
    p_consent: input.consent,
  });
  if (error) {
    if (isModuleMissing(error)) return { supported: false };
    return { supported: true, error: error.code === 'P0001' ? error.message : 'Votre numéro n’a pas pu être envoyé. Réessayez dans un instant.' };
  }
  const v = (data ?? {}) as { id?: string; status?: string };
  // 'approved' : premier numéro, enregistré directement ; 'pending_review' :
  // changement de numéro, vérifié par Ezial.
  return { supported: true, id: v.id ?? null, status: v.status === 'approved' ? 'approved' : 'pending_review' };
}

export interface SellerPayout {
  id: string;
  shopId: string;
  provider: PaymentProvider;
  amount: number;
  status: SellerPayoutStatus;
  createdAt: string;
  completedAt: string | null;
}

export async function fetchMyPayouts(shopId: string, limit = 50): Promise<FeatureResult<{ payouts: SellerPayout[] }>> {
  const { data, error } = await supabase
    .from('seller_payouts')
    .select('id, shop_id, provider, amount, status, created_at, completed_at')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return isModuleMissing(error) ? { supported: false } : { supported: true, error: 'Impossible de charger l’historique de vos versements.' };
  return {
    supported: true,
    payouts: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      shopId: r.shop_id as string,
      provider: r.provider as PaymentProvider,
      amount: num(r.amount),
      status: r.status as SellerPayoutStatus,
      createdAt: (r.created_at as string) ?? '',
      completedAt: str(r.completed_at),
    })),
  };
}

// =====================================================================
// Admin (lecture seule, sauf validation des numéros et retraits)
// =====================================================================

export interface ShopOption {
  id: string;
  name: string;
}

/** Noms des boutiques, pour la recherche libre « boutique » des filtres admin. */
export async function fetchShopOptions(): Promise<ShopOption[]> {
  const { data } = await supabase.from('shops').select('id, name').order('name', { ascending: true });
  return ((data ?? []) as { id: string; name: string | null }[]).map((s) => ({ id: s.id, name: s.name ?? '' }));
}

export interface PaymentSettings {
  collectionsEnabled: boolean;
  payoutsEnabled: boolean;
  payoutFrequency: 'daily' | 'weekly';
  payoutWeekday: number;
  updatedAt: string | null;
}

export async function fetchPaymentSettings(): Promise<FeatureResult<{ settings: PaymentSettings | null }>> {
  const { data, error } = await supabase
    .from('payment_settings')
    .select('collections_enabled, payouts_enabled, payout_frequency, payout_weekday, updated_at')
    .maybeSingle();
  if (error) return isModuleMissing(error) ? { supported: false } : { supported: true, error: 'Impossible de lire les réglages de paiement.' };
  if (!data) return { supported: true, settings: null };
  return {
    supported: true,
    settings: {
      collectionsEnabled: Boolean(data.collections_enabled),
      payoutsEnabled: Boolean(data.payouts_enabled),
      payoutFrequency: data.payout_frequency === 'weekly' ? 'weekly' : 'daily',
      payoutWeekday: num(data.payout_weekday) || 1,
      updatedAt: str(data.updated_at),
    },
  };
}

export interface ProviderStatus {
  provider: PaymentProvider;
  capability: PaymentCapability;
  configured: boolean;
  ready: boolean;
  lastBalance: number | null;
  lastCheckedAt: string | null;
  lastError: string | null;
}

export async function fetchProviderStatus(): Promise<FeatureResult<{ statuses: ProviderStatus[] }>> {
  const { data, error } = await supabase
    .from('payment_provider_status')
    .select('provider, capability, configured, ready, last_balance, last_checked_at, last_error');
  if (error) return isModuleMissing(error) ? { supported: false } : { supported: true, error: 'Impossible de lire l’état des API de paiement.' };
  return {
    supported: true,
    statuses: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      provider: r.provider as PaymentProvider,
      capability: r.capability as PaymentCapability,
      configured: Boolean(r.configured),
      ready: Boolean(r.ready),
      lastBalance: r.last_balance === null || r.last_balance === undefined ? null : num(r.last_balance),
      lastCheckedAt: str(r.last_checked_at),
      lastError: str(r.last_error),
    })),
  };
}

export interface PaymentFilters {
  provider?: PaymentProvider;
  status?: string;
  /** 'AAAA-MM-JJ' inclus. */
  from?: string;
  /** 'AAAA-MM-JJ' inclus. */
  to?: string;
  /** Une ou plusieurs boutiques (recherche libre résolue par l'interface). */
  shopId?: string | string[];
}

function shopIdList(shopId: PaymentFilters['shopId']): string[] | null {
  if (shopId === undefined) return null;
  return Array.isArray(shopId) ? shopId : [shopId];
}

export interface PaymentTransaction {
  id: string;
  orderId: string;
  orderNumber: string | null;
  provider: PaymentProvider;
  status: PaymentTransactionStatus;
  amount: number;
  failureReason: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

export async function fetchPaymentTransactions(filters: PaymentFilters = {}, limit = 200): Promise<FeatureResult<{ transactions: PaymentTransaction[] }>> {
  let orderIdsForShops: string[] | null = null;
  const shopIds = shopIdList(filters.shopId);
  if (shopIds) {
    if (shopIds.length === 0) orderIdsForShops = [];
    else {
      const { data: osRows, error: osError } = await supabase.from('order_shops').select('order_id').in('shop_id', shopIds);
      if (osError) return { supported: true, error: 'Impossible de filtrer par boutique.' };
      orderIdsForShops = [...new Set(((osRows ?? []) as { order_id: string }[]).map((r) => r.order_id))];
    }
  }

  let query = supabase
    .from('payment_transactions')
    .select('id, order_id, provider, status, amount, failure_reason, created_at, confirmed_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (filters.provider) query = query.eq('provider', filters.provider);
  if (filters.status) query = query.eq('status', filters.status);
  const fromIso = dayBoundary(filters.from, false);
  const toIso = dayBoundary(filters.to, true);
  if (fromIso) query = query.gte('created_at', fromIso);
  if (toIso) query = query.lte('created_at', toIso);
  if (orderIdsForShops) {
    // Aucune commande pour ces boutiques : on vérifie quand même que la table existe.
    query = orderIdsForShops.length > 0 ? query.in('order_id', orderIdsForShops) : query.limit(0);
  }

  const { data, error } = await query;
  if (error) return isModuleMissing(error) ? { supported: false } : { supported: true, error: 'Impossible de charger les encaissements.' };
  const rows = (data ?? []) as Record<string, unknown>[];
  const numbers = await orderNumbersFor(rows.map((r) => r.order_id as string));
  return {
    supported: true,
    transactions: rows.map((r) => ({
      id: r.id as string,
      orderId: r.order_id as string,
      orderNumber: numbers.get(r.order_id as string) ?? null,
      provider: r.provider as PaymentProvider,
      status: r.status as PaymentTransactionStatus,
      amount: num(r.amount),
      failureReason: str(r.failure_reason),
      createdAt: (r.created_at as string) ?? '',
      confirmedAt: str(r.confirmed_at),
    })),
  };
}

export interface AdminSellerPayout extends SellerPayout {
  shopName: string | null;
  recipientPhone: string;
  blockReason: string | null;
  lastError: string | null;
  attempts: number;
}

export async function fetchSellerPayouts(filters: PaymentFilters = {}, limit = 200): Promise<FeatureResult<{ payouts: AdminSellerPayout[] }>> {
  let query = supabase
    .from('seller_payouts')
    .select('id, shop_id, provider, recipient_phone, amount, status, block_reason, last_error, attempts, created_at, completed_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (filters.provider) query = query.eq('provider', filters.provider);
  if (filters.status) query = query.eq('status', filters.status);
  const fromIso = dayBoundary(filters.from, false);
  const toIso = dayBoundary(filters.to, true);
  if (fromIso) query = query.gte('created_at', fromIso);
  if (toIso) query = query.lte('created_at', toIso);
  const shopIds = shopIdList(filters.shopId);
  if (shopIds) query = shopIds.length > 0 ? query.in('shop_id', shopIds) : query.limit(0);

  const { data, error } = await query;
  if (error) return isModuleMissing(error) ? { supported: false } : { supported: true, error: 'Impossible de charger les décaissements.' };
  const rows = (data ?? []) as Record<string, unknown>[];
  const names = await shopNamesFor(rows.map((r) => r.shop_id as string));
  return {
    supported: true,
    payouts: rows.map((r) => ({
      id: r.id as string,
      shopId: r.shop_id as string,
      shopName: names.get(r.shop_id as string) ?? null,
      provider: r.provider as PaymentProvider,
      recipientPhone: (r.recipient_phone as string) ?? '',
      amount: num(r.amount),
      status: r.status as SellerPayoutStatus,
      blockReason: str(r.block_reason),
      lastError: str(r.last_error),
      attempts: num(r.attempts),
      createdAt: (r.created_at as string) ?? '',
      completedAt: str(r.completed_at),
    })),
  };
}

export interface AmountDueToShop {
  shopId: string;
  shopName: string | null;
  amount: number;
}

/**
 * Montants dus aux vendeurs : ventes disponibles au versement et pas encore
 * rattachées à un versement (seller_transactions, calculées par le serveur).
 */
export async function fetchAmountsDueToSellers(): Promise<FeatureResult<{ total: number; shops: AmountDueToShop[] }>> {
  const { data, error } = await supabase
    .from('seller_transactions')
    .select('shop_id, net_amount')
    .eq('type', 'sale')
    .eq('status', 'available')
    .is('payout_id', null);
  if (error) return isModuleMissing(error) ? { supported: false } : { supported: true, error: 'Impossible de calculer les montants dus aux vendeurs.' };
  const byShop = new Map<string, number>();
  for (const r of (data ?? []) as { shop_id: string; net_amount: number | null }[]) {
    byShop.set(r.shop_id, (byShop.get(r.shop_id) ?? 0) + num(r.net_amount));
  }
  const names = await shopNamesFor([...byShop.keys()]);
  const shops = [...byShop.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([shopId, amount]) => ({ shopId, shopName: names.get(shopId) ?? null, amount }))
    .sort((a, b) => b.amount - a.amount);
  return { supported: true, total: shops.reduce((s, x) => s + x.amount, 0), shops };
}

export interface PendingPayoutMethod extends PayoutMethod {
  shopName: string | null;
  /** Numéro actuellement validé pour ce fournisseur (celui qui serait remplacé). */
  currentPhone: string | null;
}

export async function fetchPendingPayoutMethods(): Promise<FeatureResult<{ methods: PendingPayoutMethod[] }>> {
  const { data, error } = await supabase
    .from('seller_payout_methods')
    .select(METHOD_COLUMNS)
    .eq('status', 'pending_review')
    .order('submitted_at', { ascending: true });
  if (error) return isModuleMissing(error) ? { supported: false } : { supported: true, error: 'Impossible de charger les moyens de réception à valider.' };
  const methods = ((data ?? []) as Record<string, unknown>[]).map(mapMethod);
  const names = await shopNamesFor(methods.map((m) => m.shopId));
  const current = new Map<string, string>();
  if (methods.length > 0) {
    const { data: approved } = await supabase
      .from('seller_payout_methods')
      .select('shop_id, provider, phone')
      .eq('status', 'approved')
      .in('shop_id', [...new Set(methods.map((m) => m.shopId))]);
    for (const row of (approved ?? []) as { shop_id: string; provider: string; phone: string }[]) current.set(`${row.shop_id}:${row.provider}`, row.phone);
  }
  return {
    supported: true,
    methods: methods.map((m) => ({ ...m, shopName: names.get(m.shopId) ?? null, currentPhone: current.get(`${m.shopId}:${m.provider}`) ?? null })),
  };
}

export async function reviewPayoutMethod(methodId: string, approve: boolean, note: string): Promise<FeatureResult<{ status: 'approved' | 'rejected' }>> {
  const { error } = await supabase.rpc('admin_review_payout_method', {
    p_method_id: methodId,
    p_approve: approve,
    p_note: note.trim() || null,
  });
  if (error) {
    if (isModuleMissing(error)) return { supported: false };
    return { supported: true, error: error.code === 'P0001' ? error.message : 'La décision n’a pas pu être enregistrée. Réessayez dans un instant.' };
  }
  return { supported: true, status: approve ? 'approved' : 'rejected' };
}

export interface FinanceAnomaly {
  id: number;
  entityId: string;
  reason: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export async function fetchAnomalies(limit = 100): Promise<FeatureResult<{ anomalies: FinanceAnomaly[] }>> {
  const { data, error } = await supabase
    .from('ezial_events')
    .select('id, entity_id, payload, created_at')
    .eq('event_type', 'finance.anomaly')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return isModuleMissing(error) ? { supported: false } : { supported: true, error: 'Impossible de charger les anomalies.' };
  return {
    supported: true,
    anomalies: ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const payload = (r.payload && typeof r.payload === 'object' ? r.payload : {}) as Record<string, unknown>;
      return {
        id: num(r.id),
        entityId: (r.entity_id as string) ?? '',
        reason: str(payload.reason),
        payload,
        createdAt: (r.created_at as string) ?? '',
      };
    }),
  };
}

export interface AuditLogEntry {
  id: number;
  occurredAt: string;
  actorKind: string;
  action: string;
  entity: string;
  entityId: string | null;
}

export async function fetchAuditLog(limit = 100): Promise<FeatureResult<{ entries: AuditLogEntry[] }>> {
  const { data, error } = await supabase
    .from('finance_audit_log')
    .select('id, occurred_at, actor_kind, action, entity, entity_id')
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) return isModuleMissing(error) ? { supported: false } : { supported: true, error: 'Impossible de charger le journal d’audit.' };
  return {
    supported: true,
    entries: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: num(r.id),
      occurredAt: (r.occurred_at as string) ?? '',
      actorKind: (r.actor_kind as string) ?? '',
      action: (r.action as string) ?? '',
      entity: (r.entity as string) ?? '',
      entityId: str(r.entity_id),
    })),
  };
}

/**
 * Commissions Ezial lues dans order_shops.commission_amount (calculées par
 * create_order), hors sous-commandes annulées : total enregistré et part
 * portant sur des commandes dont le paiement est confirmé par le fournisseur.
 */
export async function fetchCommissionTotals(): Promise<FeatureResult<{ recorded: number; onConfirmedPayments: number }>> {
  const { data: confirmed, error: confirmedError } = await supabase
    .from('payment_transactions')
    .select('order_id')
    .eq('status', 'confirmed');
  if (confirmedError) return isModuleMissing(confirmedError) ? { supported: false } : { supported: true, error: 'Impossible de calculer les commissions.' };

  const { data: rows, error } = await supabase.from('order_shops').select('order_id, status, commission_amount');
  if (error) return { supported: true, error: 'Impossible de calculer les commissions.' };

  const confirmedOrders = new Set(((confirmed ?? []) as { order_id: string }[]).map((r) => r.order_id));
  let recorded = 0;
  let onConfirmedPayments = 0;
  for (const r of (rows ?? []) as { order_id: string; status: string | null; commission_amount: number | null }[]) {
    if (r.status === 'cancelled') continue;
    const c = num(r.commission_amount);
    recorded += c;
    if (confirmedOrders.has(r.order_id)) onConfirmedPayments += c;
  }
  return { supported: true, recorded, onConfirmedPayments };
}

export interface PickupToConfirm {
  orderShopId: string;
  orderId: string;
  orderNumber: string | null;
  shopId: string;
  shopName: string | null;
  netAmount: number;
  orderDate: string;
}

/**
 * Retraits en boutique déclarés par le vendeur (status 'picked_up'), commande
 * payée, dont la vente est encore « en attente » : ils attendent la
 * confirmation d'un administrateur pour devenir versables.
 */
export async function fetchPickupsToConfirm(): Promise<FeatureResult<{ pickups: PickupToConfirm[] }>> {
  const { data: sales, error } = await supabase
    .from('seller_transactions')
    .select('order_shop_id, net_amount')
    .eq('type', 'sale')
    .eq('status', 'pending')
    .not('order_shop_id', 'is', null);
  if (error) return isModuleMissing(error) ? { supported: false } : { supported: true, error: 'Impossible de charger les retraits à confirmer.' };

  const netByOrderShop = new Map<string, number>();
  for (const r of (sales ?? []) as { order_shop_id: string; net_amount: number | null }[]) {
    netByOrderShop.set(r.order_shop_id, (netByOrderShop.get(r.order_shop_id) ?? 0) + num(r.net_amount));
  }
  if (netByOrderShop.size === 0) return { supported: true, pickups: [] };

  const { data: osRows, error: osError } = await supabase
    .from('order_shops')
    .select('id, order_id, shop_id')
    .in('id', [...netByOrderShop.keys()])
    .eq('fulfillment_type', 'pickup')
    .eq('status', 'picked_up');
  if (osError) return { supported: true, error: 'Impossible de charger les retraits à confirmer.' };
  const orderShops = (osRows ?? []) as { id: string; order_id: string; shop_id: string }[];
  if (orderShops.length === 0) return { supported: true, pickups: [] };

  const { data: orderRows, error: ordersError } = await supabase
    .from('orders')
    .select('id, order_number, created_at')
    .in('id', [...new Set(orderShops.map((os) => os.order_id))])
    .eq('payment_status', 'paid');
  if (ordersError) return { supported: true, error: 'Impossible de charger les retraits à confirmer.' };
  const paidOrders = new Map(((orderRows ?? []) as { id: string; order_number: string | null; created_at: string }[]).map((o) => [o.id, o]));

  const eligible = orderShops.filter((os) => paidOrders.has(os.order_id));
  const names = await shopNamesFor(eligible.map((os) => os.shop_id));
  return {
    supported: true,
    pickups: eligible
      .map((os) => {
        const order = paidOrders.get(os.order_id);
        return {
          orderShopId: os.id,
          orderId: os.order_id,
          orderNumber: order?.order_number ?? null,
          shopId: os.shop_id,
          shopName: names.get(os.shop_id) ?? null,
          netAmount: netByOrderShop.get(os.id) ?? 0,
          orderDate: order?.created_at ?? '',
        };
      })
      .sort((a, b) => a.orderDate.localeCompare(b.orderDate)),
  };
}

/** Confirme un retrait en boutique déclaré par le vendeur (admin seulement, vérifié côté serveur). */
export async function confirmPickup(orderShopId: string): Promise<FeatureResult<{ confirmed: true }>> {
  const { error } = await supabase.rpc('admin_confirm_pickup', { p_order_shop_id: orderShopId });
  if (error) {
    if (isModuleMissing(error)) return { supported: false };
    return { supported: true, error: error.code === 'P0001' ? error.message : 'Le retrait n’a pas pu être confirmé. Réessayez dans un instant.' };
  }
  return { supported: true, confirmed: true };
}
