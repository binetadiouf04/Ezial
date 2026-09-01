import type { SupabaseClient } from '@supabase/supabase-js';

export interface TableReadResult {
  ok: boolean;
  /** Number of rows visible under the current RLS policies (head-only count, no rows fetched). */
  count: number;
  error?: string;
}

export interface SupabaseHealthCheckResult {
  shops: TableReadResult;
  products: TableReadResult;
}

/**
 * Minimal connectivity check: confirms the frontend can read from
 * public.shops and public.products under the existing RLS policies
 * (which already scope these to active shops/products). Does not fetch
 * or transform rows — just proves the read path works end to end.
 */
export async function checkSupabaseConnection(client: SupabaseClient): Promise<SupabaseHealthCheckResult> {
  const [shopsRes, productsRes] = await Promise.all([
    client.from('shops').select('id', { count: 'exact', head: true }),
    client.from('products').select('id', { count: 'exact', head: true }),
  ]);

  return {
    shops: { ok: !shopsRes.error, count: shopsRes.count ?? 0, error: shopsRes.error?.message },
    products: { ok: !productsRes.error, count: productsRes.count ?? 0, error: productsRes.error?.message },
  };
}
