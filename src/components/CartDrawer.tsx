import { X, ShoppingBag, Plus, Minus, Trash2 } from 'lucide-react';
import { useApp, type CartItem } from '@/store/AppContext';
import { getProduct, formatFCFA } from '@/data/products';
import { getShop } from '@/data/shops';
import SmartImage from './SmartImage';

interface CartRow extends CartItem { index: number; }

export default function CartDrawer() {
  const { cartOpen, setCartOpen, cart, removeFromCart, updateQuantity, cartSubtotal, navigate } = useApp();
  if (!cartOpen) return null;

  const groups: Record<string, CartRow[]> = {};
  cart.forEach((item, idx) => { (groups[item.shopId] ??= []).push({ ...item, index: idx }); });

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/30 fade-in" onClick={() => setCartOpen(false)} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col slide-up">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2"><ShoppingBag size={20} className="text-ink" /><h3 className="font-display text-base font-semibold">Mon panier</h3></div>
          <button onClick={() => setCartOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-cream"><X size={20} /></button>
        </div>
        {cart.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <ShoppingBag size={36} className="text-ink/20" /><p className="text-sm text-ink/60">Votre panier est vide.</p>
            <button onClick={() => { setCartOpen(false); navigate('/'); }} className="btn-outline mt-2">Découvrir les produits</button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {Object.entries(groups).map(([shopId, items]) => {
                const shop = getShop(shopId);
                return (
                  <div key={shopId}>
                    {shop && <button onClick={() => { setCartOpen(false); navigate(`/boutique/${shop.id}`); }} className="mb-3 block text-[11px] font-semibold uppercase tracking-wider text-ink/50 hover:text-burgundy">{shop.name}</button>}
                    <div className="space-y-3">
                      {items.map((item) => { const product = getProduct(item.productId); if (!product) return null; return (
                        <div key={item.index} className="flex gap-3">
                          <SmartImage src={product.images[0]} alt="" className="h-20 w-16 flex-shrink-0 rounded-lg object-cover" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink leading-snug line-clamp-2">{product.name}</p>
                            {Object.entries(item.variants).map(([k, v]) => <p key={k} className="text-xs text-ink/45 mt-0.5">{k}: {v}</p>)}
                            <div className="mt-2 flex items-center justify-between">
                              <div className="flex items-center border border-line rounded-full">
                                <button onClick={() => updateQuantity(item.index, item.quantity - 1)} className="flex h-7 w-7 items-center justify-center text-ink/60 hover:text-ink"><Minus size={13} /></button>
                                <span className="w-7 text-center text-xs font-medium">{item.quantity}</span>
                                <button onClick={() => updateQuantity(item.index, item.quantity + 1)} className="flex h-7 w-7 items-center justify-center text-ink/60 hover:text-ink"><Plus size={13} /></button>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold text-ink">{formatFCFA((item.unitPrice ?? product.price) * item.quantity)}</span>
                                <button onClick={() => removeFromCart(item.index)} className="text-ink/30 hover:text-burgundy"><Trash2 size={16} /></button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ); })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-line px-5 py-4 space-y-3">
              <div className="flex items-center justify-between"><span className="text-sm text-ink/60">Sous-total</span><span className="text-base font-semibold text-ink">{formatFCFA(cartSubtotal)}</span></div>
              <p className="text-xs text-ink/45">Livraison calculée au checkout.</p>
              <button onClick={() => { setCartOpen(false); navigate('/panier'); }} className="btn-outline w-full">Voir le panier</button>
              <button onClick={() => { setCartOpen(false); navigate('/checkout'); }} className="btn-primary w-full">Passer au paiement</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
