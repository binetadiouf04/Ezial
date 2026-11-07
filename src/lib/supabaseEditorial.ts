import { supabase } from './supabaseClient';

// "Sélection Ezial": products recommended by the Ezial team on the homepage,
// reserved for Ezial Plus shops (public.editorial_picks — see the migration
// shipped with this feature). The database enforces the rules (12 items at
// most, active product of an active Ezial Plus shop when added, admin-only
// writes); this public read only returns the ordered list of product ids.
// Whether a pick is still shown (product still in the public catalog, shop
// still Ezial Plus) is decided by the caller against the loaded catalog.

export const EDITORIAL_PICKS_MAX = 12;

export interface EditorialPick {
  id: string;
  productId: string;
  sortOrder: number;
}

interface EditorialPickRow {
  id: string;
  product_id: string;
  sort_order: number;
}

/** PostgREST / PostgreSQL error raised while the migration hasn't run yet. */
export function isMissingEditorialTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === 'PGRST205' || error.code === '42P01') return true;
  const message = error.message ?? '';
  return message.includes('editorial_picks') && (message.includes('schema cache') || message.includes('does not exist'));
}

/** Public read, in display order. Never throws: any failure (missing table included) comes back as `error` with an empty list. */
export async function fetchEditorialPicks(): Promise<{ picks: EditorialPick[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('editorial_picks')
      .select('id, product_id, sort_order')
      .order('sort_order', { ascending: true })
      .limit(EDITORIAL_PICKS_MAX);
    if (error) return { picks: [], error: error.message };
    return {
      picks: ((data ?? []) as EditorialPickRow[]).map((row) => ({ id: row.id, productId: row.product_id, sortOrder: row.sort_order })),
    };
  } catch (e) {
    return { picks: [], error: e instanceof Error ? e.message : 'Erreur réseau.' };
  }
}
