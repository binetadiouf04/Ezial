import { Store } from 'lucide-react';
import { getShop } from '@/data/shops';

// Éléments communs aux pages qui suivent une commande (confirmation, détail, suivi) :
// même code, mêmes mots partout (l'adresse de livraison est sur la facture).

/** Code de livraison : la seule chose à retenir, mise en valeur. */
export function DeliveryCodeCard({ code, className = '' }: { code: string; className?: string }) {
  return (
    <section aria-label="Votre code de livraison" className={`rounded-2xl bg-burgundy px-5 py-6 text-center text-cream ${className}`}>
      <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-cream/75">Votre code de livraison</h2>
      <p className="mt-2 font-mono text-5xl font-bold tracking-[0.3em] text-white" aria-label={code.split('').join(' ')}>{code}</p>
      <p className="mx-auto mt-3 max-w-xs text-sm text-cream/85">Donnez-le au livreur seulement quand il vous remet votre colis.</p>
    </section>
  );
}

/** Retrait en boutique : où aller. */
export function PickupPlace({ shopId }: { shopId: string }) {
  const shop = getShop(shopId);
  if (!shop) return null;
  return (
    <p className="flex items-start gap-1.5 text-sm text-ink/60">
      <Store size={14} className="mt-0.5 flex-shrink-0 text-ink/40" />
      <span>{shop.name}{shop.address ? ` · ${shop.address}` : ''}</span>
    </p>
  );
}
