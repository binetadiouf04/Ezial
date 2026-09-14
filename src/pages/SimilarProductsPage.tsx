import { useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import { getProduct, getProductsFromSameShop, getSimilarProducts } from '@/data/products';
import ProductGrid from '@/components/ProductGrid';
import { ChevronRight } from 'lucide-react';

// Uncapped (well, generously capped) "Voir tout" for a product's "Vous
// aimerez aussi" — same ranking as the ProductPage preview (same
// category/subcategory first, then relevant fallbacks), just more of it.
const SIMILAR_FULL_LIMIT = 60;

export default function SimilarProductsPage({ productId }: { productId: string }) {
  const { navigate, catalogProducts } = useApp();
  const product = getProduct(productId) ?? catalogProducts.find((p) => p.id === productId);

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
        {product && <><button onClick={() => navigate(`/produit/${product.id}`)} className="hover:text-burgundy line-clamp-1">{product.name}</button><ChevronRight size={12} /></>}
        <span className="text-ink/70">Produits similaires</span>
      </nav>

      {!product ? (
        <div className="flex flex-col items-center justify-center py-20 text-center"><p className="text-sm text-ink/50">Produit introuvable.</p></div>
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
