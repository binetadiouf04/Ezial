import { useState } from 'react';
import { AlertCircle, FileText, Loader2 } from 'lucide-react';
import type { Order } from '@/store/AppContext';
import { useBuildInvoice } from '@/lib/useBuildInvoice';

// « Télécharger la facture » : PDF construit sur l'appareil à partir de la
// commande affichée (voir src/lib/invoice.ts). Le générateur de PDF n'est
// chargé qu'au clic.
export default function InvoiceButton({ order, className = 'btn-outline w-full', errorClassName = 'text-burgundy' }: { order: Order; className?: string; errorClassName?: string }) {
  const buildOrderInvoice = useBuildInvoice();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    setError('');
    setBusy(true);
    try {
      const invoice = buildOrderInvoice(order);
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
      {error && <p className={`mt-2 flex items-start gap-1.5 text-xs ${errorClassName}`}><AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> {error}</p>}
    </div>
  );
}
