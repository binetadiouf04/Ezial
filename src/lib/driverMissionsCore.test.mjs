// Tests des missions Ezial Livreur (code pur) : le téléphone du client
// n'apparaît jamais tant que la mission n'est pas attribuée.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDriverMission, buildAvailableMissionFromRpc, ANONYMOUS_CUSTOMER_NAME } from './driverMissionsCore.ts';

const destination = {
  order_number: 'EZ-1',
  neighborhood: 'Mermoz',
  delivery_address: 'Villa 12',
  delivery_latitude: '14.7',
  delivery_longitude: '-17.47',
  preferred_delivery_slot: '10h-12h',
  preferred_delivery_date: '2026-11-26',
};
const customer = { first_name: 'Awa', last_name: 'Test', phone: '+221771111111' };
const stop = {
  stop_id: 's1', shop_id: 'b1', stop_order: 1, status: 'pending', picked_up_at: null,
  shop_name: 'Boutique Test', shop_neighborhood: 'Plateau', shop_address: 'Rue 1', shop_latitude: 14.67, shop_longitude: -17.43,
};

test('mission disponible : adresse visible, téléphone et nom jamais repris', () => {
  const m = buildDriverMission({
    row: { id: 'm1', order_id: 'o1', driver_id: null, status: 'available', created_at: '2026-11-25T08:00:00Z' },
    destination,
    customer, // même si la donnée arrivait par erreur
    stops: [stop],
    urgent: true,
  });
  assert.equal(m.customerPhone, '');
  assert.equal(m.customerName, ANONYMOUS_CUSTOMER_NAME);
  assert.equal(m.destination, 'Mermoz');
  assert.equal(m.destinationAddress, 'Villa 12');
  assert.equal(m.destinationLatitude, 14.7);
  assert.equal(m.destinationLongitude, -17.47);
  assert.equal(m.urgent, true);
  assert.equal(m.collections[0].shopName, 'Boutique Test');
  assert.doesNotMatch(JSON.stringify(m), /\+2217|Awa/);
});

test('mission attribuée : téléphone et nom visibles pour livrer', () => {
  const m = buildDriverMission({
    row: { id: 'm2', order_id: 'o2', driver_id: 'd1', status: 'out_for_delivery', created_at: '2026-11-25T08:00:00Z' },
    destination,
    customer,
    stops: [{ ...stop, status: 'picked_up', picked_up_at: '2026-11-25T09:00:00Z' }],
    urgent: false,
  });
  assert.equal(m.customerPhone, '+221771111111');
  assert.equal(m.customerName, 'Awa Test');
  assert.equal(m.step, 'to_customer');
  assert.equal(m.collections[0].collected, true);
});

test('ligne de driver_available_missions() : jamais de coordonnées du client', () => {
  const m = buildAvailableMissionFromRpc({
    mission_id: 'm1', order_id: 'o1', created_at: '2026-11-25T08:00:00Z', is_urgent: null,
    ...destination,
    // Champs qui ne devraient jamais être là : ignorés quand même.
    phone: '+221771111111', first_name: 'Awa', gift_recipient_phone: '+221772222222',
    stops: [stop],
  });
  assert.equal(m.customerPhone, '');
  assert.equal(m.customerName, ANONYMOUS_CUSTOMER_NAME);
  assert.equal(m.driverId, undefined);
  assert.equal(m.urgent, false);
  assert.equal(m.orderId, 'EZ-1');
  assert.equal(m.step, 'to_collection');
  assert.doesNotMatch(JSON.stringify(m), /\+2217|Awa/);
});

test('arrêts triés dans l’ordre de collecte, liste vide tolérée', () => {
  const m = buildAvailableMissionFromRpc({
    mission_id: 'm1', order_id: 'o1', created_at: '2026-11-25T08:00:00Z', is_urgent: false, ...destination,
    stops: [{ ...stop, stop_id: 's2', stop_order: 2 }, stop],
  });
  assert.deepEqual(m.collections.map((c) => c.stopId), ['s1', 's2']);
  const vide = buildAvailableMissionFromRpc({ mission_id: 'm3', order_id: 'o3', created_at: 'x', is_urgent: false, ...destination, stops: null });
  assert.deepEqual(vide.collections, []);
  assert.equal(vide.step, 'to_collection');
});
