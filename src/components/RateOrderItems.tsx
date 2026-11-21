import { useEffect, useMemo, useRef, useState } from 'react';
import { Star, Check } from 'lucide-react';
import { useApp, type Order } from '@/store/AppContext';
import { fetchMyRatings, rateProduct } from '@/lib/supabaseReviews';
import { productPath } from '@/lib/productUrl';
import SmartImage from '@/components/SmartImage';

// « Notez vos articles » : sur une commande reçue, une ligne par produit avec 5 étoiles.
// Toucher une étoile enregistre la note (avis réservé par la base aux clients ayant reçu
// le produit) ; le commentaire et les photos restent facultatifs, sur la fiche produit.
// Ouvert depuis la relance (?avis=1) : le bloc est amené à l'écran.
export default function RateOrderItems({ order, customerId }: { order: Order; customerId: string }) {
  const { catalogProducts, navigate } = useApp();
  const items = useMemo(() => {
    const seen = new Set<string>();
    return order.items.filter((i) => i.productId && !seen.has(i.productId) && seen.add(i.productId)).map((i) => {
      const p = catalogProducts.find((cp) => cp.id === i.productId);
      return {
        productId: i.productId,
        name: p?.name ?? i.productName ?? 'Article',
        image: p?.thumbnailUrl || p?.images[0] || '',
        path: p ? productPath(p) : null,
      };
    });
  }, [order.items, catalogProducts]);

  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  const [saving, setSaving] = useState<string | null>(null);
  const [savedNow, setSavedNow] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let alive = true;
    void fetchMyRatings(customerId, items.map((i) => i.productId)).then((r) => { if (alive) setRatings(r); });
    return () => { alive = false; };
  }, [customerId, items]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('avis') !== '1') return;
    const t = window.setTimeout(() => sectionRef.current?.scrollIntoView({ block: 'center' }), 400);
    return () => window.clearTimeout(t);
  }, []);

  const rate = async (productId: string, value: number) => {
    setSaving(productId);
    setError('');
    const previous = ratings.get(productId);
    setRatings((m) => new Map(m).set(productId, value));
    const res = await rateProduct(customerId, productId, value);
    setSaving(null);
    if (res.error) {
      setError(res.error);
      setRatings((m) => { const n = new Map(m); if (previous) n.set(productId, previous); else n.delete(productId); return n; });
      return;
    }
    setSavedNow((s) => new Set(s).add(productId));
  };

  if (items.length === 0) return null;
  const allRated = items.every((i) => ratings.has(i.productId));

  return (
    <section ref={sectionRef} className="card p-5" aria-labelledby="notez-articles">
      <h2 id="notez-articles" className="font-display text-xl font-semibold text-ink">{allRated ? 'Merci pour votre avis' : 'Notez vos articles'}</h2>
      {!allRated && <p className="mt-0.5 text-sm text-ink/60">Touchez une étoile : c’est enregistré.</p>}
      <ul className="mt-4 space-y-4">
        {items.map((item) => {
          const current = ratings.get(item.productId) ?? 0;
          return (
            <li key={item.productId} className="flex items-center gap-3">
              {item.image
                ? <SmartImage src={item.image} alt="" className="h-14 w-12 flex-shrink-0 rounded-md bg-cream object-cover" />
                : <div aria-hidden="true" className="h-14 w-12 flex-shrink-0 rounded-md bg-cream" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{item.name}</p>
                <div className="mt-1 flex items-center gap-0.5" role="radiogroup" aria-label={`Note pour ${item.name}`}>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={current === v}
                      aria-label={`${v} étoile${v > 1 ? 's' : ''} sur 5`}
                      disabled={saving === item.productId}
                      onClick={() => void rate(item.productId, v)}
                      className="-m-0.5 p-1 disabled:opacity-60"
                    >
                      <Star size={24} strokeWidth={1.5} className={v <= current ? 'fill-burgundy-ruby text-burgundy-ruby' : 'text-ink/25'} />
                    </button>
                  ))}
                  {savedNow.has(item.productId) && <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-green-700"><Check size={13} /> Enregistré</span>}
                </div>
                {current > 0 && item.path && (
                  <button type="button" onClick={() => navigate(`${item.path}?avis=1`)} className="mt-1 text-xs font-medium text-burgundy hover:underline">
                    Ajouter un commentaire ou une photo
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
