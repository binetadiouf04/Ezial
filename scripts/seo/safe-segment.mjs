// Garde-fou pour toute valeur lue dans la base (identifiant, slug, catégorie,
// sous-catégorie) avant de l'utiliser dans un chemin de fichier de dist/ ou
// dans une ligne de _redirects : une valeur inattendue (« ../ », espace,
// retour à la ligne, majuscule…) ne doit jamais permettre d'écrire hors du
// dossier prévu ni d'ajouter une règle de redirection.
const SAFE_SEGMENT_RE = /^[a-z0-9][a-z0-9_-]*$/;

/** Vrai si la valeur peut servir telle quelle de segment de chemin. */
export function isSafeSegment(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0;
  return typeof value === 'string' && SAFE_SEGMENT_RE.test(value);
}

// Chemin complet d'un fichier généré : « /segment/…/fichier.ext », chaque
// segment commençant par une lettre ou un chiffre (donc jamais « .. »).
const SAFE_FILE_PATH_RE = /^(\/[a-z0-9][a-z0-9_-]*)+\.[a-z0-9]+$/;

/** Vrai si le chemin relatif à dist/ est un chemin de fichier attendu. */
export function isSafeFilePath(relPath) {
  return typeof relPath === 'string' && SAFE_FILE_PATH_RE.test(relPath);
}

/** Valeur lisible et sans caractère de contrôle, pour les messages du build. */
export function describeValue(value) {
  return JSON.stringify(String(value).slice(0, 80));
}
