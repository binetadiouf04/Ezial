// Statistiques du tableau de bord administrateur — code pur (aucun accès
// réseau), testé par src/lib/adminStatsCore.test.mjs. Les montants viennent
// tels quels de la fonction SQL admin_sales_stats() : rien n'est recalculé
// ici, hormis le panier moyen (chiffre d'affaires / commandes) et les
// variations par rapport à la période précédente.

export type StatsBucket = 'day' | 'week' | 'month';
export type PeriodId = '7d' | '30d' | '90d' | '12m' | 'all' | 'custom';

export interface PeriodPreset { id: Exclude<PeriodId, 'custom'>; label: string; days: number | null }

/** Heure de Dakar = UTC : les journées sont découpées en UTC. */
export const PERIOD_PRESETS: PeriodPreset[] = [
  { id: '7d', label: '7 jours', days: 7 },
  { id: '30d', label: '30 jours', days: 30 },
  { id: '90d', label: '90 jours', days: 90 },
  { id: '12m', label: '12 mois', days: 365 },
  { id: 'all', label: 'Tout', days: null },
];

export interface StatsRange { from: string | null; to: string }

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** « 7 jours » = aujourd'hui et les 6 jours précédents, jusqu'à maintenant. */
export function presetRange(id: Exclude<PeriodId, 'custom'>, now: Date = new Date()): StatsRange {
  const preset = PERIOD_PRESETS.find((p) => p.id === id);
  if (!preset || preset.days === null) return { from: null, to: now.toISOString() };
  const from = new Date(startOfUtcDay(now).getTime() - (preset.days - 1) * DAY_MS);
  return { from: from.toISOString(), to: now.toISOString() };
}

