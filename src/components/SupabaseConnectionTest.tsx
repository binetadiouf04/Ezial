import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { checkSupabaseConnection } from '@/lib/supabaseHealthCheck';

// TEMPORARY — visual Supabase connectivity check for the current
// frontend-only integration step. Reads only public.shops / public.products
// under the existing RLS policies (already scoped to active rows). Does not
// touch the mock catalog. Remove once the connection has been confirmed.
export default function SupabaseConnectionTest() {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'ok'; shops: number; products: number } | { status: 'error'; message: string }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    checkSupabaseConnection(supabase)
      .then((result) => {
        if (cancelled) return;
        if (result.shops.ok && result.products.ok) {
          setState({ status: 'ok', shops: result.shops.count, products: result.products.count });
        } else {
          setState({ status: 'error', message: result.shops.error || result.products.error || 'Erreur inconnue' });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="rounded-lg border border-dashed border-ink/25 bg-cream/60 px-4 py-2.5 text-xs font-mono text-ink/70">
      {state.status === 'loading' && 'Supabase — vérification en cours…'}
      {state.status === 'ok' && `Supabase connecté — ${state.shops} boutique(s) — ${state.products} produit(s)`}
      {state.status === 'error' && `Supabase erreur — ${state.message}`}
    </div>
  );
}
