import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeDeliveryPlaces, splitDeliveryNotes, placeTitle } from './recentDeliveryPlaces.ts';

test('notes de livraison : point de repère et instructions séparés', () => {
  assert.deepEqual(splitDeliveryNotes('Point de repère : près de la pharmacie. Appelez-moi'), { landmark: 'près de la pharmacie', instructions: 'Appelez-moi' });
  assert.deepEqual(splitDeliveryNotes('Point de repère : portail noir'), { landmark: 'portail noir', instructions: '' });
  assert.deepEqual(splitDeliveryNotes('Appelez-moi en arrivant'), { landmark: '', instructions: 'Appelez-moi en arrivant' });
  assert.deepEqual(splitDeliveryNotes(null), { landmark: '', instructions: '' });
});

test('adresses récentes : plus récente d\'abord, doublons (< 30 m) fusionnés, positions invalides ignorées, 3 au plus', () => {
  const row = (lat, lng, extra = {}) => ({ delivery_latitude: lat, delivery_longitude: lng, delivery_address: null, delivery_notes: null, neighborhood: 'Plateau', ...extra });
  const places = dedupeDeliveryPlaces([
    row('14.6937', '-17.4441', { delivery_address: 'Rue 10, Plateau' }),
    row(14.69372, -17.44412),                // même endroit (quelques mètres)
    row(null, -17.4),                          // sans position
    row(14.72, -17.47, { delivery_notes: 'Point de repère : Station Shell' }),
    row(999, 0),                               // position invalide
    row(14.75, -17.39),
    row(14.78, -17.30),
  ]);
  assert.equal(places.length, 3);
  assert.deepEqual([places[0].lat, places[0].lng], [14.6937, -17.4441]);
  assert.equal(places[0].label, 'Rue 10, Plateau');
  assert.equal(places[1].landmark, 'Station Shell');
  assert.equal(placeTitle(places[0]), 'Rue 10, Plateau');
  assert.equal(placeTitle(places[1]), 'Plateau · Station Shell');
  assert.equal(placeTitle({ lat: 1, lng: 1, label: null, quartier: null, landmark: '', instructions: '' }), 'Position enregistrée');
});
