// Clés internes du paiement lues dans le coffre Supabase (Vault), via la fonction
// SQL payments_internal_secret (réservée au serveur, migration 6) :
//   * orange_money_callback_api_key : clé que Orange renvoie dans chaque callback ;
//   * payments_reconcile_secret     : secret de la tâche de vérification périodique.
// Le coffre est prioritaire ; les variables d'environnement ne servent que de secours.
// TypeScript pur (testable avec node).

export type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

export const VAULT_NAMES = {
  reconcile: 'payments_reconcile_secret',
  callback: 'orange_money_callback_api_key',
} as const;

/** Valeur du coffre, ou chaîne vide (coffre indisponible, clé absente). */
export async function readVaultSecret(client: RpcClient, name: string): Promise<string> {
  try {
    const { data, error } = await client.rpc('payments_internal_secret', { p_name: name });
    return !error && typeof data === 'string' ? data.trim() : '';
  } catch {
    return '';
  }
}

/** Variables d'environnement du paiement, avec la clé de callback du coffre quand elle existe. */
export async function paymentsEnv(client: RpcClient, base: Record<string, string | undefined>): Promise<Record<string, string | undefined>> {
  const callback = await readVaultSecret(client, VAULT_NAMES.callback);
  return callback ? { ...base, ORANGE_MONEY_CALLBACK_API_KEY: callback } : base;
}

/** Secret attendu de la vérification périodique : le coffre d'abord, sinon la variable d'environnement. */
export async function reconcileSecret(client: RpcClient, envValue: string | undefined): Promise<string> {
  return (await readVaultSecret(client, VAULT_NAMES.reconcile)) || (envValue ?? '').trim();
}
