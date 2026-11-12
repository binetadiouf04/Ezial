import { supabase } from './supabaseClient';
import { isModuleMissing, type FeatureResult } from './supabaseFeatureDetect';

// Accès Ezial Plus offerts par un administrateur (partenaires, collaborations),
// indépendants de l'essai standard de 30 jours. Ce fichier ne fait que LIRE
// premium_grants et finance_audit_log (RLS : un admin lit tout) et appeler les
// trois fonctions réservées aux administrateurs ; aucune écriture directe.
//
// Tant que la migration n'est pas exécutée, chaque fonction renvoie
// { supported: false } et l'interface se masque ou affiche « pas encore installé ».

export type PremiumGrantStatus = 'active' | 'expired' | 'ended_early';
export type PremiumGrantMonths = 3 | 6;

export const PREMIUM_GRANT_MONTH_OPTIONS: PremiumGrantMonths[] = [3, 6];
export const PREMIUM_GRANT_REASON_MAX = 300;

export const PREMIUM_GRANT_MODULE_MISSING = 'Module pas encore installé (migration SQL à exécuter).';
const GENERIC_ERROR = 'L’opération n’a pas pu être enregistrée. Réessayez dans un instant.';

export interface PremiumGrant {
  id: string;
  shopId: string;
  grantedMonths: number;
  startsAt: string;
  /** Fin actuelle (se décale à chaque prolongation). */
  endsAt: string;
  originalEndsAt: string;
  status: PremiumGrantStatus;
  reason: string | null;
  grantedBy: string | null;
  priorProUntil: string | null;
  extendedMonths: number;
  endedAt: string | null;
  endedBy: string | null;
  endReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PremiumGrantAction = 'premium_grant_created' | 'premium_grant_extended' | 'premium_grant_ended' | 'premium_grant_expired';

export interface PremiumGrantEvent {
  id: number;
  grantId: string;
  /** Action d'audit brute ; voir premiumGrantEventLabel. */
  action: string;
  actorKind: string;
  occurredAt: string;
  shopId: string | null;
  months: number | null;
  reason: string | null;
  endsAt: string | null;
  previousEndsAt: string | null;
  backToFree: boolean | null;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function cleanReason(reason: string | null | undefined): string | null {
  const r = (reason ?? '').trim().slice(0, PREMIUM_GRANT_REASON_MAX);
  return r === '' ? null : r;
}

const GRANT_COLUMNS =
  'id, shop_id, granted_months, starts_at, ends_at, original_ends_at, status, reason, granted_by, prior_pro_until, extended_months, ended_at, ended_by, end_reason, created_at, updated_at';

function mapGrant(row: Record<string, unknown>): PremiumGrant {
  const status = row.status === 'active' || row.status === 'ended_early' ? row.status : 'expired';
  return {
    id: row.id as string,
    shopId: row.shop_id as string,
    grantedMonths: num(row.granted_months),
    startsAt: (row.starts_at as string) ?? '',
    endsAt: (row.ends_at as string) ?? '',
    originalEndsAt: (row.original_ends_at as string) ?? '',
    status,
    reason: str(row.reason),
    grantedBy: str(row.granted_by),
    priorProUntil: str(row.prior_pro_until),
    extendedMonths: num(row.extended_months),
    endedAt: str(row.ended_at),
    endedBy: str(row.ended_by),
    endReason: str(row.end_reason),
    createdAt: (row.created_at as string) ?? '',
    updatedAt: (row.updated_at as string) ?? '',
  };
}

/** Tous les accès offerts d'une boutique, du plus récent au plus ancien. */
export async function fetchShopPremiumGrants(shopId: string): Promise<FeatureResult<{ grants: PremiumGrant[] }>> {
  const { data, error } = await supabase
    .from('premium_grants')
    .select(GRANT_COLUMNS)
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });
  if (error) return isModuleMissing(error) ? { supported: false } : { supported: true, error: 'Impossible de charger les accès offerts.' };
  return { supported: true, grants: ((data ?? []) as Record<string, unknown>[]).map(mapGrant) };
}

/** Événements d'audit (création, prolongation, interruption, expiration) des accès donnés, du plus récent au plus ancien. */
export async function fetchPremiumGrantHistory(grantIds: string[]): Promise<FeatureResult<{ events: PremiumGrantEvent[] }>> {
  const ids = [...new Set(grantIds.filter(Boolean))];
  if (ids.length === 0) return { supported: true, events: [] };
  const { data, error } = await supabase
    .from('finance_audit_log')
    .select('id, occurred_at, actor_kind, action, entity_id, details')
    .eq('entity', 'premium_grant')
    .in('entity_id', ids)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) return isModuleMissing(error) ? { supported: false } : { supported: true, error: 'Impossible de charger l’historique.' };
  return {
    supported: true,
    events: ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const d = (r.details && typeof r.details === 'object' ? r.details : {}) as Record<string, unknown>;
      return {
        id: num(r.id),
        grantId: (r.entity_id as string) ?? '',
        action: (r.action as string) ?? '',
        actorKind: (r.actor_kind as string) ?? '',
        occurredAt: (r.occurred_at as string) ?? '',
        shopId: str(d.shop_id),
        months: d.months === null || d.months === undefined ? null : num(d.months),
        reason: str(d.reason),
        endsAt: str(d.ends_at),
        previousEndsAt: str(d.previous_ends_at),
        backToFree: typeof d.back_to_free === 'boolean' ? d.back_to_free : null,
      };
    }),
  };
}

/** Erreur d'une fonction RPC : message prêt à afficher (P0001) ou message générique. */
function rpcFailure(error: { code?: string; message?: string }): { supported: false } | { supported: true; error: string } {
  // P0001 d'abord : un message métier ne doit jamais être pris pour « module absent ».
  if (error.code === 'P0001' && error.message) return { supported: true, error: error.message };
  if (isModuleMissing(error)) return { supported: false };
  return { supported: true, error: GENERIC_ERROR };
}

export async function grantPremium(
  shopId: string,
  months: PremiumGrantMonths,
  reason?: string | null,
): Promise<FeatureResult<{ grantId: string | null; startsAt: string | null; endsAt: string | null }>> {
  const { data, error } = await supabase.rpc('admin_grant_premium', {
    p_shop_id: shopId,
    p_months: months,
    p_reason: cleanReason(reason),
  });
  if (error) return rpcFailure(error);
  const v = (data ?? {}) as Record<string, unknown>;
  return { supported: true, grantId: str(v.grantId), startsAt: str(v.startsAt), endsAt: str(v.endsAt) };
}

export async function extendPremiumGrant(
  grantId: string,
  months: PremiumGrantMonths,
  reason?: string | null,
): Promise<FeatureResult<{ endsAt: string | null }>> {
  const { data, error } = await supabase.rpc('admin_extend_premium_grant', {
    p_grant_id: grantId,
    p_months: months,
    p_reason: cleanReason(reason),
  });
  if (error) return rpcFailure(error);
  const v = (data ?? {}) as Record<string, unknown>;
  return { supported: true, endsAt: str(v.endsAt) };
}

export async function endPremiumGrant(
  grantId: string,
  reason?: string | null,
): Promise<FeatureResult<{ status: 'ended_early'; backToFree: boolean }>> {
  const { data, error } = await supabase.rpc('admin_end_premium_grant', {
    p_grant_id: grantId,
    p_reason: cleanReason(reason),
  });
  if (error) return rpcFailure(error);
  const v = (data ?? {}) as Record<string, unknown>;
  return { supported: true, status: 'ended_early', backToFree: v.backToFree === true };
}
