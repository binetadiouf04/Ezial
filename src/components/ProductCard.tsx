import { useApp } from '@/store/AppContext';
import type { Product } from '@/data/products';
import PriceDisplay from './PriceDisplay';
import Rating from './Rating';
import FavoriteButton from './FavoriteButton';
import { getShop } from '@/data/shops';
import SmartImage from './SmartImage';

export default function ProductCard({ product }: { product: Product }) {
  const { navigate } = useApp();
  const shop = getShop(product.shopId);
  const outOfStock = product.stock === 0;
  const lowStock = product.stock > 0 && product.stock <= 3;

  return (
    <div onClick={() => navigate(`/produit/${product.id}`)} className="group cursor-pointer">
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-cream">
        <SmartImage src={product.images[0]} alt={product.name} className={`h-full w-full object-cover transition-transform duration-700 group-hover:scale-105 ${outOfStock ? 'opacity-60 grayscale' : ''}`} />
        <div className="absolute right-2.5 top-2.5"><FavoriteButton productId={product.id} /></div>
        {product.isNew && !product.isPromo && <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink">Nouveau</span>}
        {outOfStock && <div className="absolute inset-0 flex items-center justify-center"><span className="rounded-full bg-ink/80 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white">Rupture de stock</span></div>}
      </div>
      <div className="mt-3 space-y-1">
        <h3 className="text-sm font-medium text-ink leading-snug line-clamp-2 group-hover:text-burgundy transition-colors">{product.name}</h3>
        {shop && <button onClick={(e) => { e.stopPropagation(); navigate(`/boutique/${shop.id}`); }} className="text-xs text-ink/50 hover:text-burgundy transition-colors">{shop.name}</button>}
        <PriceDisplay price={product.price} oldPrice={product.oldPrice} size="sm" />
        {product.rating && product.reviewCount ? <Rating rating={product.rating} count={product.reviewCount} /> : null}
        {lowStock && <p className="text-[11px] font-medium text-burgundy/80">Plus que {product.stock} disponibles</p>}
      </div>
    </div>
  );
}
