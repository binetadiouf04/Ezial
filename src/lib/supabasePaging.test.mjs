import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllRows, chunk } from './supabasePaging.ts';

// Simule un serveur qui plafonne chaque réponse à `cap` lignes, comme Supabase (1 000).
const serverWith = (total, cap) => {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls = [];
  return { calls, read: async (from, to) => { calls.push([from, to]); return { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null }; } };
};

test('un petit catalogue se lit en une seule requête', async () => {
  const s = serverWith(43, 1000);
  const { data, error } = await fetchAllRows(s.read);
  assert.equal(error, null); assert.equal(data.length, 43); assert.equal(s.calls.length, 1);
});

test('plus de 1 000 produits : aucune ligne perdue, aucun doublon', async () => {
  const s = serverWith(2350, 1000);
  const { data } = await fetchAllRows(s.read);
  assert.equal(data.length, 2350);
  assert.equal(new Set(data.map((r) => r.id)).size, 2350);
  assert.equal(s.calls.length, 5);
});

test('un nombre exact de pages pleines : une page vide termine la lecture', async () => {
  const s = serverWith(1000, 1000);
  const { data } = await fetchAllRows(s.read);
  assert.equal(data.length, 1000);
});

test('une erreur est remontée avec ce qui a déjà été lu', async () => {
  let n = 0;
  const { data, error } = await fetchAllRows(async () => (n++ === 0 ? { data: Array.from({ length: 500 }, (_, i) => ({ i })), error: null } : { data: null, error: { message: 'boom' } }));
  assert.equal(error.message, 'boom'); assert.equal(data.length, 500);
});

test('chunk découpe en lots', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 3), []);
});
