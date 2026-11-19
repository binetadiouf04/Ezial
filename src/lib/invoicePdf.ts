import { formatInvoiceMoney, invoiceFileName, type Invoice } from './invoice';

// Génération du PDF dans le navigateur de la personne (jsPDF, chargé
// uniquement au clic : il n'alourdit aucune page). Rien n'est envoyé à un
// serveur : la facture est construite à partir de la commande déjà chargée.
//
// Style minimaliste : fond blanc, mot-symbole EZIAL en bordeaux, libellés gris
// discrets, deux filets fins, miniatures des produits, total en gras à la fin.
// Aucun aplat de couleur.

type Rgb = [number, number, number];
const BURGUNDY: Rgb = [90, 13, 30];
const INK: Rgb = [28, 25, 26];
const GREY: Rgb = [120, 113, 115];
const HAIR: Rgb = [226, 218, 214];

const PAGE_W = 210;
const MARGIN = 18;
const RIGHT = PAGE_W - MARGIN;
const BOTTOM = 266;
const IMAGE_W = 11;
const IMAGE_H = 13.75; // miniature 4:5
const MAX_IMAGES = 30;

/** Miniature -> JPEG (jsPDF ne lit pas le WebP). Toute erreur : pas d'image, jamais de facture bloquée. */
async function loadJpeg(url: string): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6000);
    const response = await fetch(url, { signal: controller.signal });
    window.clearTimeout(timer);
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement('canvas');
    canvas.width = 156;
    canvas.height = 195;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Recadrage « cover » 4:5
    const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    bitmap.close?.();
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  } catch {
    return null;
  }
}

