// Détection des modules dont la migration SQL n'est pas encore exécutée en
// production. Tant qu'une table, une colonne ou une fonction n'existe pas,
// PostgREST renvoie l'un de ces codes : l'interface doit alors se masquer ou
// afficher « pas encore installé », et garder le comportement actuel, sans
// jamais simuler un état.

type SupabaseLikeError = { code?: string; message?: string } | null | undefined;

// 42P01 table absente, 42703 colonne absente, 42883 fonction absente,
// PGRST202 fonction absente du cache, PGRST205 table absente du cache.
const MISSING_CODES = ['42P01', '42703', '42883', 'PGRST202', 'PGRST205'];

/** Vrai quand la table, la colonne ou la fonction n'existe pas encore (migration non exécutée). */
export function isModuleMissing(error: SupabaseLikeError): boolean {
  if (!error) return false;
  if (MISSING_CODES.includes(error.code ?? '')) return true;
  return /does not exist|schema cache|could not find/i.test(error.message ?? '');
}

/** Vrai seulement quand une fonction RPC appelée n'existe pas (et non une erreur levée à l'intérieur). */
export function isRpcMissing(error: SupabaseLikeError): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202' || error.code === '42883') return true;
  return !error.code && /could not find the function/i.test(error.message ?? '');
}

type Unsupported = { supported: false };
type Supported<T> = { supported: true } & T;
/** error : erreur de chargement réelle (réseau, droits), distincte de « pas installé ». */
export type FeatureResult<T> = Unsupported | Supported<T> | { supported: true; error: string };
