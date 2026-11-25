import { supabase } from './supabaseClient';
import { isModuleMissing, isRpcMissing, type FeatureResult } from './supabaseFeatureDetect';
import { parseUrgentDeliveryOptions, type UrgentDeliveryOptions } from './urgentDelivery';

// Livraison urgente côté Supabase (migration docs/sql/lancement-livraison-urgente.sql).
// Avant l'exécution de la migration : les fonctions et colonnes n'existent pas,
// chaque appel ici renvoie « rien » (option masquée, aucun badge) sans erreur.

/** Options proposées au client à l'instant, ou null si l'option ne doit pas s'afficher. */
export async function fetchUrgentDeliveryOptions(): Promise<UrgentDeliveryOptions | null> {
  try {
    const { data, error } = await supabase.rpc('get_urgent_delivery_options');
    if (error) return null;
    return parseUrgentDeliveryOptions(data);
  } catch {
    return null;
  }
}

/**
 * Parmi ces commandes, celles qui sont urgentes. Requête séparée et sans
 * risque : si la colonne is_urgent n'existe pas encore (ou en cas d'erreur),
 * l'ensemble est vide et les listes s'affichent exactement comme avant.
 */
export async function fetchUrgentOrderIds(orderIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(orderIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  try {
    const { data, error } = await supabase.from('orders').select('id').in('id', ids).eq('is_urgent', true);
    if (error || !data) return new Set();
    return new Set((data as { id: string }[]).map((r) => r.id));
  } catch {
    return new Set();
  }
}

// ---------------------------------------------------------------------------
// Ezial Admin : réglages
// ---------------------------------------------------------------------------

export interface UrgentSlotSetting {
  label: string;
  start: string;
  end: string;
  cutoff: string;
  enabled: boolean;
}

export interface UrgentDeliverySettings {
  enabled: boolean;
  minLeadMinutes: number;
  maxDaysAhead: number;
  slots: UrgentSlotSetting[];
  updatedAt: string | null;
}

function toSettings(row: Record<string, unknown>): UrgentDeliverySettings {
  const slots = Array.isArray(row.slots) ? (row.slots as Record<string, unknown>[]) : [];
  return {
    enabled: row.enabled === true,
    minLeadMinutes: Number(row.min_lead_minutes) || 0,
    maxDaysAhead: Number(row.max_days_ahead) || 0,
    slots: slots.map((s) => ({
      label: String(s.label ?? ''),
      start: String(s.start ?? ''),
      end: String(s.end ?? ''),
      cutoff: String(s.cutoff ?? ''),
      enabled: s.enabled === true,
    })),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

export async function fetchUrgentDeliverySettings(): Promise<FeatureResult<{ settings: UrgentDeliverySettings | null }>> {
  const { data, error } = await supabase
    .from('urgent_delivery_settings')
    .select('enabled, min_lead_minutes, max_days_ahead, slots, updated_at')
    .maybeSingle();
  if (error) return isModuleMissing(error) ? { supported: false } : { supported: true, error: 'Impossible de lire les réglages de la livraison urgente.' };
  return { supported: true, settings: data ? toSettings(data as Record<string, unknown>) : null };
}

export async function saveUrgentDeliverySettings(
  settings: Omit<UrgentDeliverySettings, 'updatedAt'>,
): Promise<{ settings: UrgentDeliverySettings } | { error: string }> {
  const { data, error } = await supabase.rpc('admin_update_urgent_delivery_settings', {
    p_enabled: settings.enabled,
    p_min_lead_minutes: settings.minLeadMinutes,
    p_max_days_ahead: settings.maxDaysAhead,
    p_slots: settings.slots,
  });
  if (error) {
    if (isRpcMissing(error)) return { error: 'La migration de la livraison urgente n’est pas encore exécutée.' };
    // Messages en français écrits par la fonction serveur (créneau invalide, droits…).
    return { error: error.message || 'Enregistrement impossible. Réessayez.' };
  }
  return { settings: toSettings((data ?? {}) as Record<string, unknown>) };
}
