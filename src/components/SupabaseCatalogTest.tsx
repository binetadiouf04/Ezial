import { useEffect, useState } from 'react';
import { fetchActiveCatalogFromSupabase } from '@/lib/supabaseCatalog';

// TEMPORARY — diagnostic block for testing fetchActiveCatalogFromSupabase()
// from the deployed site (this environment can't reach Supabase directly).
// Does not touch the mock catalog, ProductCard, or ProductPage. Remove once
// the fetch has been confirmed working.
export default function SupabaseCatalogTest() {
  const [state, setState] = useState<
    | { status: 'loading' }
    | {
        status: 'ok';
        productName: string | null;
        imageUrl: string | null;
        variantLabel: string | null;
        variantPrice: number | null;
        variantStock: number | null;
      }
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
        const firstProduct = result.products[0] ?? null;
        const firstVariant = firstProduct?.variantPrices?.[0] ?? null;
        setState({
          status: 'ok',
          productName: firstProduct?.name ?? null,
          imageUrl: firstProduct?.images?.[0] ?? null,
          variantLabel: firstVariant ? JSON.stringify(firstVariant.conditions) : null,
          variantPrice: firstVariant?.price ?? null,
          variantStock: firstVariant?.stock ?? null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="rounded-lg border border-dashed border-ink/25 bg-cream/60 px-4 py-2.5 text-xs font-mono text-ink/70 space-y-0.5 break-all">
      {state.status === 'loading' && 'Catalogue Supabase — vérification en cours…'}
      {state.status === 'ok' && (
        <>
          <p>Premier produit : {state.productName ?? '—'}</p>
          <p>Image principale : {state.imageUrl ?? '—'}</p>
          <p>Première variante : {state.variantLabel ?? '—'}</p>
          <p>Prix variante : {state.variantPrice ?? '—'}</p>
          <p>Stock variante : {state.variantStock ?? '—'}</p>
        </>
      )}
      {state.status === 'error' && `Catalogue Supabase erreur — ${state.message}`}
    </div>
  );
}
