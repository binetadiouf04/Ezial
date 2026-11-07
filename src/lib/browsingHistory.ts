// Recently viewed products, kept on this device only (localStorage) — one of
// the signals behind « Vous aimerez » (see rankForYou), alongside purchases,
// favorites and the cart. Never sent anywhere. Fails silently when storage
// is unavailable (private browsing, blocked site data): the section then
// simply relies on the other signals.

const STORAGE_KEY = 'ezial-recently-viewed-v1';
const MAX_ITEMS = 30;

export function getRecentlyViewedIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Most recent first, no duplicates, capped. */
export function recordProductView(productId: string): void {
  if (!productId) return;
  try {
    const next = [productId, ...getRecentlyViewedIds().filter((id) => id !== productId)].slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable — nothing to remember, nothing breaks.
  }
}
