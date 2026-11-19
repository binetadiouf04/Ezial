import { staffSpaceFromHostname } from './staffSpace.ts';

// Identité de l'application installée selon l'adresse d'où elle est ouverte.
// admin.ezial.net est une application à part pour le navigateur (autre origine) :
// elle reçoit son propre manifeste (nom « Ezial Admin ») et sa propre icône
// (papillon bordeaux sur fond crème), pour ne pas être confondue avec Ezial
// Marketplace (papillon crème sur fond bordeaux). Tous les autres hôtes
// (www.ezial.net, livreur.ezial.net, aperçus Cloudflare, local) gardent
// l'identité d'origine, inchangée. Aucun effet sur l'interface ni sur les droits.
export interface PwaIdentity {
  manifest: string;
  appleTouchIcon: string;
  /** Favicon par taille (attribut sizes de <link rel="icon">). */
  favicons: Record<string, string>;
  appName: string;
}

// « ?v=2 » : nouvelle adresse pour les navigateurs qui gardent les favicons en cache.
const ADMIN_IDENTITY: PwaIdentity = {
  manifest: '/manifest-admin.webmanifest',
  appleTouchIcon: '/icons/admin/apple-touch-icon.png?v=2',
  favicons: {
    '48x48': '/icons/admin/favicon.ico?v=2',
    '32x32': '/icons/admin/favicon-32x32.png?v=2',
    '16x16': '/icons/admin/favicon-16x16.png?v=2',
  },
  appName: 'Ezial Admin',
};

export function pwaIdentityForHostname(hostname: string): PwaIdentity | null {
  return staffSpaceFromHostname(hostname) === 'admin' ? ADMIN_IDENTITY : null;
}

/** À appeler au tout début du démarrage (src/main.tsx), avant l'affichage. */
export function applyPwaIdentity(): void {
  if (typeof document === 'undefined') return;
  const identity = pwaIdentityForHostname(window.location.hostname);
  if (!identity) return;
  const set = (selector: string, attribute: string, value: string) => {
    document.head.querySelector(selector)?.setAttribute(attribute, value);
  };
  set('link[rel="manifest"]', 'href', identity.manifest);
  set('link[rel="apple-touch-icon"]', 'href', identity.appleTouchIcon);
  document.head.querySelectorAll('link[rel="icon"]').forEach((link) => {
    const href = identity.favicons[link.getAttribute('sizes') ?? ''];
    if (href) link.setAttribute('href', href);
  });
  set('meta[name="apple-mobile-web-app-title"]', 'content', identity.appName);
  set('meta[name="application-name"]', 'content', identity.appName);
}
