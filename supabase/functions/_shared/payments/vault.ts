// Clés internes du paiement lues dans le coffre Supabase (Vault), via la fonction
// SQL payments_internal_secret (réservée au serveur, migration 6) :
//   * orange_money_callback_api_key : clé que Orange renvoie dans chaque callback ;
//   * payments_reconcile_secret     : secret de la tâche de vérification périodique ;
//   * wave_webhook_secret           : secret de signature des webhooks Wave.
// Le coffre est prioritaire ; les variables d'environnement ne servent que de secours.
// TypeScript pur (testable avec node).

import { WAVE_ENV } from './wave.ts';

export type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

export const VAULT_NAMES = {
  reconcile: 'payments_reconcile_secret',
  callback: 'orange_money_callback_api_key',
  waveWebhook: 'wave_webhook_secret',
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

/** Variables d'environnement du paiement, avec la clé de callback Orange et le secret de webhook Wave du coffre quand ils existent. */
export async function paymentsEnv(client: RpcClient, base: Record<string, string | undefined>): Promise<Record<string, string | undefined>> {
  // Deux lectures en parallèle : le chemin Orange Money ne gagne aucune latence supplémentaire.
  const [callback, waveWebhook] = await Promise.all([
    readVaultSecret(client, VAULT_NAMES.callback),
    readVaultSecret(client, VAULT_NAMES.waveWebhook),
  ]);
  if (!callback && !waveWebhook) return base;
  const env = { ...base };
  if (callback) env.ORANGE_MONEY_CALLBACK_API_KEY = callback;
  if (waveWebhook) env[WAVE_ENV.webhookSecret] = waveWebhook;
  return env;
}

/** Secret attendu de la vérification périodique : le coffre d'abord, sinon la variable d'environnement. */
export async function reconcileSecret(client: RpcClient, envValue: string | undefined): Promise<string> {
  return (await readVaultSecret(client, VAULT_NAMES.reconcile)) || (envValue ?? '').trim();
}
