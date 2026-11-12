// Une boutique dont le propriétaire a supprimé son compte est anonymisée : nom
// « Boutique supprimée », statut 'deleted' (fonction serveur
// anonymize_deleted_shop). Les boutiques anonymisées avant l'existence de ce
// statut ont gardé « brouillon » ou « suspendue » : le nom les identifie aussi.
// Ces lignes restent en base (l'historique des commandes en dépend) mais
// n'ont rien à faire dans les listes de gestion de l'administration.
export const DELETED_SHOP_NAME = 'Boutique supprimée';

export function isDeletedShop(row: { status?: unknown; name?: unknown }): boolean {
  return row.status === 'deleted' || row.name === DELETED_SHOP_NAME;
}
