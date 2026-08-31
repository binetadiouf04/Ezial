import { useState, useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import { getProduct, productsByShop, formatFCFA, discountPercent, getVariantPrice, getProductsFromSameShop, getSimilarProducts } from '@/data/products';
import { getShop } from '@/data/shops';
import { categoryMap } from '@/data/categories';
import ProductGallery from '@/components/ProductGallery';
import VariantSelector from '@/components/VariantSelector';
import PriceDisplay from '@/components/PriceDisplay';
import Rating from '@/components/Rating';
import FavoriteButton from '@/components/FavoriteButton';
import ProductCarousel from '@/components/ProductCarousel';
import { ChevronRight, Truck, Store, Plus, Minus, Check } from 'lucide-react';

const tabs = ['Description', 'Détails', 'Avis'] as const;
type Tab = (typeof tabs)[number];

export default function ProductPage({ productId }: { productId: string }) {
  const { navigate, addToCart } = useApp();
  const product = getProduct(productId);
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<Tab>('Description');
  const [added, setAdded] = useState(false);
  const [error, setError] = useState('');

  const dynamicPrice = useMemo(() => {
    if (!product) return { price: 0, oldPrice: undefined };
    return getVariantPrice(product, variants);
  }, [product, variants]);

  if (!product) return <div className="container-pro py-20 text-center text-ink/50">Produit introuvable.</div>;

  const shop = getShop(product.shopId);
  const cat = categoryMap[product.category];
  const outOfStock = product.stock === 0;
  const lowStock = product.stock > 0 && product.stock <= 3;
  const sameShopProducts = getProductsFromSameShop(product);
  const relatedIds = sameShopProducts.map((p) => p.id);
  const similarProducts = getSimilarProducts(product, relatedIds);
  const requiredVariants = product.variants.map((v) => v.name);
  const allSelected = requiredVariants.every((name) => variants[name]);

  const handleVariant = (name: string, value: string) => { setVariants((prev) => ({ ...prev, [name]: value })); setError(''); };

  const handleAdd = (buyNow = false) => {
    if (!allSelected) { setError('Veuillez sélectionner: ' + requiredVariants.filter((v) => !variants[v]).join(', ')); return; }
    addToCart({ productId: product.id, shopId: product.shopId, quantity: qty, variants, unitPrice: dynamicPrice.price });
    if (buyNow) navigate('/checkout'); else { setAdded(true); setTimeout(() => setAdded(false), 2000); }
  };

  return (
    <div className="container-pro py-6">
      <nav className="mb-6 flex flex-wrap items-center gap-1.5 text-xs text-ink/40">
        <button onClick={() => navigate('/')} className="hover:text-burgundy">Accueil</button><ChevronRight size={12} />
        {cat && <><button onClick={() => navigate(`/categorie/${cat.id}`)} className="hover:text-burgundy">{cat.label}</button><ChevronRight size={12} /></>}
        <span className="text-ink/70 line-clamp-1">{product.name}</span>
      </nav>
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
        <div className="lg:sticky lg:top-[90px] lg:self-start"><ProductGallery images={product.images} alt={product.name} /></div>
        <div className="space-y-6">
          <div>
            {shop && <button onClick={() => navigate(`/boutique/${shop.id}`)} className="text-xs font-medium uppercase tracking-wider text-burgundy hover:underline">{shop.name}</button>}
            <h1 className="mt-1.5 font-display text-2xl font-semibold leading-tight text-ink sm:text-3xl">{product.name}</h1>
            {product.rating && product.reviewCount && <div className="mt-2.5"><Rating rating={product.rating} count={product.reviewCount} size="md" /></div>}
          </div>
          <PriceDisplay price={dynamicPrice.price} oldPrice={dynamicPrice.oldPrice ?? product.oldPrice} size="lg" />
          {outOfStock ? <p className="text-sm font-medium text-ink/50">Rupture de stock</p> : lowStock ? <p className="text-sm font-medium text-burgundy">Plus que {product.stock} disponibles</p> : null}
          {product.variants.length > 0 && <div className="border-t border-line pt-5"><VariantSelector variants={product.variants} selected={variants} onChange={handleVariant} /></div>}
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-ink">Quantité</span>
              <div className="flex items-center border border-line rounded-full">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="flex h-9 w-9 items-center justify-center text-ink/60 hover:text-ink"><Minus size={15} /></button>
                <span className="w-10 text-center text-sm font-medium">{qty}</span>
                <button onClick={() => setQty((q) => q + 1)} className="flex h-9 w-9 items-center justify-center text-ink/60 hover:text-ink"><Plus size={15} /></button>
              </div>
            </div>
            {error && <p className="text-sm text-burgundy">{error}</p>}
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <button onClick={() => handleAdd(false)} disabled={outOfStock} className="btn-outline flex-1">{added ? <><Check size={17} /> Ajouté</> : 'Ajouter au panier'}</button>
              <button onClick={() => handleAdd(true)} disabled={outOfStock} className="btn-primary flex-1">Acheter maintenant</button>
            </div>
          </div>
          <div className="space-y-2.5 rounded-xl border border-line p-4">
            <div className="flex items-center gap-2.5 text-sm text-ink/75"><Truck size={17} className="text-ink/50" /><span>{product.delivery}</span></div>
            {product.pickup && <div className="flex items-center gap-2.5 text-sm text-ink/75"><Store size={17} className="text-ink/50" /><span>{product.pickup}</span></div>}
          </div>
          <div className="border-t border-line pt-5">
            <div className="flex gap-5 border-b border-line">
              {tabs.map((t) => <button key={t} onClick={() => setTab(t)} className={`whitespace-nowrap border-b-2 pb-2.5 text-sm font-medium transition-colors ${tab === t ? 'border-burgundy text-burgundy' : 'border-transparent text-ink/50 hover:text-ink'}`}>{t}{t === 'Avis' && product.reviewCount ? ` (${product.reviewCount})` : ''}</button>)}
            </div>
            <div className="py-5 text-sm text-ink/70">
              {tab === 'Description' && <p>{product.description}</p>}
              {tab === 'Détails' && <dl className="grid grid-cols-2 gap-y-3">{product.details.map((d) => <div key={d.label}><dt className="text-xs text-ink/40">{d.label}</dt><dd className="mt-0.5 font-medium text-ink">{d.value}</dd></div>)}</dl>}
              {tab === 'Avis' && <div className="space-y-5">{product.reviews.length === 0 ? <p className="text-ink/50">Aucun avis pour l'instant.</p> : product.reviews.map((rev) => (
                <div key={rev.id} className="border-b border-line pb-4 last:border-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><span className="text-sm font-medium text-ink">{rev.author}</span>{rev.verified && <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-semibold text-ink/60">Achat vérifié</span>}</div>
                    <span className="text-xs text-ink/40">{rev.date}</span>
                  </div>
                  <div className="mt-1.5"><Rating rating={rev.rating} showCount={false} /></div>
                  <p className="mt-2 text-sm text-ink/70">{rev.text}</p>
                  {rev.hasPhotos && <div className="mt-2 flex gap-2"><div className="h-16 w-16 rounded-lg bg-cream" /><div className="h-16 w-16 rounded-lg bg-cream" /></div>}
                </div>
              ))}</div>}
            </div>
          </div>
        </div>
      </div>
      {similarProducts.length > 0 && (
        <section className="mt-16">
          <div className="mb-5"><h2 className="section-title">Vous aimerez aussi</h2></div>
          <ProductCarousel products={similarProducts} />
        </section>
      )}
      {sameShopProducts.length > 0 && shop && (
        <section className="mt-16">
          <div className="mb-5 flex items-center justify-between"><h2 className="section-title">Aussi chez {shop.name}</h2><button onClick={() => navigate(`/boutique/${shop.id}`)} className="text-sm font-medium text-burgundy hover:underline">Voir la boutique</button></div>
          <ProductCarousel products={sameShopProducts} />
        </section>
      )}
    </div>
  );
}
