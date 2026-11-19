import { useState } from 'react';
import { AlertCircle, FileText, Loader2 } from 'lucide-react';
import { useApp, type Order } from '@/store/AppContext';
import { COMPANY, CONTACT } from '@/shared/siteInfo';
import { getShop } from '@/data/shops';
import { paymentLabels } from '@/data/payments';
import { fabricSaleModeUnit, formatFabricQuantity } from '@/data/categories';
import { optionsLine } from '@/lib/waistMeasure';
import { buildInvoice } from '@/lib/invoice';

// « Télécharger la facture » : PDF construit sur l'appareil à partir de la
// commande affichée (voir src/lib/invoice.ts). Le générateur de PDF n'est
// chargé qu'au clic.
export default function InvoiceButton({ order, className = 'btn-outline w-full' }: { order: Order; className?: string }) {
  const { catalogProducts } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    setError('');
    setBusy(true);
    try {
      const productOf = (item: Order['items'][number]) => catalogProducts.find((p) => p.id === item.productId);
      const invoice = buildInvoice(order, {
        shopName: (shopId) => getShop(shopId)?.name ?? 'Boutique Ezial',
        productName: (item) => productOf(item)?.name ?? item.productName ?? 'Produit',
        quantityText: (item) => {
          const p = productOf(item);
          return p?.saleMode ? `${formatFabricQuantity(item.quantity)} ${fabricSaleModeUnit[p.saleMode]}` : String(item.quantity);
        },
        optionsText: (item) => optionsLine(item.variants, item.waistCm) ?? '',
        paymentLabel: (payment) => paymentLabels[payment] ?? payment,
      }, { name: COMPANY.name, legalForm: COMPANY.legalForm, rccm: COMPANY.rccm, ninea: COMPANY.ninea, address: COMPANY.address, email: CONTACT.email, phone: CONTACT.phone });
      const { deliverInvoice } = await import('@/lib/invoicePdf');
      await deliverInvoice(invoice);
    } catch {
      setError('La facture n’a pas pu être créée. Réessayez dans un instant.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button type="button" onClick={() => void download()} disabled={busy} className={`${className} flex items-center justify-center gap-2`}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />} Télécharger la facture
      </button>
      {error && <p className="mt-2 flex items-start gap-1.5 text-xs text-burgundy"><AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> {error}</p>}
    </div>
  );
}
