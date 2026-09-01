import { useApp } from '@/store/AppContext';
import { getProduct, formatFCFA } from '@/data/products';
import { getShop } from '@/data/shops';
import { Plus, Minus, Trash2, ShoppingBag, ChevronRight, ArrowLeftRight, Bookmark } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

export default function CartPage() {
  const { cart, removeFromCart, updateQuantity, cartSubtotal, navigate, saveForLater, savedItems, moveToCart, removeFromSaved } = useApp();

  if (cart.length === 0 && savedItems.length === 0) {
    return (
      <div className="container-pro py-12">
        <h1 className="section-title mb-8">Mon panier</h1>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <ShoppingBag size={42} className="text-ink/20" />
          <p className="mt-4 text-sm text-ink/60">Votre panier est vide</p>
          <button onClick={() => navigate('/')} className="btn-primary mt-6">Découvrir les produits</button>
        </div>
      </div>
    );
  }

  const groups: Record<string, { item: typeof cart[0]; index: number }[]> = {};
  cart.forEach((item, idx) => { (groups[item.shopId] ??= []).push({ item, index: idx }); });

  return (
    <div className="container-pro py-8">
      <h1 className="section-title mb-8">Mon panier</h1>

      {cart.length === 0 ? (
        <div className="card p-8 text-center mb-6">
          <p className="text-sm text-ink/60">Votre panier est vide, mais vous avez des articles sauvegardés ci-dessous.</p>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            {Object.entries(groups).map(([shopId, entries]) => {
              const shop = getShop(shopId);
              return (
                <div key={shopId} className="card p-5">
                  {shop && (
                    <button onClick={() => navigate(`/boutique/${shop.id}`)} className="mb-4 block text-[11px] font-semibold uppercase tracking-wider text-ink/50 hover:text-burgundy">
                      {shop.name}
                    </button>
                  )}
                  <div className="space-y-4">
                    {entries.map(({ item, index }) => {
                      const product = getProduct(item.productId);
                      if (!product) return null;
                      return (
                        <div key={index} className="flex gap-4">
                          <SmartImage src={product.images[0]} alt="" className="h-24 w-20 flex-shrink-0 rounded-lg object-cover" />
                          <div className="flex-1 min-w-0">
                            <button onClick={() => navigate(`/produit/${product.id}`)} className="text-sm font-medium text-ink leading-snug line-clamp-2 hover:text-burgundy">{product.name}</button>
                            {Object.entries(item.variants).map(([k, v]) => <p key={k} className="text-xs text-ink/45 mt-0.5">{k}: {v}</p>)}
                            <div className="mt-3 flex items-center justify-between">
                              <div className="flex items-center border border-line rounded-full">
                                <button onClick={() => updateQuantity(index, item.quantity - 1)} className="flex h-8 w-8 items-center justify-center text-ink/60 hover:text-ink"><Minus size={14} /></button>
                                <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                                <button onClick={() => updateQuantity(index, item.quantity + 1)} className="flex h-8 w-8 items-center justify-center text-ink/60 hover:text-ink"><Plus size={14} /></button>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold text-ink">{formatFCFA((item.unitPrice ?? product.price) * item.quantity)}</span>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center gap-4">
                              <button onClick={() => saveForLater(index)} className="flex items-center gap-1 text-xs font-medium text-ink/50 hover:text-burgundy transition-colors">
                                <Bookmark size={13} /> Sauvegarder
                              </button>
                              <button onClick={() => removeFromCart(index)} className="flex items-center gap-1 text-xs font-medium text-ink/50 hover:text-burgundy transition-colors">
                                <Trash2 size={13} /> Retirer
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="lg:sticky lg:top-[90px] lg:self-start">
            <div className="card p-5 space-y-3">
              <h2 className="font-display text-lg font-semibold">Récapitulatif</h2>
              <div className="flex justify-between text-sm"><span className="text-ink/60">Sous-total produits</span><span className="font-medium text-ink">{formatFCFA(cartSubtotal)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-ink/60">Livraison</span><span className="text-ink/50">Calculée à l'étape suivante</span></div>
              <p className="text-xs text-ink/40 leading-relaxed">Les frais de livraison seront calculés à l'étape suivante.</p>
              <div className="border-t border-line pt-3 flex justify-between"><span className="font-medium text-ink">Total estimé</span><span className="font-semibold text-ink">{formatFCFA(cartSubtotal)}</span></div>
              <button onClick={() => navigate('/checkout')} className="btn-primary w-full">Passer la commande <ChevronRight size={16} /></button>
              <button onClick={() => navigate('/')} className="btn-ghost w-full">Continuer mes achats</button>
            </div>
          </div>
        </div>
      )}

      {/* Saved items section */}
      {savedItems.length > 0 && (
        <div className="mt-10">
          <h2 className="font-display text-lg font-semibold mb-4 flex items-center gap-2"><Bookmark size={18} className="text-ink/40" /> Sauvegardés pour plus tard</h2>
          <div className="space-y-3">
            {savedItems.map((saved, idx) => {
              const product = getProduct(saved.productId);
              if (!product) return null;
              const shop = getShop(saved.shopId);
              return (
                <div key={idx} className="card p-4 flex items-center gap-4">
                  <SmartImage src={product.images[0]} alt="" className="h-16 w-14 flex-shrink-0 rounded-lg object-cover" />
                  <div className="flex-1 min-w-0">
                    <button onClick={() => navigate(`/produit/${product.id}`)} className="text-sm font-medium text-ink line-clamp-1 hover:text-burgundy">{product.name}</button>
                    {shop && <p className="text-xs text-ink/50">{shop.name}</p>}
                    {Object.entries(saved.variants).map(([k, v]) => <p key={k} className="text-xs text-ink/40">{k}: {v}</p>)}
                    <p className="text-sm font-semibold text-ink mt-1">{formatFCFA((saved.unitPrice ?? product.price) * saved.quantity)}</p>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button onClick={() => moveToCart(idx)} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink hover:border-ink/30 transition-colors">
                      <ArrowLeftRight size={13} /> Remettre au panier
                    </button>
                    <button onClick={() => removeFromSaved(idx)} className="flex items-center gap-1 text-xs text-ink/40 hover:text-burgundy transition-colors">
                      <Trash2 size={13} /> Retirer
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
