import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUrgentDeliveryOptions, isUrgentChoiceOffered, firstUrgentChoice, urgentFeeOfRow, isUrgentRow } from './urgentDelivery.ts';

const raw = {
  enabled: true, fee: 500, minLeadMinutes: 60,
  days: [
    { date: '2026-11-25', slots: [{ label: '18h–20h', start: '18:00', end: '20:00', cutoff: '17:00' }] },
    { date: '2026-11-26', slots: [{ label: '09h–12h', start: '09:00', end: '12:00', cutoff: '08:00' }, { label: '18h–20h', start: '18:00', end: '20:00', cutoff: '17:00' }] },
  ],
};

test('options : réponse du serveur reprise telle quelle', () => {
  const o = parseUrgentDeliveryOptions(raw);
  assert.equal(o.fee, 500);
  assert.equal(o.minLeadMinutes, 60);
  assert.deepEqual(o.days.map((d) => [d.date, d.slots.map((s) => s.label)]), [['2026-11-25', ['18h–20h']], ['2026-11-26', ['09h–12h', '18h–20h']]]);
});

test('options masquées : migration absente, désactivée, sans créneau ou montant illisible', () => {
  assert.equal(parseUrgentDeliveryOptions(null), null);
  assert.equal(parseUrgentDeliveryOptions({ enabled: false, fee: 500, days: raw.days }), null);
  assert.equal(parseUrgentDeliveryOptions({ enabled: true, fee: 500, days: [] }), null);
  assert.equal(parseUrgentDeliveryOptions({ enabled: true, fee: 500, days: [{ date: '2026-11-25', slots: [] }] }), null);
  assert.equal(parseUrgentDeliveryOptions({ enabled: true, days: raw.days }), null);
  assert.equal(parseUrgentDeliveryOptions({ enabled: true, fee: 0, days: raw.days }), null);
  assert.equal(parseUrgentDeliveryOptions({ enabled: true, fee: 500, days: [{ date: 'demain', slots: raw.days[0].slots }] }), null);
});

test('choix proposés et premier choix', () => {
  const o = parseUrgentDeliveryOptions(raw);
  assert.equal(isUrgentChoiceOffered(o, '2026-11-26', '09h–12h'), true);
  assert.equal(isUrgentChoiceOffered(o, '2026-11-25', '09h–12h'), false);
  assert.equal(isUrgentChoiceOffered(null, '2026-11-25', '18h–20h'), false);
  assert.equal(isUrgentChoiceOffered(o, undefined, '18h–20h'), false);
  assert.deepEqual(firstUrgentChoice(o), { date: '2026-11-25', window: '18h–20h' });
  assert.equal(firstUrgentChoice(null), null);
});

test('ligne de commande : supplément seulement si is_urgent est vrai', () => {
  assert.equal(urgentFeeOfRow({ is_urgent: true, urgent_fee: 500 }), 500);
  assert.equal(urgentFeeOfRow({ is_urgent: false, urgent_fee: 500 }), 0);
  assert.equal(urgentFeeOfRow({ total_amount: 1000 }), 0); // colonnes absentes (migration non exécutée)
  assert.equal(urgentFeeOfRow(null), 0);
  assert.equal(isUrgentRow({ is_urgent: true }), true);
  assert.equal(isUrgentRow({}), false);
});
