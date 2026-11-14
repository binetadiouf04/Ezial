// Tests des calculs du tableau de bord administrateur (code pur).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  presetRange, customRange, parseSalesStats, averageBasket, percentChange,
  bucketLabel, compactAmount, niceScale, axisLabelIndexes,
} from './adminStatsCore.ts';

const NOW = new Date('2026-11-14T15:30:00Z');

test('« 7 jours » couvre aujourd’hui et les 6 jours précédents', () => {
  const r = presetRange('7d', NOW);
  assert.equal(r.from, '2026-11-08T00:00:00.000Z');
  assert.equal(r.to, '2026-11-14T15:30:00.000Z');
  assert.equal(presetRange('30d', NOW).from, '2026-10-16T00:00:00.000Z');
});

test('« Tout » n’impose aucune date de début', () => {
  assert.equal(presetRange('all', NOW).from, null);
});

test('période personnalisée : bornes incluses, jamais dans le futur', () => {
  assert.deepEqual(customRange('2026-11-01', '2026-11-10', NOW), { from: '2026-11-01T00:00:00.000Z', to: '2026-11-11T00:00:00.000Z' });
  assert.deepEqual(customRange('2026-11-10', '2026-11-14', NOW), { from: '2026-11-10T00:00:00.000Z', to: '2026-11-14T15:30:00.000Z' });
  assert.ok('error' in customRange('2026-11-10', '2026-11-01', NOW));
  assert.ok('error' in customRange('', '2026-11-01', NOW));
  assert.ok('error' in customRange('2026-12-01', '2026-12-05', NOW));
});

test('lecture de la réponse du serveur : montants repris tels quels, rien d’inventé', () => {
  const stats = parseSalesStats({
    from: '2026-11-07T00:00:00+00:00', to: '2026-11-14T00:00:00+00:00', bucket: 'day',
    totals: { orders: 2, revenue: 80800, product_sales: 80000, commission: 4400, delivery_fees: 800, discounts: 0, items_sold: '5', cancelled_orders: 0 },
    previous: { orders: 0, revenue: 0, product_sales: 0, commission: 0 },
    catalog: { active_shops: 3, active_products: 3 },
    series: [{ date: '2026-11-13', orders: 2, revenue: 80800, product_sales: 80000, commission: 4400 }],
    top_products: [{ product_id: 'p1', name: 'Robe', shop_name: 'Boutique', quantity: 3, revenue: 30000 }],
    top_shops: [{ shop_id: 's1', name: 'Boutique', is_official: false, orders: 2, product_sales: 30000, commission: 2800 }],
  });
  assert.equal(stats.totals.revenue, 80800);
  assert.equal(stats.totals.commission, 4400);
  assert.equal(stats.totals.itemsSold, 5);
  assert.equal(stats.series.length, 1);
  assert.equal(stats.topShops[0].commission, 2800);
  assert.equal(parseSalesStats(null), null);
  assert.equal(parseSalesStats({ totals: {} }), null);
  // Champ absent : 0, jamais une valeur supposée.
  assert.equal(parseSalesStats({ totals: {}, series: [] }).totals.revenue, 0);
});

test('panier moyen et variations', () => {
  assert.equal(averageBasket(80800, 2), 40400);
  assert.equal(averageBasket(0, 0), 0);
  assert.equal(percentChange(150, 100), 50);
  assert.equal(percentChange(90, 100), -10);
  assert.equal(percentChange(100, 0), null);
});

test('libellés et montants abrégés', () => {
  assert.equal(bucketLabel('2026-11-13', 'day'), '13 nov.');
  assert.equal(bucketLabel('2026-11-09', 'week', true), 'Semaine du 9 nov. 2026');
  assert.equal(bucketLabel('2026-11-01', 'month', true), 'nov. 2026');
  assert.equal(compactAmount(950), '950');
  assert.equal(compactAmount(12500).replace(/\s/g, ' '), '12,5 k');
  assert.equal(compactAmount(1200000).replace(/\s/g, ' '), '1,2 M');
});

test('graduations rondes, à partir de zéro', () => {
  assert.deepEqual(niceScale(80800).ticks, [0, 25000, 50000, 75000, 100000]);
  assert.deepEqual(niceScale(2, true).ticks, [0, 1, 2]);
  assert.deepEqual(niceScale(0, true).ticks, [0, 1, 2, 3, 4]);
  const s = niceScale(7350);
  assert.equal(s.ticks[0], 0);
  assert.ok(s.max >= 7350);
});

test('libellés de l’axe horizontal : premier et dernier toujours présents', () => {
  assert.deepEqual(axisLabelIndexes(5, 7), [0, 1, 2, 3, 4]);
  for (const [count, max] of [[30, 6], [30, 12], [13, 5], [90, 9], [8, 4]]) {
    const idx = axisLabelIndexes(count, max);
    assert.equal(idx[0], 0);
    assert.equal(idx[idx.length - 1], count - 1);
    assert.ok(idx.length <= max + 1, `${count}/${max} : ${idx.length} libellés`);
    // Jamais deux libellés collés : écart régulier, le dernier compris.
    const gaps = idx.slice(1).map((v, i) => v - idx[i]);
    assert.ok(Math.min(...gaps) >= gaps[0] * 0.75, `${count}/${max} : écarts ${gaps.join(',')}`);
  }
});
