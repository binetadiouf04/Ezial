import { useApp } from '@/store/AppContext';
import ProductGrid from '@/components/ProductGrid';
import { Heart } from 'lucide-react';

export default function FavoritesPage() {
  const { favorites, navigate, catalogProducts } = useApp();
  // catalogProducts (mock + real Supabase catalog merged), never the static
  // mock-only getProduct() — a favorited real Supabase product (UUID id)
  // doesn't exist in the mock map and would silently vanish from this page.
  const favProducts = favorites.map((id) => catalogProducts.find((p) => p.id === id)).filter(Boolean) as typeof catalogProducts;

  return (
    <div className="container-pro py-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold text-ink">Favoris</h1>
        <p className="mt-1.5 text-sm text-ink/55">{favProducts.length > 0 ? `${favProducts.length} produit${favProducts.length > 1 ? 's' : ''} sauvegardé${favProducts.length > 1 ? 's' : ''}` : 'Vos coups de cœur en un coup d\'œil'}</p>
      </div>
      {favProducts.length > 0 ? <ProductGrid products={favProducts} columns={4} /> : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Heart size={42} className="text-ink/20" /><p className="mt-4 text-sm text-ink/60">Aucun favori pour l'instant.</p><p className="mt-1 text-xs text-ink/40">Touchez le cœur sur un produit pour le retrouver ici.</p>
          <button onClick={() => navigate('/')} className="btn-outline mt-6">Découvrir les produits</button>
        </div>
      )}
    </div>
  );
}
