// Ezial product reference generation: EZ-[3-letter shop prefix]-[4-digit sequence].
// The prefix is derived from the shop name; the sequence is per-shop and
// starts at 0001. A reference is assigned once at product creation and must
// never change or be reassigned afterwards.

export interface ShopRef {
  id: string;
  name: string;
}

function toLetters(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents (combining diacritical marks left by NFD)
    .toUpperCase()
    .replace(/[^A-Z]/g, ''); // strip spaces & special characters
}

function prefixCandidates(name: string): string[] {
  const letters = toLetters(name);
  if (letters.length === 0) return ['EZI'];
  if (letters.length < 3) return [letters.padEnd(3, 'X')];
  const candidates: string[] = [];
  for (let i = 0; i <= letters.length - 3; i++) candidates.push(letters.slice(i, i + 3));
  return candidates;
}

function alphabetFallback(seedLetter: string, taken: Set<string>): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const b of A) {
    for (const c of A) {
      const candidate = seedLetter + b + c;
      if (!taken.has(candidate)) return candidate;
    }
  }
  throw new Error('Reference prefix space exhausted');
}

/**
 * Assigns a unique 3-letter prefix to each shop, processed in order. A shop
 * keeps the natural prefix from its own name unless an earlier shop in the
 * list already claimed it — in that case the next 3-letter window of its
 * own name is tried, then an alphabet fallback. Existing shops (earlier in
 * the list) are never affected by shops appended later, so prefixes stay
 * stable as new shops are created.
 */
export function assignShopPrefixes(shops: ShopRef[]): Record<string, string> {
  const taken = new Set<string>();
  const result: Record<string, string> = {};
  for (const shop of shops) {
    const candidates = prefixCandidates(shop.name);
    let chosen = candidates.find((c) => !taken.has(c));
    if (!chosen) chosen = alphabetFallback(candidates[0][0] ?? 'E', taken);
    taken.add(chosen);
    result[shop.id] = chosen;
  }
  return result;
}

export function formatReference(prefix: string, seq: number): string {
  return `EZ-${prefix}-${String(seq).padStart(4, '0')}`;
}

/** Generates the next reference for `shopId` given the products already assigned to it. */
export function nextReferenceForShop(
  shopPrefixes: Record<string, string>,
  existingProducts: { shopId: string }[],
  shopId: string,
): string {
  const seq = existingProducts.filter((p) => p.shopId === shopId).length + 1;
  return formatReference(shopPrefixes[shopId] ?? 'EZI', seq);
}
