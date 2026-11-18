// Mises à jour de l'application — code pur (aucun accès réseau ni DOM),
// testé par src/lib/appUpdateCore.test.mjs.
//
// Principe : chaque build porte un identifiant (commit Cloudflare Pages ou
// horodatage), embarqué dans le JavaScript ET publié dans /version.json (jamais
// mis en cache). Quand /version.json annonce un autre identifiant que celui du
// code en cours d'exécution, une nouvelle version est en ligne : on le propose,
// on ne recharge jamais de force.

/** Pages où l'on ne propose pas de recharger : paiement, commande, saisie importante en cours. */
const SENSITIVE_PREFIXES = [
  '/checkout',          // paiement (Wave, Orange Money, carte)
  '/commande/',         // confirmation / retour de paiement
  '/suivi/',            // suivi d'une commande en cours
  '/panier',
  '/reset-password',
  '/pro/seller/abonnement/paiement',
  '/pro/seller/abonnement/essai',
  '/pro/seller/produits/ajouter',
  '/pro/seller/produits/modifier',
  '/seller/abonnement/paiement',
  '/seller/abonnement/essai',
  '/seller/produits/ajouter',
  '/seller/produits/modifier',
];

/** Vrai si recharger la page à cet endroit risquerait d'interrompre un paiement, une commande ou une saisie. */
export function isSensitivePath(pathname: string): boolean {
  const path = (pathname || '/').split('?')[0].split('#')[0].toLowerCase();
  return SENSITIVE_PREFIXES.some((prefix) => {
    const base = prefix.replace(/\/$/, '');
    return path === base || path.startsWith(`${base}/`);
  });
}

/** Identifiant lu dans /version.json, ou null si la réponse est inattendue. */
export function parseVersionPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const build = (payload as { build?: unknown }).build;
  return typeof build === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(build) ? build : null;
}

/** Vrai si une autre version que celle en cours est publiée. Une réponse illisible ne déclenche jamais rien. */
export function isNewerBuild(current: string, published: string | null): boolean {
  return Boolean(published) && Boolean(current) && published !== current && current !== 'dev';
}

/**
 * Après une erreur de chargement de module (fichiers d'une ancienne version
 * supprimés par un nouveau déploiement), un seul rechargement automatique est
 * permis par fenêtre de temps : jamais de boucle.
 */
export function shouldAutoReloadAfterChunkError(lastReloadAt: number | null, now: number, windowMs = 60_000): boolean {
  if (lastReloadAt == null || !Number.isFinite(lastReloadAt)) return true;
  return now - lastReloadAt > windowMs;
}
