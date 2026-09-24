import { useState, useMemo, useEffect } from 'react';
import { useApp } from '@/store/AppContext';
import { getProduct, getVariantPrice, getProductsFromSameShop, getSimilarProducts, isRealCatalogId } from '@/data/products';
import { getShop, registerSupabaseShops } from '@/data/shops';
import { fetchProductDetailFromSupabase } from '@/lib/supabaseCatalog';
import { fetchProductReviews, checkCanReview, submitReview, deleteReview, type Review } from '@/lib/supabaseReviews';
import { categoryMap } from '@/data/categories';
import ProductGallery from '@/components/ProductGallery';
import VariantSelector from '@/components/VariantSelector';
import PriceDisplay from '@/components/PriceDisplay';
import Rating from '@/components/Rating';
import FavoriteButton from '@/components/FavoriteButton';
import ProductCarousel from '@/components/ProductCarousel';
import SmartImage from '@/components/SmartImage';
import { ChevronRight, Store, Plus, Minus, Check, Star, Camera, X, ShieldCheck, Loader2 } from 'lucide-react';

const tabs = ['Description', 'Avis'] as const;
type Tab = (typeof tabs)[number];

// "Vous aimerez aussi" preview cap on the product page itself — "Voir
// tout" (/produit/:id/similaires) shows the full, uncapped list.
const SIMILAR_PREVIEW_LIMIT = 9;