export async function createInvoicePdf(invoice: Invoice): Promise<{ blob: Blob; fileName: string }> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // Miniatures chargées en parallèle, avant de dessiner.
  const urls = invoice.groups.flatMap((g) => g.lines.map((l) => l.imageUrl));
  const images = new Map<string, string>();
  await Promise.all([...new Set(urls.filter((u): u is string => Boolean(u)))].slice(0, MAX_IMAGES).map(async (url) => {
    const jpeg = await loadJpeg(url);
    if (jpeg) images.set(url, jpeg);
  }));

  let y = 0;
  const text = (value: string, x: number, yy: number, o: { size?: number; bold?: boolean; serif?: boolean; color?: Rgb; align?: 'left' | 'right' | 'center'; space?: number } = {}) => {
    doc.setFont(o.serif ? 'times' : 'helvetica', o.bold ? 'bold' : 'normal');
    doc.setFontSize(o.size ?? 9.5);
    doc.setTextColor(...(o.color ?? INK));
    const space = o.space ?? 0;
    const align = o.align ?? 'left';
    doc.setCharSpace(space);
    if (space > 0 && align !== 'left') {
      // jsPDF ne compte pas l'espacement des lettres dans l'alignement : on le fait ici.
      const width = doc.getTextWidth(value) + space * (value.length - 1);
      doc.text(value, align === 'right' ? x - width : x - width / 2, yy);
    } else {
      doc.text(value, x, yy, { align });
    }
    doc.setCharSpace(0);
  };
  const hair = (yy: number, from = MARGIN, to = RIGHT, color: Rgb = HAIR) => { doc.setDrawColor(...color); doc.setLineWidth(0.2); doc.line(from, yy, to, yy); };
  const wrap = (value: string, width: number, size: number, bold = false): string[] => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    return doc.splitTextToSize(value, width) as string[];
  };

  // ── En-tête : le mot-symbole, puis le numéro et la date ─────────────────
  text('EZIAL', MARGIN, 26, { size: 20, bold: true, serif: true, color: BURGUNDY, space: 2.4 });
  text('Facture', RIGHT, 19, { size: 9, color: GREY, align: 'right' });
  text(invoice.number, RIGHT, 24.5, { size: 10, bold: true, align: 'right' });
  text(new Date(invoice.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }), RIGHT, 29.5, { size: 9, color: GREY, align: 'right' });

  // ── Facturé à / Paiement ──────────────────────────────────────────────
  y = 48;
  const COL2 = 120;
  text('Facturé à', MARGIN, y, { size: 8, color: GREY });
  text('Paiement', COL2, y, { size: 8, color: GREY });
  y += 5;
  let yb = y;
  text(invoice.buyer.name, MARGIN, yb, { size: 10 }); yb += 4.6;
  for (const line of invoice.buyer.details) { text(line, MARGIN, yb, { size: 8.5, color: GREY }); yb += 4.1; }
  text(invoice.paymentLabel, COL2, y, { size: 10 });
  y = yb + 9;

  // ── Articles ──────────────────────────────────────────────────────────
  const COL_QTY = 134;
  const COL_UNIT = 162;
  const tableHeader = () => {
    text('Article', MARGIN, y, { size: 8, color: GREY });
    text('Qté', COL_QTY, y, { size: 8, color: GREY, align: 'right' });
    text('Prix', COL_UNIT, y, { size: 8, color: GREY, align: 'right' });
    text('Total', RIGHT, y, { size: 8, color: GREY, align: 'right' });
    y += 2.5;
    hair(y);
    y += 5;
  };
  const newPage = () => { doc.addPage(); y = 22; tableHeader(); };
  tableHeader();

  const groupHeader = (group: Invoice['groups'][number], continued: boolean) => {
    text(`Vendu par ${group.shopName}${group.pickup ? ' · retrait en boutique' : ''}${continued ? ' (suite)' : ''}`, MARGIN, y, { size: 8, color: GREY });
    y += 5;
  };
  invoice.groups.forEach((group, index) => {
    if (y + 20 > BOTTOM) newPage();
    if (index > 0) y += 3;
    groupHeader(group, false);
    for (const line of group.lines) {
      const hasImage = Boolean(line.imageUrl && images.has(line.imageUrl));
      const textX = hasImage ? MARGIN + IMAGE_W + 4 : MARGIN;
      const nameLines = wrap(line.label, COL_QTY - textX - 16, 9.5);
      const optionLines = line.options ? wrap(line.options, COL_QTY - textX - 16, 8) : [];
      const textH = nameLines.length * 4.5 + optionLines.length * 3.9;
      const rowH = Math.max(hasImage ? IMAGE_H : 0, textH) + 5;
      if (y + rowH > BOTTOM) { newPage(); groupHeader(group, true); }
      if (hasImage) doc.addImage(images.get(line.imageUrl as string) as string, 'JPEG', MARGIN, y, IMAGE_W, IMAGE_H);
      let ty = y + 3.6;
      for (const part of nameLines) { text(part, textX, ty, { size: 9.5 }); ty += 4.5; }
      for (const part of optionLines) { text(part, textX, ty - 0.3, { size: 8, color: GREY }); ty += 3.9; }
      text(line.quantity, COL_QTY, y + 3.6, { size: 9.5, color: GREY, align: 'right' });
      text(formatInvoiceMoney(line.unitPrice), COL_UNIT, y + 3.6, { size: 9.5, color: GREY, align: 'right' });
      text(formatInvoiceMoney(line.total), RIGHT, y + 3.6, { size: 9.5, align: 'right' });
      y += rowH;
    }
  });

  // ── Totaux : le total en dernier ──────────────────────────────────────
  if (y + 40 > BOTTOM) newPage();
  hair(y - 1);
  y += 6;
  const LBL = 128;
  const row = (name: string, value: string) => {
    text(name, LBL, y, { size: 9, color: GREY });
    text(value, RIGHT, y, { size: 9, color: GREY, align: 'right' });
    y += 5.5;
  };
  row('Produits', formatInvoiceMoney(invoice.subtotal));
  if (invoice.discount > 0) row('Remise', `- ${formatInvoiceMoney(invoice.discount)}`);
  row('Livraison', invoice.delivery > 0 ? formatInvoiceMoney(invoice.delivery) : 'Gratuite');
  y += 1;
  hair(y - 2, LBL, RIGHT, INK);
  y += 5;
  text('Total', LBL, y, { size: 11, bold: true });
  text(formatInvoiceMoney(invoice.total), RIGHT, y, { size: 12, bold: true, color: BURGUNDY, align: 'right' });
  y += 6;
  if (invoice.vatNote) text(invoice.vatNote, RIGHT, y, { size: 7.5, color: GREY, align: 'right' });

  // ── Pied de page : identité légale, sur chaque page ───────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    let fy = 283;
    for (const line of invoice.issuerFooter) { text(line, PAGE_W / 2, fy, { size: 7, color: GREY, align: 'center' }); fy += 3.6; }
    text('ezial.net', PAGE_W / 2, fy + 0.5, { size: 7, color: BURGUNDY, align: 'center' });
    if (pages > 1) text(`${i} / ${pages}`, RIGHT, 283, { size: 7, color: GREY, align: 'right' });
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
