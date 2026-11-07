import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// « Tendances » = what people like most: product_popularity() (favorites and
// purchases of the last 90 days, cancelled orders excluded) returns only an
// order of products, never a sales or favorites count. Fetched once per page
// load and shared. If the function is unavailable (migration not applied
// yet, network error), the map is empty and the section falls back to
// recency — the page never depends on it to render.

export type PopularityRanks = Map<string, number>;

let pending: Promise<PopularityRanks> | null = null;

export function fetchProductPopularity(): Promise<PopularityRanks> {
  if (!pending) {
    pending = (async () => {
      try {
        const { data, error } = await supabase.rpc('product_popularity');
        if (error || !Array.isArray(data)) { pending = null; return new Map(); }
        const ranks: PopularityRanks = new Map();
        for (const row of data as { product_id?: string; popularity_rank?: number }[]) {
          if (row.product_id && typeof row.popularity_rank === 'number') ranks.set(row.product_id, row.popularity_rank);
        }
        return ranks;
      } catch {
        pending = null; // retried on the next page that needs it
        return new Map();
      }
    })();
  }
  return pending;
}

export function useProductPopularity(): PopularityRanks {
  const [ranks, setRanks] = useState<PopularityRanks>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    void fetchProductPopularity().then((r) => { if (!cancelled) setRanks(r); });
    return () => { cancelled = true; };
  }, []);
  return ranks;
}
