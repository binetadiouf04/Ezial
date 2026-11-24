import { useApp } from '@/store/AppContext';
import { shopPath } from '@/lib/shopUrl';
import type { Product } from '@/data/products';
import PriceDisplay from './PriceDisplay';
import Rating from './Rating';
import FavoriteButton from './FavoriteButton';
import { getShop } from '@/data/shops';
import SmartImage from './SmartImage';
import { productPath, productPublicPath } from '@/lib/productUrl';
import { discountPercent } from '@/data/products';
import { stockBadge } from '@/lib/stockBadge';

export default function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const { navigate } = useApp();
  const shop = getShop(product.shopId);
  // Badge posé sur la photo : « Sold out » (stock nul) ou « Plus que X ! »
  // (1 à 3 unités, toutes variantes confondues) — voir src/lib/stockBadge.ts.
  // Un produit épuisé garde sa photo intacte : ni gris, ni transparence.
  const badge = stockBadge(product);
  const outOfStock = badge?.kind === 'out';
  // Promo réelle (ancien prix supérieur au prix) : pourcentage bien visible sur la photo.
  const disc = discountPercent(product.price, product.oldPrice);

  return (
    // A real href (not just an onClick) so Google's own rendering pass can
    // discover and follow this link to the product's static SEO page
    // (scripts/prerender-seo.mjs) — preventDefault keeps the click itself
    // on the existing in-app (hash) navigation, unchanged for visitors.
    <a href={productPublicPath(product)} onClick={(e) => { e.preventDefault(); navigate(productPath(product)); }} className="group block cursor-pointer">
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
          // contain, not cover: a cropped top/bottom used to cut off a tall
          // perfume bottle or a full-length outfit photo whenever its real
          // proportions didn't match this card's 4:5 box. The product stays
          // fully visible; bg-cream on the wrapper is the neutral fill for
          // whatever space that leaves around it.
          className="h-full w-full object-contain transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute right-2.5 top-2.5"><FavoriteButton productId={product.id} /></div>
        {disc && !outOfStock && (
          <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-full bg-burgundy-ruby px-2.5 py-1 text-xs font-bold leading-none text-white shadow-sm">-{disc} %</span>
        )}
        {product.isNew && !product.isPromo && !disc && <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink">Nouveau</span>}
        {/* Discret, en bas à gauche : ne masque pas le produit. */}
        {badge && (
          <span className={`pointer-events-none absolute bottom-2 left-2 rounded-full px-2.5 py-1 text-[10px] font-semibold leading-none shadow-sm ${badge.kind === 'out' ? 'bg-ink text-white' : 'bg-burgundy text-white'}`}>
            {badge.label}
          </span>
        )}
      </div>
      <div className="mt-2.5 space-y-1">
        <h3 className="text-sm font-medium text-ink leading-snug line-clamp-2 group-hover:text-burgundy transition-colors">{product.name}</h3>
        {/* preventDefault too, not just stopPropagation — now that the card
           itself is a real <a>, stopPropagation alone would stop the outer
           handler from running but NOT the browser's own default action of
           following that outer <a>'s href (defaultPrevented is only ever
           set by a handler that actually runs). */}
        {shop && <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(shopPath(shop)); }} className="text-xs text-ink/50 hover:text-burgundy transition-colors">{shop.name}</button>}
        <PriceDisplay price={product.price} oldPrice={product.oldPrice} size="card" />
        {product.rating && product.reviewCount ? <Rating rating={product.rating} count={product.reviewCount} /> : null}
      </div>
    </a>
  );
}
