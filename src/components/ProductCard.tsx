import { useApp } from '@/store/AppContext';
import type { Product } from '@/data/products';
import PriceDisplay from './PriceDisplay';
import Rating from './Rating';
import FavoriteButton from './FavoriteButton';
import { getShop } from '@/data/shops';
import SmartImage from './SmartImage';

export default function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const { navigate } = useApp();
  const shop = getShop(product.shopId);
  const outOfStock = product.stock === 0;
  const lowStock = product.stock > 0 && product.stock <= 3;

  return (
    // A real href (not just an onClick) so Google's own rendering pass can
    // discover and follow this link to the product's static SEO page
    // (scripts/prerender-seo.mjs) — preventDefault keeps the click itself
    // on the existing in-app (hash) navigation, unchanged for visitors.
    <a href={`/produit/${product.id}/`} onClick={(e) => { e.preventDefault(); navigate(`/produit/${product.id}`); }} className="group block cursor-pointer">
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-cream">
        {/* The dedicated small crop when one exists (every photo uploaded
           since the thumbnail feature shipped) — never the full-size
           gallery image just to shrink it down in a small card. Falls back
           to the full-size image for any product whose primary photo
           predates this feature. */}
        <SmartImage
          src={product.thumbnailUrl || product.images[0]}
          alt={product.name}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          className={`h-full w-full object-cover transition-transform duration-700 group-hover:scale-105 ${outOfStock ? 'opacity-60 grayscale' : ''}`}
        />
        <div className="absolute right-2.5 top-2.5"><FavoriteButton productId={product.id} /></div>
        {product.isNew && !product.isPromo && <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink">Nouveau</span>}
        {outOfStock && <div className="absolute inset-0 flex items-center justify-center"><span className="rounded-full bg-ink/80 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white">Rupture de stock</span></div>}
      </div>
      <div className="mt-3 space-y-1">
        <h3 className="text-sm font-medium text-ink leading-snug line-clamp-2 group-hover:text-burgundy transition-colors">{product.name}</h3>
        {/* preventDefault too, not just stopPropagation — now that the card
           itself is a real <a>, stopPropagation alone would stop the outer
           handler from running but NOT the browser's own default action of
           following that outer <a>'s href (defaultPrevented is only ever
           set by a handler that actually runs). */}
        {shop && <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/boutique/${shop.id}`); }} className="text-xs text-ink/50 hover:text-burgundy transition-colors">{shop.name}</button>}
        <PriceDisplay price={product.price} oldPrice={product.oldPrice} size="sm" />
        {product.rating && product.reviewCount ? <Rating rating={product.rating} count={product.reviewCount} /> : null}
        {lowStock && <p className="text-[11px] font-medium text-burgundy/80">Plus que {product.stock} disponibles</p>}
      </div>
    </a>
  );
}
