import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoice, formatInvoiceMoney, invoiceFileName } from './invoice.ts';

const order = {
  id: 'EZI-261119-000044', date: '2026-11-18T20:55:00Z',
  customer: { firstName: 'Awa', lastName: 'Diop', phone: '+221771234567', quartier: 'Plateau' },
  items: [
    { productId: 'p1', shopId: 's1', quantity: 2, variants: { Couleur: 'Rouge' }, unitPrice: 5400 },
    { productId: 'p2', shopId: 's2', quantity: 1.5, variants: {}, unitPrice: 3000 },
    { productId: 'p3', shopId: 's1', quantity: 1, variants: {}, unitPrice: 10800 },
  ],
  subtotal: 26100, discount: 1100, delivery: 1500, total: 26500,
  shopFulfillments: [{ shopId: 's1', type: 'delivery' }, { shopId: 's2', type: 'pickup' }],
  payment: 'wave', status: 'confirmed',
};
const helpers = {
  shopName: (id) => (id === 's1' ? 'Ezial Boutique' : 'Maison Dakar'),
  productName: (i) => `Produit ${i.productId}`,
  quantityText: (i) => String(i.quantity),
  optionsText: (i) => Object.entries(i.variants).map(([k, v]) => `${k} : ${v}`).join(' · '),
  paymentLabel: () => 'Wave',
};
const company = { name: 'Ezial', legalForm: 'Entreprise individuelle', rccm: 'SN.DKR.2026.A.40238', ninea: '013246576', address: 'Dakar, Sénégal', email: 'contact@ezial.net', phone: '+221 71 105 52 52' };

test('les articles sont regroupés par boutique, avec les totaux de la commande', () => {
  const inv = buildInvoice(order, helpers, company);
  assert.equal(inv.number, 'EZI-261119-000044');
  assert.deepEqual(inv.groups.map((g) => [g.shopName, g.lines.length, g.pickup]), [['Ezial Boutique', 2, false], ['Maison Dakar', 1, true]]);
  assert.equal(inv.groups[1].lines[0].total, 4500); // 1,5 × 3 000
  assert.deepEqual([inv.subtotal, inv.discount, inv.delivery, inv.total], [26100, 1100, 1500, 26500]);
  assert.equal(inv.subtotal - inv.discount + inv.delivery, inv.total);
});

test('plusieurs boutiques : « Vendu par A + B », une seule fois chacune', () => {
  const inv = buildInvoice(order, helpers, company);
  assert.equal(inv.soldBy, 'Ezial Boutique + Maison Dakar');
  const single = buildInvoice({ ...order, items: [order.items[0], order.items[2]], shopFulfillments: [order.shopFulfillments[0]] }, helpers, company);
  assert.equal(single.soldBy, 'Ezial Boutique');
});

test('émetteur, TVA et client : seules les informations connues sont imprimées', () => {
  const inv = buildInvoice(order, helpers, { ...company, vatNote: 'TVA non applicable' });
  assert.equal(inv.vatNote, 'TVA non applicable');
  assert.deepEqual(inv.issuerFooter, [
    'Entreprise individuelle · RCCM SN.DKR.2026.A.40238 · NINEA 013246576',
    'Dakar, Sénégal · contact@ezial.net · +221 71 105 52 52',
  ]);
  assert.deepEqual(inv.buyer.details, ['Tél. : +221771234567', 'Quartier : Plateau']);
  const bare = buildInvoice({ ...order, customer: { firstName: '', lastName: '', phone: '', quartier: '' } }, helpers, { name: 'Ezial' });
  assert.equal(bare.buyer.name, 'Client Ezial'); assert.deepEqual(bare.buyer.details, []); assert.deepEqual(bare.issuerFooter, []); assert.equal(bare.vatNote, '');
});

test('la miniature du produit est transmise à la ligne', () => {
  const inv = buildInvoice(order, { ...helpers, imageUrl: (i) => `https://img/${i.productId}.jpg` }, company);
  assert.equal(inv.groups[0].lines[0].imageUrl, 'https://img/p1.jpg');
});

test('montants : espace ordinaire comme séparateur, jamais d\'espace insécable', () => {
  assert.equal(formatInvoiceMoney(1234567), '1 234 567 FCFA');
  assert.equal(formatInvoiceMoney(0), '0 FCFA');
  assert.equal(formatInvoiceMoney(10799.6), '10 800 FCFA');
  assert.ok(!/[  ]/.test(formatInvoiceMoney(25000)));
});

test('nom de fichier sûr', () => {
  assert.equal(invoiceFileName('EZI-261119-000044'), 'Facture-EZI-261119-000044.pdf');
  assert.equal(invoiceFileName('a/b c'), 'Facture-a-b-c.pdf');
});
