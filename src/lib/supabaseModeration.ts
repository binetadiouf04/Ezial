import { supabase } from './supabaseClient';

// Real admin → seller moderation flags, backed by public.moderation_flags
// (schema agreed with the user before creation: target_type/target_id/
// note/created_by/created_at/resolved_at). Admin can create and resolve
// flags on any shop/product; a seller can only read flags on their own
// shop/products (enforced by RLS, not by this file) — the note is never
// exposed to customers anywhere in the app.

export type ModerationTargetType = 'shop' | 'product';

export interface ModerationFlagRow {
  id: string;
  targetType: ModerationTargetType;
  targetId: string;
  note: string;
  createdAt: string;
  resolvedAt: string | null;
}

function mapRow(row: Record<string, unknown>): ModerationFlagRow {
  return {
    id: row.id as string,
    targetType: row.target_type as ModerationTargetType,
    targetId: row.target_id as string,
    note: (row.note as string) ?? '',
    createdAt: (row.created_at as string) ?? '',
    resolvedAt: (row.resolved_at as string | null) ?? null,
  };
}

export async function createModerationFlag(targetType: ModerationTargetType, targetId: string, note: string): Promise<{ error?: string }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { error: 'Non authentifié.' };
  const { error } = await supabase
    .from('moderation_flags')
    .insert({ target_type: targetType, target_id: targetId, note, created_by: userData.user.id });
  return error ? { error: error.message } : {};
}

export async function fetchModerationFlags(targetType: ModerationTargetType, targetId: string): Promise<ModerationFlagRow[]> {
  const { data, error } = await supabase
    .from('moderation_flags')
    .select('*')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map(mapRow);
}

/** Batch fetch for a list screen (e.g. every product of a shop) — one query instead of N. */
export async function fetchModerationFlagsForTargets(targetType: ModerationTargetType, targetIds: string[]): Promise<Map<string, ModerationFlagRow[]>> {
  const map = new Map<string, ModerationFlagRow[]>();
  if (targetIds.length === 0) return map;
  const { data } = await supabase
    .from('moderation_flags')
    .select('*')
    .eq('target_type', targetType)
    .in('target_id', targetIds)
    .order('created_at', { ascending: false });
  for (const row of (data ?? []).map(mapRow)) {
    const list = map.get(row.targetId) ?? [];
    list.push(row);
    map.set(row.targetId, list);
  }
  return map;
}

export async function resolveModerationFlag(flagId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('moderation_flags').update({ resolved_at: new Date().toISOString() }).eq('id', flagId);
  return error ? { error: error.message } : {};
}

export function latestUnresolvedFlag(flags: ModerationFlagRow[]): ModerationFlagRow | null {
  return flags.find((f) => !f.resolvedAt) ?? null;
}
