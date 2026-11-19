// Lecture complète d'une liste par pages. Supabase limite chaque réponse à un
// nombre fixe de lignes (1 000 par défaut) : une lecture simple s'arrêterait
// silencieusement à ce nombre, sans aucune erreur, et le catalogue serait
// tronqué dès que la marketplace dépasse 1 000 produits. Ici, on relit page
// par page, sur un tri stable, jusqu'à la dernière page.

export const PAGE_SIZE = 500;
export const MAX_PAGES = 60; // garde-fou : 30 000 lignes au plus

export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export async function fetchAllRows<T>(
  readPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = PAGE_SIZE,
  maxPages = MAX_PAGES,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await readPage(from, from + pageSize - 1);
    if (error) return { data: all, error };
    const rows = data ?? [];
    all.push(...rows);
    // Une page incomplète est la dernière : un catalogue de moins de 500 lignes
    // se lit donc toujours en UNE seule requête (pas d'aller-retour de plus).
    // La taille de page (500) reste sous la limite par défaut de Supabase (1 000).
    if (rows.length < pageSize) break;
  }
  return { data: all, error: null };
}

// Découpe une liste d'identifiants en lots : une adresse de requête contenant des
// centaines d'identifiants devient trop longue pour être acceptée.
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const ID_BATCH = 80;
