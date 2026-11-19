import { formatInvoiceMoney, invoiceFileName, type Invoice } from './invoice';

// Génération du PDF dans le navigateur de la personne (jsPDF, chargé
// uniquement au clic : il n'alourdit aucune page). Rien n'est envoyé à un
// serveur : la facture est construite à partir de la commande déjà chargée.

const BURGUNDY: [number, number, number] = [90, 13, 30];
const INK: [number, number, number] = [30, 27, 28];
const GREY: [number, number, number] = [110, 104, 106];
const LINE: [number, number, number] = [216, 198, 194];

const PAGE_W = 210;
const MARGIN = 16;
const RIGHT = PAGE_W - MARGIN;
const BOTTOM = 276;

export async function createInvoicePdf(invoice: Invoice): Promise<{ blob: Blob; fileName: string }> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 0;

  const text = (value: string, x: number, yy: number, opts: { size?: number; bold?: boolean; color?: [number, number, number]; align?: 'left' | 'right' } = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size ?? 10);
    doc.setTextColor(...(opts.color ?? INK));
    doc.text(value, x, yy, { align: opts.align ?? 'left' });
  };
  const rule = (yy: number) => { doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(MARGIN, yy, RIGHT, yy); };
  const ensureSpace = (needed: number) => { if (y + needed > BOTTOM) { doc.addPage(); y = MARGIN + 4; } };

  // Bandeau
  doc.setFillColor(...BURGUNDY);
  doc.rect(0, 0, PAGE_W, 30, 'F');
  text('EZIAL', MARGIN, 19, { size: 22, bold: true, color: [248, 243, 238] });
  text('FACTURE', RIGHT, 14, { size: 16, bold: true, color: [248, 243, 238], align: 'right' });
  text(`n° ${invoice.number}`, RIGHT, 21, { size: 10, color: [216, 198, 194], align: 'right' });
  const dateText = new Date(invoice.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  text(dateText, RIGHT, 26, { size: 9, color: [216, 198, 194], align: 'right' });

  // Émetteur / client
  y = 42;
  text('ÉMETTEUR', MARGIN, y, { size: 8, bold: true, color: GREY });
  text('CLIENT', 112, y, { size: 8, bold: true, color: GREY });
  y += 5;
  text(invoice.issuer.name, MARGIN, y, { size: 11, bold: true });
  text(invoice.buyer.name, 112, y, { size: 11, bold: true });
  let yi = y + 5;
  for (const line of invoice.issuer.details) {
    const wrapped = doc.splitTextToSize(line, 88) as string[];
    for (const part of wrapped) { text(part, MARGIN, yi, { size: 9, color: GREY }); yi += 4.2; }
  }
  let yb = y + 5;
  for (const line of invoice.buyer.details) {
    const wrapped = doc.splitTextToSize(line, 82) as string[];
    for (const part of wrapped) { text(part, 112, yb, { size: 9, color: GREY }); yb += 4.2; }
  }
  y = Math.max(yi, yb) + 4;

  // En-tête du tableau
  const COL_QTY = 128;
  const COL_UNIT = 160;
  const header = () => {
    doc.setFillColor(248, 243, 238);
    doc.rect(MARGIN, y - 4.5, RIGHT - MARGIN, 7.5, 'F');
    text('Article', MARGIN + 2, y, { size: 8.5, bold: true, color: BURGUNDY });
    text('Qté', COL_QTY, y, { size: 8.5, bold: true, color: BURGUNDY, align: 'right' });
    text('Prix unitaire', COL_UNIT, y, { size: 8.5, bold: true, color: BURGUNDY, align: 'right' });
    text('Total', RIGHT - 2, y, { size: 8.5, bold: true, color: BURGUNDY, align: 'right' });
    y += 6;
  };
  header();

  for (const group of invoice.groups) {
    ensureSpace(16);
    text(`Vendu par ${group.shopName}${group.pickup ? ' (retrait en boutique)' : ''}`, MARGIN + 2, y + 1, { size: 9, bold: true, color: GREY });
    y += 6;
    for (const line of group.lines) {
      const labelLines = doc.splitTextToSize(line.label, 92) as string[];
      const optionLines = line.options ? (doc.splitTextToSize(line.options, 92) as string[]) : [];
      const height = labelLines.length * 4.6 + optionLines.length * 4 + 3;
      ensureSpace(height + 2);
      let ly = y;
      for (const part of labelLines) { text(part, MARGIN + 2, ly, { size: 10 }); ly += 4.6; }
      for (const part of optionLines) { text(part, MARGIN + 2, ly - 0.4, { size: 8.5, color: GREY }); ly += 4; }
      text(line.quantity, COL_QTY, y, { size: 10, align: 'right' });
      text(formatInvoiceMoney(line.unitPrice), COL_UNIT, y, { size: 10, align: 'right' });
      text(formatInvoiceMoney(line.total), RIGHT - 2, y, { size: 10, bold: true, align: 'right' });
      y += height;
      rule(y - 5.4);
    }
  }

  // Totaux
  ensureSpace(40);
  y += 3;
  const totalRow = (label: string, value: string, bold = false) => {
    text(label, 128, y, { size: bold ? 11 : 10, bold, color: bold ? BURGUNDY : INK });
    text(value, RIGHT - 2, y, { size: bold ? 11 : 10, bold, color: bold ? BURGUNDY : INK, align: 'right' });
    y += bold ? 7 : 5.5;
  };
  totalRow('Produits', formatInvoiceMoney(invoice.subtotal));
  if (invoice.discount > 0) totalRow('Remise', `- ${formatInvoiceMoney(invoice.discount)}`);
  totalRow('Livraison', invoice.delivery > 0 ? formatInvoiceMoney(invoice.delivery) : 'Gratuite');
  doc.setDrawColor(...BURGUNDY); doc.setLineWidth(0.4); doc.line(128, y - 3, RIGHT, y - 3);
  y += 1.5;
  totalRow('Total à payer', formatInvoiceMoney(invoice.total), true);
  y += 2;
  text(`Mode de paiement : ${invoice.paymentLabel}`, MARGIN, y, { size: 9, color: GREY });

  // Pied de page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    rule(284);
    text('Merci pour votre commande — Ezial, la marketplace sénégalaise · ezial.net', PAGE_W / 2, 289, { size: 8.5, color: GREY, align: 'center' });
    if (pages > 1) text(`${i} / ${pages}`, RIGHT, 289, { size: 8.5, color: GREY, align: 'right' });
  }

  return { blob: doc.output('blob'), fileName: invoiceFileName(invoice.number) };
}

/**
 * Sur téléphone et tablette : la feuille de partage du système (« Enregistrer
 * dans Fichiers », WhatsApp, Mail…), seul moyen fiable d'obtenir un fichier sur
 * iOS. Ailleurs : téléchargement direct.
 */
export async function deliverInvoice(invoice: Invoice): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const { blob, fileName } = await createInvoicePdf(invoice);
  const file = new File([blob], fileName, { type: 'application/pdf' });
  const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  if (touch && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Facture ${invoice.number}` });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Partage impossible : on retombe sur le téléchargement.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