/** Période choisie à la main (dates AAAA-MM-JJ, bornes incluses). */
export function customRange(fromDate: string, toDate: string, now: Date = new Date()): StatsRange | { error: string } {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(fromDate) || !re.test(toDate)) return { error: 'Choisissez une date de début et une date de fin.' };
  const from = new Date(`${fromDate}T00:00:00Z`);
  const toInclusive = new Date(`${toDate}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(toInclusive.getTime())) return { error: 'Dates invalides.' };
  if (from.getTime() > toInclusive.getTime()) return { error: 'La date de début doit précéder la date de fin.' };
  if (from.getTime() > now.getTime()) return { error: 'La date de début est dans le futur.' };
  const to = new Date(Math.min(toInclusive.getTime() + DAY_MS, now.getTime()));
  return { from: from.toISOString(), to: to.toISOString() };
}

export interface StatsTotals {
  orders: number;
  revenue: number;
  productSales: number;
  commission: number;
  deliveryFees: number;
  discounts: number;
  itemsSold: number;
  cancelledOrders: number;
}

export interface StatsPoint { date: string; orders: number; revenue: number; productSales: number; commission: number }
export interface TopProduct { productId: string; name: string; shopName: string; quantity: number; revenue: number }
export interface TopShop { shopId: string; name: string; isOfficial: boolean; orders: number; productSales: number; commission: number }

export interface AdminSalesStats {
  from: string;
  to: string;
  bucket: StatsBucket;
  totals: StatsTotals;
  previous: { orders: number; revenue: number; productSales: number; commission: number };
  catalog: { activeShops: number; activeProducts: number };
  series: StatsPoint[];
  topProducts: TopProduct[];
  topShops: TopShop[];
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function list(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.map(obj) : [];
}

/** Lit la réponse de admin_sales_stats() sans jamais inventer de valeur : tout champ absent vaut 0. */
export function parseSalesStats(raw: unknown): AdminSalesStats | null {
  const r = obj(raw);
  if (!r.totals || !Array.isArray(r.series)) return null;
  const t = obj(r.totals);
  const p = obj(r.previous);
  const c = obj(r.catalog);
  const bucket = r.bucket === 'week' || r.bucket === 'month' ? r.bucket : 'day';
  return {
    from: str(r.from),
    to: str(r.to),
    bucket,
    totals: {
      orders: num(t.orders),
      revenue: num(t.revenue),
      productSales: num(t.product_sales),
      commission: num(t.commission),
      deliveryFees: num(t.delivery_fees),
      discounts: num(t.discounts),
      itemsSold: num(t.items_sold),
      cancelledOrders: num(t.cancelled_orders),
    },
    previous: {
      orders: num(p.orders),
      revenue: num(p.revenue),
      productSales: num(p.product_sales),
      commission: num(p.commission),
    },
    catalog: { activeShops: num(c.active_shops), activeProducts: num(c.active_products) },
    series: list(r.series).map((s) => ({
      date: str(s.date),
      orders: num(s.orders),
      revenue: num(s.revenue),
      productSales: num(s.product_sales),
      commission: num(s.commission),
    })),
    topProducts: list(r.top_products).map((s) => ({
      productId: str(s.product_id),
      name: str(s.name) || 'Produit',
      shopName: str(s.shop_name),
      quantity: num(s.quantity),
      revenue: num(s.revenue),
    })),
    topShops: list(r.top_shops).map((s) => ({
      shopId: str(s.shop_id),
      name: str(s.name) || 'Boutique',
      isOfficial: s.is_official === true,
      orders: num(s.orders),
      productSales: num(s.product_sales),
      commission: num(s.commission),
    })),
  };
}

/** Panier moyen = chiffre d'affaires / nombre de commandes (0 sans commande). */
export function averageBasket(revenue: number, orders: number): number {
  return orders > 0 ? Math.round(revenue / orders) : 0;
}

/** Variation en % par rapport à la période précédente ; null quand elle n'a pas de sens (précédent nul). */
export function percentChange(current: number, previous: number): number | null {
  if (!(previous > 0)) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Libellé d'un point de la courbe selon le pas (jour, semaine, mois). */
export function bucketLabel(date: string, bucket: StatsBucket, long = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const year = Number(m[1]);
  const month = MONTHS_SHORT[Number(m[2]) - 1] ?? '';
  const day = Number(m[3]);
  if (bucket === 'month') return long ? `${month} ${year}` : month;
  if (bucket === 'week') return long ? `Semaine du ${day} ${month} ${year}` : `${day} ${month}`;
  return long ? `${day} ${month} ${year}` : `${day} ${month}`;
}

/** Montant abrégé pour les axes : 950, 12,5 k, 1,2 M. */
export function compactAmount(n: number): string {
  const abs = Math.abs(n);
  const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  if (abs >= 1_000_000) return `${fmt(n / 1_000_000)} M`;
  if (abs >= 10_000) return `${fmt(n / 1_000)} k`;
  return Math.round(n).toLocaleString('fr-FR');
}

/** Graduations « rondes » de l'axe vertical : de 0 à un maximum lisible, 4 intervalles au plus. */
export function niceScale(maxValue: number, integerOnly = false): { max: number; ticks: number[] } {
  if (!(maxValue > 0)) return { max: integerOnly ? 4 : 1000, ticks: integerOnly ? [0, 1, 2, 3, 4] : [0, 250, 500, 750, 1000] };
  const rough = maxValue / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const candidates = [1, 2, 2.5, 5, 10].map((c) => c * pow);
  let step = candidates.find((c) => c >= rough) ?? candidates[candidates.length - 1];
  if (integerOnly) step = Math.max(1, Math.ceil(step));
  const count = Math.max(1, Math.ceil(maxValue / step));
  const ticks = Array.from({ length: count + 1 }, (_, i) => Math.round(i * step * 100) / 100);
  return { max: ticks[ticks.length - 1], ticks };
}

/** Au plus `max` libellés sur l'axe horizontal, toujours le premier et le dernier. */
export function axisLabelIndexes(count: number, max: number): number[] {
  if (count <= 0) return [];
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  // Pas entier et régulier ; le dernier libellé est toujours affiché, et celui
  // qui le précéderait de trop près est retiré pour éviter tout chevauchement.
  const step = Math.ceil((count - 1) / (max - 1));
  const out: number[] = [];
  for (let i = 0; i < count - 1; i += step) out.push(i);
  if (out.length > 1 && count - 1 - out[out.length - 1] < step * 0.75) out.pop();
  out.push(count - 1);
  return out;
}
