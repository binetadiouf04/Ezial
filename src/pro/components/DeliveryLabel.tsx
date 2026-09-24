import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Printer } from 'lucide-react';
import type { Mission } from '../data';

// A shipping label, not an invoice — no price, no commission, no payment
// info, ever. 100x150mm (4x6"), the standard portable thermal label size.
// The QR is generated on the fly from the order reference (no image ever
// stored in Supabase Storage) and points at a URL that only resolves to
// something useful for an authenticated, authorized driver — scanning it
// as anyone else (or being logged out) shows nothing private.
export default function DeliveryLabel({
  mission,
  shopName,
  parcelIndex,
  parcelCount,
  onClose,
}: {
  mission: Mission;
  shopName: string;
  parcelIndex: number;
  parcelCount: number;
  onClose: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    const target = `${window.location.origin}${import.meta.env.BASE_URL}#/pro?driver_order=${encodeURIComponent(mission.orderId)}`;
    QRCode.toDataURL(target, { margin: 1, width: 240 }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => { cancelled = true; };
  }, [mission.orderId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 print:bg-transparent print:p-0" onClick={onClose}>
      <div className="w-full max-w-sm print:max-w-none" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between print:hidden">
          <h2 className="text-sm font-semibold text-ink">Étiquette de livraison</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-ink/50 hover:bg-ink/5" aria-label="Fermer"><X size={18} /></button>
        </div>

        {/* The label itself — sized in mm so print output matches a 4x6
           thermal label exactly, not just an approximation on screen. */}
        <div id="delivery-label-print-area" className="mx-auto flex flex-col justify-between border-2 border-ink bg-white p-4 text-ink print:border-0" style={{ width: '100mm', height: '150mm', maxWidth: '100%', aspectRatio: '100 / 150' }}>
          <div>
            <p className="text-center font-display text-xl font-bold tracking-wide">EZIAL</p>
            <div className="mt-3 border-t border-dashed border-ink/30 pt-2">
              <p className="text-[11px] uppercase tracking-wider text-ink/50">Commande</p>
              <p className="font-mono text-lg font-bold">{mission.orderId}</p>
            </div>
            <div className="mt-2">
              <p className="text-[11px] uppercase tracking-wider text-ink/50">Client</p>
              <p className="text-sm font-semibold">{mission.customerName}</p>
            </div>
            <div className="mt-2">
              <p className="text-[11px] uppercase tracking-wider text-ink/50">Téléphone</p>
              <p className="text-sm font-medium">{mission.customerPhone}</p>
            </div>
            <div className="mt-2">
              <p className="text-[11px] uppercase tracking-wider text-ink/50">Adresse</p>
              <p className="text-sm">{mission.destinationAddress ?? mission.destination}</p>
            </div>
            <div className="mt-2">
              <p className="text-[11px] uppercase tracking-wider text-ink/50">Boutique</p>
              <p className="text-sm">{shopName}</p>
            </div>
          </div>

          <div className="flex items-end justify-between border-t border-dashed border-ink/30 pt-2">
            <p className="text-sm font-semibold">Colis {parcelIndex}/{parcelCount}</p>
            {qrDataUrl && <img src={qrDataUrl} alt="QR code de la commande" className="h-20 w-20" />}
          </div>
        </div>

        <button onClick={() => window.print()} className="btn-primary mt-4 w-full flex items-center justify-center gap-2 print:hidden">
          <Printer size={16} /> Imprimer l'étiquette
        </button>
      </div>
    </div>
  );
}
