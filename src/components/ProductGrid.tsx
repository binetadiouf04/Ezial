import type { Product } from '@/data/products';
import ProductCard from './ProductCard';

export default function ProductGrid({ products, columns = 4 }: { products: Product[]; columns?: 2 | 3 | 4 | 5 }) {
  const colClass = { 2: 'grid-cols-2', 3: 'grid-cols-2 sm:grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4', 5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' }[columns];
  if (!products.length) return <div className="flex flex-col items-center justify-center py-20 text-center"><p className="text-sm text-ink/50">Aucun produit trouvé.</p></div>;
  // First row (whatever the current breakpoint's column count) loads eager
  // + high priority instead of lazy — it's already in the initial viewport
  // on every listing page (Catégorie/Recherche/Boutique/Favoris...), so
  // deferring it like an offscreen image only delays the page's own LCP.
  return <div className={`grid ${colClass} gap-x-4 gap-y-8 sm:gap-x-5 sm:gap-y-10`}>{products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}</div>;
}
