import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import { formatFCFA } from '@/data/products';
import { fetchActivePromotions } from '@/lib/supabasePromotions';
import { freeDeliveryConditions, freeDeliveryFor, type PromotableProduct, type PublicPromotion } from '@/lib/promotionEligibility';

// « Livraison offerte » sur une fiche produit : seulement si une campagne AUTOMATIQUE
// en cours vise réellement ce produit (jamais un code, jamais une supposition). Les
// conditions éventuelles sont affichées ; le montant réel est calculé au checkout.
export default function FreeDeliveryNote({ product }: { product: PromotableProduct }) {
  const [promos, setPromos] = useState<PublicPromotion[]>([]);
  useEffect(() => {
    let alive = true;
    void fetchActivePromotions().then((list) => { if (alive) setPromos(list); });
    return () => { alive = false; };
  }, []);
  const promo = freeDeliveryFor(product, promos);
  if (!promo) return null;
  const conditions = freeDeliveryConditions(promo, formatFCFA);
  return (
    <p className="flex items-start gap-2 text-sm text-green-800">
      <Gift size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
      <span><span className="font-semibold">Livraison offerte</span>{conditions ? ` ${conditions}` : ''}.</span>
    </p>
  );
}
