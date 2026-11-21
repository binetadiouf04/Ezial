// Repère « espace pro ouvert » (rôle, identifiant affiché, nom) — JAMAIS cru seul :
// à chaque ouverture, la vraie session Supabase et le droit d'accès (boutique possédée,
// livreur, administrateur) sont revérifiés avant d'ouvrir l'espace.
//
// Gardé dans localStorage (et non sessionStorage) pour que le vendeur reste connecté
// tant qu'il ne se déconnecte pas : sur iPhone, l'application installée est souvent
// fermée par le système, ce qui effaçait sessionStorage et ramenait à l'écran de
// connexion alors que la session Supabase (elle aussi dans localStorage) était valide.
// Effacé à la déconnexion. Contient seulement des libellés, aucun secret ni jeton.
// Administration : volontairement inchangée (sessionStorage) — accès le plus sensible,
// une reconnexion après fermeture de l'onglet reste demandée.

export type ProMarkerRole = 'seller' | 'driver' | 'admin';
export interface ProAuthMarker { role: ProMarkerRole; identifier: string; name: string }

const KEY = 'ezial-pro-auth';

function parse(raw: string | null): ProAuthMarker | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ProAuthMarker>;
    if (v.role !== 'seller' && v.role !== 'driver' && v.role !== 'admin') return null;
    return { role: v.role, identifier: typeof v.identifier === 'string' ? v.identifier : '', name: typeof v.name === 'string' ? v.name : '' };
  } catch {
    return null;
  }
}

export function readProMarker(): ProAuthMarker | null {
  try {
    const stored = parse(window.localStorage.getItem(KEY));
    if (stored) return stored;
    const session = parse(window.sessionStorage.getItem(KEY));
    // Ancien emplacement d'un repère boutique / livreur (avant le 21 nov. 2026) : déplacé.
    if (session && session.role !== 'admin') {
      window.localStorage.setItem(KEY, JSON.stringify(session));
      window.sessionStorage.removeItem(KEY);
    }
    return session;
  } catch {
    return null;
  }
}

export function writeProMarker(marker: ProAuthMarker): void {
  try {
    clearProMarker();
    const store = marker.role === 'admin' ? window.sessionStorage : window.localStorage;
    store.setItem(KEY, JSON.stringify(marker));
  } catch { /* stockage indisponible : reconnexion demandée plus tard */ }
}

export function clearProMarker(): void {
  try { window.localStorage.removeItem(KEY); } catch { /* rien à faire */ }
  try { window.sessionStorage.removeItem(KEY); } catch { /* rien à faire */ }
}

/** Une session Supabase est-elle enregistrée sur cet appareil ? (lecture locale, sans réseau) */
export function hasStoredSupabaseSession(): boolean {
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) return true;
    }
  } catch { /* stockage indisponible */ }
  return false;
}
