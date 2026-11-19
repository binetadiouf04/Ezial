// Clé publique de notification (VAPID) : 65 octets, soit 87 caractères en
// base64 « URL-safe », commençant par l'octet 0x04. Une clé mal recopiée dans
// Cloudflare (espace ou retour à la ligne collé, fin coupée) fait échouer
// l'abonnement avec une erreur peu parlante : on la nettoie et on la vérifie
// avant tout, pour dire précisément ce qui ne va pas.

export const VAPID_PUBLIC_KEY_LENGTH = 87;

export type VapidKeyCheck =
  | { ok: true; key: string }
  | { ok: false; length: number; reason: string };

/** Retire espaces, retours à la ligne et guillemets collés par erreur. */
export function cleanVapidKey(raw: string | undefined | null): string {
  return (raw ?? '').replace(/[\s"'`]/g, '');
}

export function checkVapidPublicKey(raw: string | undefined | null): VapidKeyCheck {
  const key = cleanVapidKey(raw);
  if (!key) return { ok: false, length: 0, reason: 'absente' };
  if (!/^[A-Za-z0-9_-]+$/.test(key)) return { ok: false, length: key.length, reason: 'contient des caractères interdits' };
  if (key.length !== VAPID_PUBLIC_KEY_LENGTH) {
    return { ok: false, length: key.length, reason: key.length < VAPID_PUBLIC_KEY_LENGTH ? 'incomplète' : 'trop longue' };
  }
  try {
    const bytes = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '=');
    if (bytes.length !== 65 || bytes.charCodeAt(0) !== 4) return { ok: false, length: key.length, reason: 'invalide' };
  } catch {
    return { ok: false, length: key.length, reason: 'invalide' };
  }
  return { ok: true, key };
}
