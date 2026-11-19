import type { Order } from '@/store/AppContext';

// Facture simple d'une commande : construite à partir de la commande déjà
// affichée au client (montants fixés par le serveur à la création de la
// commande : produits, remise, livraison, total). Aucune donnée n'est inventée :
// l'émetteur vient de src/shared/siteInfo.js (informations fournies par la
// société) et un champ absent n'est pas imprimé. Le numéro de facture est le
// numéro de commande (une facture par commande).

export interface InvoiceLine {
  label: string;
  options: string;
  quantity: string;
  unitPrice: number;
  total: number;
}

export interface InvoiceGroup {
  shopName: string;
  pickup: boolean;
  lines: InvoiceLine[];
}

export interface InvoiceParty {
  name: string;
  details: string[];
}

export interface Invoice {
  number: string;
  date: string;
  issuer: InvoiceParty;
  buyer: InvoiceParty;
  groups: InvoiceGroup[];
  subtotal: number;
  discount: number;
  delivery: number;
  total: number;
  paymentLabel: string;
}

export interface InvoiceCompany {
  name: string;
  legalForm?: string;
  rccm?: string;
  ninea?: string;
  address?: string;
  email?: string;
  phone?: string;
}

/** Ce que la page sait résoudre (catalogue, boutiques, libellés) : injecté pour garder ce module pur. */
export interface InvoiceHelpers {
  shopName: (shopId: string) => string;
  productName: (item: Order['items'][number]) => string;
  quantityText: (item: Order['items'][number]) => string;
  optionsText: (item: Order['items'][number]) => string;
  paymentLabel: (payment: string) => string;
}

/** 25 000 FCFA, avec une espace ordinaire (les espaces insécables ne s'impriment pas dans un PDF standard). */
export function formatInvoiceMoney(amount: number): string {
  const rounded = Math.round(Number.isFinite(amount) ? amount : 0);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}${String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`;
}

export function invoiceFileName(number: string): string {
  return `Facture-${number.replace(/[^A-Za-z0-9_-]+/g, '-')}.pdf`;
}

export function buildInvoice(order: Order, helpers: InvoiceHelpers, company: InvoiceCompany): Invoice {
  const byShop = new Map<string, InvoiceGroup>();
  for (const item of order.items) {
    const group = byShop.get(item.shopId) ?? {
      shopName: helpers.shopName(item.shopId),
      pickup: order.shopFulfillments.find((f) => f.shopId === item.shopId)?.type === 'pickup',
      lines: [],
    };
    const unitPrice = item.unitPrice ?? 0;
    group.lines.push({
      label: helpers.productName(item),
      options: helpers.optionsText(item),
      quantity: helpers.quantityText(item),
      unitPrice,
      total: Math.round(unitPrice * item.quantity),
    });
    byShop.set(item.shopId, group);
  }

  const issuerDetails: string[] = [];
  if (company.legalForm) issuerDetails.push(company.legalForm);
  if (company.address) issuerDetails.push(company.address);
  if (company.rccm) issuerDetails.push(`RCCM : ${company.rccm}`);
  if (company.ninea) issuerDetails.push(`NINEA : ${company.ninea}`);
  const contact = [company.email, company.phone].filter(Boolean).join(' · ');
  if (contact) issuerDetails.push(contact);

  const buyerName = `${order.customer.firstName} ${order.customer.lastName}`.trim();
  const buyerDetails: string[] = [];
  if (order.customer.phone) buyerDetails.push(`Tél. : ${order.customer.phone}`);
  if (order.customer.quartier) buyerDetails.push(`Quartier : ${order.customer.quartier}`);

  return {
    number: order.id,
    date: order.date,
    issuer: { name: company.name, details: issuerDetails },
    buyer: { name: buyerName || 'Client Ezial', details: buyerDetails },
    groups: [...byShop.values()],
    subtotal: order.subtotal,
    discount: order.discount,
    delivery: order.delivery,
    total: order.total,
    paymentLabel: helpers.paymentLabel(order.payment),
  };
}
