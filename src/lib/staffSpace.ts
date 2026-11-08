// Les espaces administrateur et livreur ne sont plus accessibles depuis le
// site public : chacun a son sous-domaine (admin.ezial.net, livreur.ezial.net),
// servi par le même déploiement. Le nom d'hôte décide de l'espace affiché ;
// les droits, eux, restent vérifiés côté serveur (RLS, Edge Functions).
export type StaffSpace = 'admin' | 'driver';

const HOST_PREFIX: Record<StaffSpace, string> = { admin: 'admin', driver: 'livreur' };

export function staffSpaceFromHostname(hostname: string): StaffSpace | null {
  const first = hostname.toLowerCase().split('.')[0];
  if (first === HOST_PREFIX.admin) return 'admin';
  if (first === HOST_PREFIX.driver) return 'driver';
  return null;
}

export function getStaffSpace(): StaffSpace | null {
  if (typeof window === 'undefined') return null;
  return staffSpaceFromHostname(window.location.hostname);
}

// Domaine de base (ezial.net) à partir de n'importe quel hôte du site :
// www.ezial.net, admin.ezial.net, livreur.ezial.net... Null hors ezial.net
// (aperçus Cloudflare *.pages.dev, localhost) : pas de sous-domaine possible.
function baseDomain(hostname: string): string | null {
  const h = hostname.toLowerCase();
  return h === 'ezial.net' || h.endsWith('.ezial.net') ? 'ezial.net' : null;
}

// Adresse de l'espace demandé. Sur un hôte hors ezial.net (aperçu, local),
// on reste sur l'hôte courant : le lien reste utilisable pour les tests.
export function staffSpaceOrigin(space: StaffSpace): string {
  const { protocol, hostname, port, origin } = window.location;
  const base = baseDomain(hostname);
  if (!base) return origin;
  return `${protocol}//${HOST_PREFIX[space]}.${base}${port ? `:${port}` : ''}`;
}

// Adresse du site public (retour depuis un espace réservé).
export function publicSiteOrigin(): string {
  const { protocol, hostname, port, origin } = window.location;
  const base = baseDomain(hostname);
  if (!base) return origin;
  return `${protocol}//www.${base}${port ? `:${port}` : ''}`;
}
