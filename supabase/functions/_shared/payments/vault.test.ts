// Tests : clés internes lues dans le coffre (faux client, aucun appel réseau).
// Lancer : node --experimental-strip-types --test supabase/functions/_shared/payments/vault.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paymentsEnv, readVaultSecret, reconcileSecret } from './vault.ts';
import type { RpcClient } from './vault.ts';

const client = (values: Record<string, string>, fail = false): RpcClient & { calls: unknown[] } => {
  const calls: unknown[] = [];
  return {
    calls,
    rpc(fn, args) {
      calls.push([fn, args]);
      if (fail) return Promise.resolve({ data: null, error: { message: 'indisponible' } });
      return Promise.resolve({ data: values[String(args.p_name)] ?? null, error: null });
    },
  };
};

test('coffre : la clé de callback du coffre remplace la variable d\'environnement', async () => {
  const c = client({ orange_money_callback_api_key: ' cle-du-coffre-0123456789abcdef \n' });
  const env = await paymentsEnv(c, { ORANGE_MONEY_CALLBACK_API_KEY: 'ancienne', PAYMENTS_ENVIRONMENT: 'sandbox' });
  assert.equal(env.ORANGE_MONEY_CALLBACK_API_KEY, 'cle-du-coffre-0123456789abcdef', 'valeur du coffre, espaces retirés');
  assert.equal(env.PAYMENTS_ENVIRONMENT, 'sandbox', 'autres variables conservées');
  assert.deepEqual(c.calls[0], ['payments_internal_secret', { p_name: 'orange_money_callback_api_key' }]);
});

test('coffre : indisponible ou clé absente -> variables d\'environnement en secours', async () => {
  const base = { ORANGE_MONEY_CALLBACK_API_KEY: 'secours' };
  assert.equal((await paymentsEnv(client({}, true), base)).ORANGE_MONEY_CALLBACK_API_KEY, 'secours');
  assert.equal((await paymentsEnv(client({}), base)).ORANGE_MONEY_CALLBACK_API_KEY, 'secours');
  assert.equal(await reconcileSecret(client({}, true), ' env-secret '), 'env-secret');
  assert.equal(await reconcileSecret(client({}), undefined), '');
});

test('coffre : secret de vérification lu dans le coffre en priorité ; exception -> chaîne vide', async () => {
  assert.equal(await reconcileSecret(client({ payments_reconcile_secret: 'du-coffre' }), 'env'), 'du-coffre');
  const throwing: RpcClient = { rpc() { throw new Error('réseau'); } };
  assert.equal(await readVaultSecret(throwing, 'payments_reconcile_secret'), '');
});

test('coffre : le secret de webhook Wave du coffre remplace la variable d\'environnement', async () => {
  const c = client({ wave_webhook_secret: ' secret-wave-du-coffre \n' });
  const env = await paymentsEnv(c, { WAVE_WEBHOOK_SECRET: 'ancien', ORANGE_MONEY_CALLBACK_API_KEY: 'orange-secours', WAVE_COLLECTION_API_KEY: 'wave_sn_test_x' });
  assert.equal(env.WAVE_WEBHOOK_SECRET, 'secret-wave-du-coffre', 'valeur du coffre, espaces retirés');
  assert.equal(env.ORANGE_MONEY_CALLBACK_API_KEY, 'orange-secours', 'Orange : secours conservé si le coffre n\'a pas la clé');
  assert.equal(env.WAVE_COLLECTION_API_KEY, 'wave_sn_test_x', 'autres variables conservées');
  assert.deepEqual(c.calls.map((x) => (x as [string, { p_name: string }])[1].p_name), ['orange_money_callback_api_key', 'wave_webhook_secret']);
});

test('coffre : secret de webhook Wave absent ou coffre indisponible -> variable d\'environnement en secours', async () => {
  const base = { WAVE_WEBHOOK_SECRET: 'secours-wave' };
  assert.equal((await paymentsEnv(client({}), base)).WAVE_WEBHOOK_SECRET, 'secours-wave');
  assert.equal((await paymentsEnv(client({}, true), base)).WAVE_WEBHOOK_SECRET, 'secours-wave');
  assert.equal((await paymentsEnv(client({}), {})).WAVE_WEBHOOK_SECRET, undefined);
  // Les deux secrets du coffre ensemble.
  const both = await paymentsEnv(client({ orange_money_callback_api_key: 'cle-orange', wave_webhook_secret: 'cle-wave' }), {});
  assert.equal(both.ORANGE_MONEY_CALLBACK_API_KEY, 'cle-orange');
  assert.equal(both.WAVE_WEBHOOK_SECRET, 'cle-wave');
});
