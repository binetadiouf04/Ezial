import type { Order } from '@/store/AppContext';
import { formatInvoiceMoney } from '@/lib/invoice';
import { useBuildInvoice } from '@/lib/useBuildInvoice';
import InvoiceButton from '@/components/InvoiceButton';

// Facture de la commande, affichée dans l'appli (page de confirmation, détail
// d'une commande) : carte crème, écriture noire, accents rouge rubis. Mêmes lignes, mêmes montants et
// même numéro que le PDF (voir src/lib/invoice.ts) : rien n'est recalculé ni
// inventé ici. Le PDF se télécharge depuis le bouton en bas de la carte.
export default function InvoiceCard({ order, className = '' }: { order: Order; className?: string }) {
  const invoice = useBuildInvoice()(order);
  const date = new Date(invoice.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const hasSeveralShops = invoice.groups.length > 1;

  return (
    <section aria-label={`Facture ${invoice.number}`} className={`rounded-2xl border border-beige bg-cream p-5 text-ink shadow-sm sm:p-6 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-burgundy-ruby">Votre facture</h2>
        <p className="text-right text-xs text-ink/60">{invoice.number} · {date}</p>
      </div>

      <div className="mt-5 space-y-5">
        {invoice.groups.map((group, groupIndex) => (
          <div key={`${group.shopName}-${groupIndex}`}>
            {(hasSeveralShops || group.pickup) && (
              <p className="mb-3 text-[11px] uppercase tracking-[0.16em] text-ink/55">
                Vendu par {group.shopName}{group.pickup ? ' · retrait en boutique' : ''}
              </p>
            )}
            <ul className="space-y-4">
              {group.lines.map((line, lineIndex) => (
                <li key={`${line.label}-${lineIndex}`} className="flex gap-3.5">
                  {line.imageUrl ? (
                    <img src={line.imageUrl} alt="" loading="lazy" decoding="async" className="h-[70px] w-14 flex-shrink-0 rounded-md bg-beige/50 object-cover" />
                  ) : (
                    <div aria-hidden="true" className="h-[70px] w-14 flex-shrink-0 rounded-md bg-beige/50" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 text-[15px] font-semibold leading-snug">{line.label}</p>
                      <p className="flex-shrink-0 text-xs text-ink/60">×{line.quantity}</p>
                    </div>
                    <div className="mt-1 flex items-start justify-between gap-3">
                      <p className="min-w-0 text-sm leading-snug text-ink/60">{line.options}</p>
                      <p className="flex-shrink-0 text-sm font-medium">{formatInvoiceMoney(line.total)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <dl className="mt-5 space-y-2 border-t border-beige pt-4 text-sm">
        <div className="flex justify-between"><dt className="text-ink/70">Sous-total</dt><dd>{formatInvoiceMoney(invoice.subtotal)}</dd></div>
        {invoice.discount > 0 && <div className="flex justify-between"><dt className="text-ink/70">Remise</dt><dd>- {formatInvoiceMoney(invoice.discount)}</dd></div>}
        <div className="flex justify-between"><dt className="text-ink/70">Livraison</dt><dd>{invoice.delivery > 0 ? formatInvoiceMoney(invoice.delivery) : 'Gratuite'}</dd></div>
        <div className="flex items-baseline justify-between border-t border-beige pt-3">
          <dt className="text-base font-semibold">Total</dt>
          <dd className="font-display text-2xl font-semibold text-burgundy-ruby">{formatInvoiceMoney(invoice.total)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-ink/60">
        <p>Facturé à {invoice.buyer.name} · {invoice.paymentLabel}</p>
        {invoice.vatNote && <p>{invoice.vatNote}</p>}
      </div>

      <div className="mt-5">
        <InvoiceButton
          order={order}
          className="w-full rounded-xl border border-burgundy-ruby/40 px-4 py-3 text-sm font-medium text-burgundy-ruby transition-colors hover:bg-burgundy-ruby/5 disabled:opacity-60"
          errorClassName="text-burgundy-ruby"
        />
      </div>
    </section>
  );
}
