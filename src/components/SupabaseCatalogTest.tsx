import { useEffect, useState } from 'react';
import { fetchActiveCatalogFromSupabase } from '@/lib/supabaseCatalog';

// TEMPORARY — diagnostic block for testing fetchActiveCatalogFromSupabase()
// from the deployed site (this environment can't reach Supabase directly).
// Does not touch the mock catalog, ProductCard, or ProductPage. Remove once
// the fetch has been confirmed working.
export default function SupabaseCatalogTest() {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ok'; shopsCount: number; productsCount: number; firstProductName: string | null }
    | { status: 'error'; message: string }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchActiveCatalogFromSupabase()
      .then((result) => {
        if (cancelled) return;
        if (result.errors.length > 0) {
          setState({ status: 'error', message: result.errors.join(' | ') });
          return;
        }
        setState({
          status: 'ok',
          shopsCount: result.shops.length,
          productsCount: result.products.length,
          firstProductName: result.products[0]?.name ?? null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="rounded-lg border border-dashed border-ink/25 bg-cream/60 px-4 py-2.5 text-xs font-mono text-ink/70 space-y-0.5">
      {state.status === 'loading' && 'Catalogue Supabase — vérification en cours…'}
      {state.status === 'ok' && (
        <>
          <p>Catalogue Supabase connecté</p>
          <p>Boutiques récupérées : {state.shopsCount}</p>
          <p>Produits récupérés : {state.productsCount}</p>
          <p>Premier produit : {state.firstProductName ?? '—'}</p>
        </>
      )}
      {state.status === 'error' && `Catalogue Supabase erreur — ${state.message}`}
    </div>
  );
}