export default function ProductPage({ productId }: { productId: string }) {
  const { navigate, addToCart, catalogProducts, customerUser } = useApp();
  // The static mock catalog resolves synchronously and stays the fallback
  // for its own ids; a real Supabase product is never in it, so its id
  // falls through to the fetch below instead of an immediate "not found".
  const mockProduct = getProduct(productId);
  const [supabaseProduct, setSupabaseProduct] = useState<ReturnType<typeof getProduct>>(undefined);
  const [supabaseShop, setSupabaseShop] = useState<ReturnType<typeof getShop>>(undefined);
  const [loading, setLoading] = useState(!mockProduct);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (mockProduct) return; // resolved synchronously — nothing to fetch
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    setSupabaseProduct(undefined);
    setSupabaseShop(undefined);
    fetchProductDetailFromSupabase(productId).then(({ product, shop, error }) => {
      if (cancelled) return;
      if (error) { setLoadError(error); setLoading(false); return; }
      // Registered so getShop() (used elsewhere on this same page, and by
      // any other component reached afterward) can resolve this shop too —
      // without this, a shop only ever known via this direct product fetch
      // would stay invisible to getShop() for the rest of the session.
      if (shop) registerSupabaseShops([shop]);
      setSupabaseProduct(product ?? undefined);
      setSupabaseShop(shop ?? undefined);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [productId, mockProduct]);

  const product = mockProduct ?? supabaseProduct;
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<Tab>('Description');
  const [added, setAdded] = useState(false);
  const [error, setError] = useState('');

  // Real reviews (Supabase) — only ever fetched for a real catalog product
  // (mock demo products keep their static mock reviews, rendered further
  // below unchanged).
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewStats, setReviewStats] = useState<{ average: number; count: number }>({ average: 0, count: 0 });
  const [canReview, setCanReview] = useState(false);
  const [canReviewChecked, setCanReviewChecked] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [myComment, setMyComment] = useState('');
  const [myPhotos, setMyPhotos] = useState<File[]>([]);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewSaved, setReviewSaved] = useState(false);
  const [enlargedReviewImage, setEnlargedReviewImage] = useState<string | null>(null);

  const loadReviews = () => {
    if (!product || !isRealCatalogId(product.id)) return;
    fetchProductReviews(product.id).then(({ reviews: fetched, stats }) => {
      setReviews(fetched);
      setReviewStats(stats);
      const mine = fetched.find((r) => r.userId === customerUser?.id);
      if (mine) { setMyRating(mine.rating); setMyComment(mine.comment); }
    });
  };

  useEffect(() => {
    loadReviews();
    setCanReview(false);
    setCanReviewChecked(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, customerUser?.id]);

  // A variant dimension with only one real option (e.g. a single available
  // color) is auto-selected — the customer is never forced to click it
  // before "Ajouter au panier"/"Acheter maintenant". A dimension with 2+
  // options still requires an explicit choice.
  useEffect(() => {
    if (!product) return;
    const autoSelected: Record<string, string> = {};
    for (const v of product.variants) {
      if (v.values.length === 1) autoSelected[v.name] = v.values[0];
    }
    setVariants(autoSelected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  // Purchase eligibility needs its own (3-query) check — only worth paying
  // for once the customer actually opens the Avis tab, not on every single
  // product-page visit (see checkCanReview's comment in supabaseReviews.ts).
  const openTab = (t: Tab) => {
    setTab(t);
    if (t === 'Avis' && product && customerUser && isRealCatalogId(product.id) && !canReviewChecked) {
      setCanReviewChecked(true);
      checkCanReview(product.id, customerUser.id).then(setCanReview);
    }
  };

  const handleSubmitReview = async () => {
    if (!product || !customerUser) return;
    if (myRating < 1) { setReviewError('Choisissez une note de 1 à 5 étoiles.'); return; }
    setReviewError('');
    setReviewSubmitting(true);
    const result = await submitReview(customerUser.id, { productId: product.id, rating: myRating, comment: myComment, photos: myPhotos });
    setReviewSubmitting(false);
    if (result.error) { setReviewError(result.error); return; }
    setMyPhotos([]);
    setReviewSaved(true);
    setTimeout(() => setReviewSaved(false), 2000);
    loadReviews();
  };

  const handleDeleteReview = async (reviewId: string) => {
    await deleteReview(reviewId);
    setMyRating(0);
    setMyComment('');
    loadReviews();
  };

  const dynamicPrice = useMemo(() => {
    if (!product) return { price: 0, oldPrice: undefined };
    return getVariantPrice(product, variants);
  }, [product, variants]);

  if (loading) return <div className="container-pro py-20 text-center text-ink/50">Chargement du produit…</div>;
  if (loadError) return <div className="container-pro py-20 text-center text-ink/50">Une erreur est survenue lors du chargement du produit.</div>;
  if (!product) return <div className="container-pro py-20 text-center text-ink/50">Produit introuvable.</div>;

  const shop = mockProduct ? getShop(product.shopId) : (supabaseShop ?? getShop(product.shopId));
  const cat = categoryMap[product.category];
  const outOfStock = product.stock === 0;
  const lowStock = product.stock > 0 && product.stock <= 3;
  const sameShopProducts = getProductsFromSameShop(product, catalogProducts);
  const relatedIds = sameShopProducts.map((p) => p.id);
  const similarProducts = getSimilarProducts(product, catalogProducts, relatedIds, SIMILAR_PREVIEW_LIMIT);
  const requiredVariants = product.variants.map((v) => v.name);
  const allSelected = requiredVariants.every((name) => variants[name]);

  const handleVariant = (name: string, value: string) => { setVariants((prev) => ({ ...prev, [name]: value })); setError(''); };

  const handleAdd = (buyNow = false) => {
    if (!allSelected) { setError('Veuillez sélectionner: ' + requiredVariants.filter((v) => !variants[v]).join(', ')); return; }
    addToCart({ productId: product.id, shopId: product.shopId, quantity: qty, variants, unitPrice: dynamicPrice.price, variantId: dynamicPrice.variantId });
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
        <div className="relative mx-auto w-full max-w-[420px] lg:sticky lg:top-[90px] lg:max-w-[448px] lg:self-start">
          <ProductGallery media={product.media ?? product.images.map((url) => ({ url, type: 'image' as const }))} alt={product.name} />
          <div className="absolute right-2.5 top-2.5 z-10"><FavoriteButton productId={product.id} /></div>
        </div>
        <div className="space-y-6">
          <div>
            {shop && <button onClick={() => navigate(`/boutique/${shop.id}`)} className="text-xs font-medium uppercase tracking-wider text-burgundy hover:underline">{shop.name}</button>}
            <h1 className="mt-1.5 font-display text-2xl font-semibold leading-tight text-ink sm:text-3xl">{product.name}</h1>
            <p className="mt-1 text-xs font-mono text-ink/40">Réf. {product.reference}</p>
            {isRealCatalogId(product.id) ? (
              reviewStats.count > 0 && <div className="mt-2.5"><Rating rating={reviewStats.average} count={reviewStats.count} size="md" /></div>
            ) : (
              product.rating && product.reviewCount && <div className="mt-2.5"><Rating rating={product.rating} count={product.reviewCount} size="md" /></div>
            )}
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
          {product.pickup && (
            <div className="space-y-2.5 rounded-xl border border-line p-4">
              <div className="flex items-center gap-2.5 text-sm text-ink/75"><Store size={17} className="text-ink/50" /><span>{product.pickup}</span></div>
            </div>
          )}
          <div className="border-t border-line pt-5">
            <div className="flex gap-5 border-b border-line">
              {tabs.map((t) => {
                const count = isRealCatalogId(product.id) ? reviewStats.count : product.reviewCount;
                return <button key={t} onClick={() => openTab(t)} className={`whitespace-nowrap border-b-2 pb-2.5 text-sm font-medium transition-colors ${tab === t ? 'border-burgundy text-burgundy' : 'border-transparent text-ink/50 hover:text-ink'}`}>{t}{t === 'Avis' && count ? ` (${count})` : ''}</button>;
              })}
            </div>
            <div className="py-5 text-sm text-ink/70">
              {tab === 'Description' && (
                <div className="space-y-5">
                  <p>{product.description}</p>
                  {product.details.length > 0 && (
                    <div className="border-t border-line pt-5">
                      <h3 className="mb-3 text-sm font-semibold text-ink">Caractéristiques</h3>
                      <dl className="grid grid-cols-2 gap-y-3">{product.details.map((d) => <div key={d.label}><dt className="text-xs text-ink/40">{d.label}</dt><dd className="mt-0.5 font-medium text-ink">{d.value}</dd></div>)}</dl>
                    </div>
                  )}
                </div>
              )}
              {tab === 'Avis' && (
                isRealCatalogId(product.id) ? (
                  <div className="space-y-6">
                    {customerUser ? (
                      <div className="rounded-xl border border-line p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-ink">{myRating > 0 ? 'Modifier mon avis' : 'Donner mon avis'}</h3>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button key={n} onClick={() => setMyRating(n)} type="button">
                              <Star size={22} className={n <= myRating ? 'fill-champagne text-champagne' : 'text-line'} />
                            </button>
                          ))}
                        </div>
                        <textarea className="input-field" rows={2} placeholder="Votre avis (facultatif)" value={myComment} onChange={(e) => setMyComment(e.target.value)} />
                        <div className="flex items-center gap-2">
                          <label className="btn-outline cursor-pointer text-xs">
                            <Camera size={13} /> Ajouter des photos ({myPhotos.length}/3)
                            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => {
                              const files = Array.from(e.target.files ?? []).slice(0, 3 - myPhotos.length);
                              setMyPhotos((prev) => [...prev, ...files].slice(0, 3));
                            }} />
                          </label>
                          {myPhotos.map((f, i) => (
                            <div key={i} className="relative">
                              <SmartImage src={URL.createObjectURL(f)} alt="" className="h-10 w-10 rounded object-cover" />
                              <button onClick={() => setMyPhotos((prev) => prev.filter((_, idx) => idx !== i))} className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-ink text-white"><X size={10} /></button>
                            </div>
                          ))}
                        </div>
                        {reviewError && <p className="text-xs text-burgundy">{reviewError}</p>}
                        <div className="flex items-center gap-3">
                          <button onClick={() => void handleSubmitReview()} disabled={reviewSubmitting} className="btn-primary">
                            {reviewSubmitting ? <Loader2 size={15} className="animate-spin" /> : 'Publier'}
                          </button>
                          {reviewSaved && <span className="flex items-center gap-1 text-sm text-green-600"><Check size={14} /> Avis enregistré</span>}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-ink/50">
                        <button onClick={() => navigate('/profil')} className="font-medium text-burgundy hover:underline">Connectez-vous</button> pour laisser un avis.
                      </p>
                    )}

                    {reviews.length === 0 ? <p className="text-ink/50">Aucun avis pour l'instant.</p> : reviews.map((rev) => (
                      <div key={rev.id} className="border-b border-line pb-4 last:border-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-ink">{rev.userId ? 'Client Ezial' : 'Utilisateur introuvable'}</span>
                            {rev.userId === customerUser?.id && canReview && <span className="flex items-center gap-1 rounded-full bg-cream px-2 py-0.5 text-[10px] font-semibold text-ink/60"><ShieldCheck size={11} /> Achat vérifié</span>}
                          </div>
                          <span className="text-xs text-ink/40">{new Date(rev.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                        <div className="mt-1.5"><Rating rating={rev.rating} showCount={false} /></div>
                        {rev.comment && <p className="mt-2 text-sm text-ink/70">{rev.comment}</p>}
                        {rev.images.length > 0 && (
                          <div className="mt-2 flex gap-2">
                            {rev.images.map((img) => (
                              <button key={img.id} onClick={() => setEnlargedReviewImage(img.url)} className="block">
                                <SmartImage src={img.url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                              </button>
                            ))}
                          </div>
                        )}
                        {customerUser?.id === rev.userId && (
                          <button onClick={() => void handleDeleteReview(rev.id)} className="mt-2 text-xs font-medium text-burgundy hover:underline">Supprimer mon avis</button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-5">{product.reviews.length === 0 ? <p className="text-ink/50">Aucun avis pour l'instant.</p> : product.reviews.map((rev) => (
                    <div key={rev.id} className="border-b border-line pb-4 last:border-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><span className="text-sm font-medium text-ink">{rev.author}</span>{rev.verified && <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-semibold text-ink/60">Achat vérifié</span>}</div>
                        <span className="text-xs text-ink/40">{rev.date}</span>
                      </div>
                      <div className="mt-1.5"><Rating rating={rev.rating} showCount={false} /></div>
                      <p className="mt-2 text-sm text-ink/70">{rev.text}</p>
                      {rev.hasPhotos && <div className="mt-2 flex gap-2"><div className="h-16 w-16 rounded-lg bg-cream" /><div className="h-16 w-16 rounded-lg bg-cream" /></div>}
                    </div>
                  ))}</div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
      {similarProducts.length > 0 && (
        <section className="mt-16">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="section-title">Vous aimerez aussi</h2>
            <button onClick={() => navigate(`/produit/${product.id}/similaires`)} className="flex items-center gap-1 text-sm font-medium text-burgundy hover:underline whitespace-nowrap">Voir tout <ChevronRight size={15} /></button>
          </div>
          <ProductCarousel products={similarProducts} />
        </section>
      )}
      {sameShopProducts.length > 0 && shop && (
        <section className="mt-16">
          <div className="mb-5 flex items-center justify-between"><h2 className="section-title">Aussi chez {shop.name}</h2><button onClick={() => navigate(`/boutique/${shop.id}`)} className="text-sm font-medium text-burgundy hover:underline">Voir la boutique</button></div>
          <ProductCarousel products={sameShopProducts} />
        </section>
      )}
      {enlargedReviewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setEnlargedReviewImage(null)}>
          <button onClick={() => setEnlargedReviewImage(null)} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink" aria-label="Fermer"><X size={18} /></button>
          <img src={enlargedReviewImage} alt="Photo de l'avis agrandie" className="max-h-[85vh] max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
