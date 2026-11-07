import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { getProductsFromSameShop, getSimilarProducts, type Product } from '@/data/products';
import { registerSupabaseShops } from '@/data/shops';
import { fetchProductDetailFromSupabase } from '@/lib/supabaseCatalog';
import { findProductByKey, productPath } from '@/lib/productUrl';
import { useNoIndex } from '@/lib/seoHead';
import ProductGrid from '@/components/ProductGrid';
import { ChevronRight } from 'lucide-react';

// Uncapped (well, generously capped) "Voir tout" for a product's "Vous
// aimerez aussi" — same ranking as the ProductPage preview (same
// category/subcategory first, then relevant fallbacks), just more of it.
const SIMILAR_FULL_LIMIT = 60;

// Real catalog only — never the static demo catalog (src/data/products.ts's
// getProduct). A product missing from the loaded catalog is looked up
// directly in Supabase, exactly like ProductPage does; if it still isn't
// found (deleted, unpublished), the page says so and is marked noindex.
interface DirectLookup { key: string; product: Product | null; error?: string }

export default function SimilarProductsPage({ productId }: { productId: string }) {
  const { navigate, catalogProducts, catalogLoading } = useApp();
  const fromCatalog = catalogLoading ? undefined : findProductByKey(catalogProducts, productId);
  const [lookup, setLookup] = useState<DirectLookup | null>(null);

  useEffect(() => {
    if (catalogLoading || fromCatalog) return;
    let cancelled = false;
    fetchProductDetailFromSupabase(productId).then(({ product, shop, error }) => {
      if (cancelled) return;
      if (shop) registerSupabaseShops([shop]);
      setLookup({ key: productId, product, error });
    });
    return () => { cancelled = true; };
  }, [catalogLoading, fromCatalog, productId]);

  const directResult = lookup?.key === productId ? lookup : null;
  const product = fromCatalog ?? directResult?.product ?? undefined;
  const loading = !product && (catalogLoading || !directResult);
  const loadError = !product && Boolean(directResult?.error);
  const notFound = !loading && !loadError && !product;

  useNoIndex(notFound);

  const similarProducts = useMemo(() => {
    if (!product) return [];
    const sameShopIds = getProductsFromSameShop(product, catalogProducts).map((p) => p.id);
    return getSimilarProducts(product, catalogProducts, sameShopIds, SIMILAR_FULL_LIMIT);
  }, [product, catalogProducts]);

  return (
    <div className="container-pro py-6">
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-ink/40">
        <button onClick={() => navigate('/')} className="hover:text-burgundy">Accueil</button>
        <ChevronRight size={12} />
        {product && <><button onClick={() => navigate(productPath(product))} className="hover:text-burgundy line-clamp-1">{product.name}</button><ChevronRight size={12} /></>}
        <span className="text-ink/70">Produits similaires</span>
      </nav>

      {loading ? (
        <p className="py-20 text-center text-sm text-ink/45">Chargement des produits…</p>
      ) : loadError ? (
        <p className="py-20 text-center text-sm text-ink/50">Une erreur est survenue lors du chargement du produit.</p>
      ) : !product ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm text-ink/50">Produit introuvable : il n’est plus disponible sur Ezial.</p>
          <button onClick={() => navigate('/')} className="mt-4 text-sm font-medium text-burgundy hover:underline">Retour à l’accueil</button>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">Vous aimerez aussi</h1>
            <p className="mt-2 text-sm text-ink/55">Autour de « {product.name} » — {similarProducts.length} produit{similarProducts.length > 1 ? 's' : ''}</p>
          </div>
          <ProductGrid products={similarProducts} columns={4} />
        </>
      )}
    </div>
  );
}
