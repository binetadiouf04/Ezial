// Tests des livraisons de l'espace administrateur (code pur).
import test from 'node:test';
import assert from 'node:assert/strict';
import { phaseOf, buildAdminDeliveries, countByFilter, filterDeliveries } from './adminDeliveriesCore.ts';

test('étape d’une mission d’après son statut réel', () => {
  assert.equal(phaseOf('available', false), 'available');
  assert.equal(phaseOf('available', true), 'collecting');
  assert.equal(phaseOf('accepted', true), 'collecting');
  assert.equal(phaseOf('picking_up', true), 'collecting');
  assert.equal(phaseOf('out_for_delivery', true), 'delivering');
  assert.equal(phaseOf('delivered', true), 'delivered');
  assert.equal(phaseOf('cancelled', false), 'cancelled');
  // Un statut inconnu n'est jamais présenté comme livré.
  assert.notEqual(phaseOf('quelque_chose', true), 'delivered');
  assert.notEqual(phaseOf('', false), 'delivered');
});

const missions = [
  { id: 'm1', order_id: 'o1', driver_id: 'd1', status: 'delivered', proof_photo_path: 'd1/delivery-proofs/m1-x.webp', accepted_at: '2026-11-14T01:50:00Z', delivered_at: '2026-11-14T02:19:00Z', created_at: '2026-11-14T01:45:00Z' },
  { id: 'm2', order_id: 'o2', driver_id: null, status: 'available', proof_photo_path: null, accepted_at: null, delivered_at: null, created_at: '2026-11-15T10:00:00Z' },
  { id: 'm3', order_id: 'o3', driver_id: 'd1', status: 'out_for_delivery', proof_photo_path: null, accepted_at: '2026-11-15T11:00:00Z', delivered_at: null, created_at: '2026-11-15T10:30:00Z' },
];
const stops = [
  { id: 's2', mission_id: 'm1', shop_id: 'sh2', stop_order: 2, status: 'picked_up', picked_up_at: '2026-11-14T02:05:00Z' },
  { id: 's1', mission_id: 'm1', shop_id: 'sh1', stop_order: 1, status: 'picked_up', picked_up_at: '2026-11-14T02:00:00Z' },
  { id: 's3', mission_id: 'm3', shop_id: 'sh1', stop_order: 1, status: 'pending', picked_up_at: null },
];
const orders = [
  { id: 'o1', order_number: 'EZI-1', first_name: 'Awa', last_name: 'Diop', phone: '+221770000000', neighborhood: 'Plateau', delivery_address: 'Rue 1', preferred_delivery_slot: null },
  { id: 'o3', order_number: 'EZI-3', first_name: null, last_name: null, phone: null, neighborhood: null, delivery_address: null, preferred_delivery_slot: '12h–15h' },
];
const shops = [{ id: 'sh1', name: 'Boutique Un', address_text: 'Almadies', neighborhood: null }, { id: 'sh2', name: 'Boutique Deux', address_text: null, neighborhood: 'Parcelles' }];
const drivers = [{ id: 'd1', first_name: 'Moussa', last_name: 'Fall', username: 'moussa01' }];

test('assemblage : plus récent d’abord, arrêts dans l’ordre, aucune donnée inventée', () => {
  const list = buildAdminDeliveries(missions, stops, orders, shops, drivers);
  assert.deepEqual(list.map((d) => d.id), ['m3', 'm2', 'm1']);
  const m1 = list.find((d) => d.id === 'm1');
  assert.equal(m1.orderNumber, 'EZI-1');
  assert.equal(m1.driverName, 'Moussa Fall');
  assert.deepEqual(m1.stops.map((s) => s.shopName), ['Boutique Un', 'Boutique Deux']);
  assert.equal(m1.stops[1].address, 'Parcelles');
  assert.ok(m1.stops.every((s) => s.collected));
  assert.equal(m1.proofPath, 'd1/delivery-proofs/m1-x.webp');
  assert.equal(m1.customerName, 'Awa Diop');
  // Mission sans commande lisible : champs vides, jamais de valeur supposée.
  const m2 = list.find((d) => d.id === 'm2');
  assert.equal(m2.orderNumber, '');
  assert.equal(m2.driverName, '');
  assert.equal(m2.customerName, '');
  assert.equal(m2.proofPath, null);
  const m3 = list.find((d) => d.id === 'm3');
  assert.equal(m3.customerName, '');
  assert.equal(m3.slot, '12h–15h');
  assert.equal(m3.stops[0].collected, false);
});

test('compteurs et filtres', () => {
  const list = buildAdminDeliveries(missions, stops, orders, shops, drivers);
  assert.deepEqual(countByFilter(list), { all: 3, available: 1, collecting: 0, delivering: 1, delivered: 1 });
  assert.equal(filterDeliveries(list, 'delivered').length, 1);
  assert.equal(filterDeliveries(list, 'all').length, 3);
  assert.equal(filterDeliveries(list, 'collecting').length, 0);
});
