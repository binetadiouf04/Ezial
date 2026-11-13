// Contrôles de sécurité partagés par les fonctions Edge. Code pur (aucun
// accès réseau, aucune API Deno) : testé par `npm run test:security`
// (supabase/functions/_shared/guards.test.mjs).

/** Comparaison à durée constante : ne révèle pas où deux secrets diffèrent. */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * Secret partagé d'un appel serveur à serveur.
 * - 'unconfigured' : le secret attendu est vide ou trop court → la fonction
 *   refuse TOUT appel (un en-tête vide ne doit jamais suffire).
 * - 'invalid' : secret reçu absent ou différent.
 */
export function checkSharedSecret(received: string | null | undefined, expected: string): 'ok' | 'invalid' | 'unconfigured' {
  if (typeof expected !== 'string' || expected.length < 16) return 'unconfigured';
  if (typeof received !== 'string' || received.length === 0) return 'invalid';
  return safeEqual(received, expected) ? 'ok' : 'invalid';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Adresse ouverte au clic d'une notification : toujours un chemin interne du
 * site (« /commande/… »), jamais une adresse externe ni « //hôte ».
 */
export function safeInternalPath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 300) return '/';
  // « / » suivi d'autre chose que « / » ou « \ » ; aucun caractère de
  // contrôle ni antislash dans le reste.
  if (!/^\/(?![/\\])/.test(value)) return '/';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x5c) return '/';
  }
  return value;
}

export interface PushPayload { userId: string; title: string; body: string; url: string }

/** Valide et borne le contenu d'une notification push. null = requête refusée. */
export function parsePushPayload(input: unknown): PushPayload | null {
  if (!input || typeof input !== 'object') return null;
  const { userId, title, body, url } = input as Record<string, unknown>;
  if (!isUuid(userId)) return null;
  if (typeof title !== 'string' || title.trim() === '') return null;
  if (body !== undefined && body !== null && typeof body !== 'string') return null;
  return {
    userId,
    title: title.slice(0, 120),
    body: typeof body === 'string' ? body.slice(0, 400) : '',
    url: safeInternalPath(url),
  };
}

// Zone de service large autour du Sénégal : hors de cette zone, aucun calcul
// de distance n'est lancé (et donc aucun appel payant à Google).
const SERVICE_AREA = { minLat: 12, maxLat: 17, minLng: -18, maxLng: -11 };
export function isWithinServiceArea(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= SERVICE_AREA.minLat && lat <= SERVICE_AREA.maxLat
    && lng >= SERVICE_AREA.minLng && lng <= SERVICE_AREA.maxLng;
}

export interface DeliveryFeeRequest { shopIds: string[]; clientLat: number; clientLng: number }

/** Valide la demande de frais de livraison. Renvoie un message d'erreur en français sinon. */
export function parseDeliveryFeeRequest(input: unknown, maxShops: number): DeliveryFeeRequest | { error: string } {
  if (!input || typeof input !== 'object') return { error: 'Requête invalide.' };
  const { shopIds, clientLat, clientLng } = input as Record<string, unknown>;
  if (!Array.isArray(shopIds) || shopIds.length === 0 || shopIds.length > maxShops || !shopIds.every(isUuid)) {
    return { error: 'Nombre de boutiques invalide.' };
  }
  if (new Set(shopIds).size !== shopIds.length) return { error: 'Nombre de boutiques invalide.' };
  if (!isWithinServiceArea(clientLat, clientLng)) return { error: 'Adresse hors de la zone de livraison.' };
  return { shopIds: shopIds as string[], clientLat: clientLat as number, clientLng: clientLng as number };
}

// ── Double authentification administrateur ───────────────────────────────────

/**
 * Niveau d'assurance (« aal1 » ou « aal2 ») inscrit dans le jeton de session.
 * À n'utiliser qu'après vérification du jeton par Supabase (auth.getUser) :
 * cette fonction ne vérifie pas la signature.
 */
export function jwtAssuranceLevel(authHeader: string | null | undefined): string | null {
  const token = (authHeader ?? '').replace(/^Bearer\s+/i, '').trim();
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded)) as { aal?: unknown };
    return typeof payload.aal === 'string' ? payload.aal : null;
  } catch {
    return null;
  }
}

/**
 * Un administrateur qui a au moins un facteur vérifié doit avoir validé son
 * code (aal2). Sans facteur vérifié, le mot de passe suffit.
 */
export function adminMfaSatisfied(aal: string | null, verifiedFactorCount: number): boolean {
  return verifiedFactorCount <= 0 || aal === 'aal2';
}
