import { useApp, type Order } from '@/store/AppContext';
import { COMPANY, CONTACT } from '@/shared/siteInfo';
import { getShop } from '@/data/shops';
import { paymentLabels } from '@/data/payments';
import { fabricSaleModeUnit, formatFabricQuantity } from '@/data/categories';
import { optionsLine } from '@/lib/waistMeasure';
import { buildInvoice, type Invoice } from '@/lib/invoice';

// Construit la facture d'une commande avec ce que la page connaît déjà
// (catalogue, boutiques, libellés). Partagé par la carte de facture affichée
// dans l'appli et par le bouton « Télécharger la facture » (PDF) : les deux
// montrent exactement les mêmes lignes et les mêmes montants.
export function useBuildInvoice(): (order: Order) => Invoice {
  const { catalogProducts } = useApp();
  return (order) => {
    const productOf = (item: Order['items'][number]) => catalogProducts.find((p) => p.id === item.productId);
    return buildInvoice(order, {
      shopName: (shopId) => getShop(shopId)?.name ?? 'Boutique Ezial',
      productName: (item) => productOf(item)?.name ?? item.productName ?? 'Produit',
      quantityText: (item) => {
        const p = productOf(item);
        return p?.saleMode ? `${formatFabricQuantity(item.quantity)} ${fabricSaleModeUnit[p.saleMode]}` : String(item.quantity);
      },
      optionsText: (item) => optionsLine(item.variants, item.waistCm) ?? '',
      imageUrl: (item) => productOf(item)?.thumbnailUrl || productOf(item)?.images[0],
      paymentLabel: (payment) => paymentLabels[payment] ?? payment,
    }, { name: COMPANY.name, vatNote: COMPANY.vatNote, legalForm: COMPANY.legalForm, rccm: COMPANY.rccm, ninea: COMPANY.ninea, address: COMPANY.address, email: CONTACT.email, phone: CONTACT.phone });
  };
}
