// Supabase Edge Function — vérification périodique des paiements Orange Money.
//
// Appelée uniquement par pg_cron / pg_net (chaque minute, une fois planifiée),
// jamais par le site. Pour chaque tentative non close (QR en cours, anciens QR
// remplacés, créations incertaines), UNE recherche groupée chez Orange
// (limite de 60 requêtes/minute en sandbox), puis payments_record_verification.
// Aucune conclusion locale : une commande n'est annulée que par
// orders_finalize_unpaid, quand toutes ses tentatives sont closes chez Orange.
//
// Action « ?action=sandbox-test-numbers » (mode test uniquement) : numéros de test
// Orange (MERCHANT, CUSTOMER…), pour connaître le code marchand de test.
//
// Action ponctuelle « ?action=register-callback » : enregistre chez Orange
// l'adresse de payment-webhook et la clé ORANGE_MONEY_CALLBACK_API_KEY
// (Orange la renverra en « Authorization: Basic … » à chaque callback).
//
// Déploiement : supabase functions deploy payments-reconcile --no-verify-jwt
// Secrets :
//   Secret partagé (en-tête x-webhook-secret) : lu dans le coffre Supabase
//   (« payments_reconcile_secret », migration 6) ; PAYMENTS_RECONCILE_SECRET en secours.
//   PAYMENTS_ENVIRONMENT, ORANGE_MONEY_* — voir docs/orange-money/
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — fournis automatiquement.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createAdapters, reconcileCollections } from '../_shared/payments/core.ts';
import type { PaymentStatus, ReconcileCandidate, ReconcileDb } from '../_shared/payments/core.ts';
import { OrangeMoneyCollection, fetchSandboxTestNumbers, safeEqual } from '../_shared/payments/orange-money.ts';
import { paymentsEnv, reconcileSecret } from '../_shared/payments/vault.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const db: ReconcileDb = {
  async candidates(limit: number) {
    const { data, error } = await supabase.rpc('payments_reconcile_candidates', { p_limit: limit });
    if (error) throw new Error(error.message);
    return (data ?? []) as ReconcileCandidate[];
  },
  async recordVerification(transactionId: string, status: PaymentStatus, amount: number | null, providerTransactionId: string | null) {
    const { data, error } = await supabase.rpc('payments_record_verification', {
      p_transaction_id: transactionId,
      p_provider_status: status,
      p_amount: amount,
      p_provider_transaction_id: providerTransactionId,
    });
    if (error) throw new Error(error.message);
    return data as string;
  },
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);
  const expected = await reconcileSecret(supabase, Deno.env.get('PAYMENTS_RECONCILE_SECRET'));
  if (expected.length < 24 || !safeEqual(req.headers.get('x-webhook-secret') ?? '', expected)) {
    return json({ error: 'Non autorisé.' }, 401);
  }
  const action = new URL(req.url).searchParams.get('action');
  // Mode test uniquement : numéros de test Orange (dont le code marchand), avant la configuration complète.
  if (action === 'sandbox-test-numbers') {
    const res = await fetchSandboxTestNumbers(Deno.env.toObject());
    return json(res, res.ok ? 200 : 502);
  }

  const adapter = createAdapters(await paymentsEnv(supabase, Deno.env.toObject())).collection.orange_money;
  if (!adapter.status().ready) return json({ ok: false, result: 'not_configured', reason: adapter.status().reason }, 503);

  try {
    if (action === 'register-callback') {
      const callbackUrl = `${SUPABASE_URL}/functions/v1/payment-webhook?provider=orange_money`;
      const res = await (adapter as OrangeMoneyCollection).registerCallback(callbackUrl);
      return json(res, res.ok ? 200 : 502);
    }
    const summary = await reconcileCollections(db, adapter);
    return json({ ok: !summary.error, ...summary });
  } catch (err) {
    console.error('[paiements] payments-reconcile :', err instanceof Error ? err.message : String(err));
    return json({ ok: false, result: 'error' }, 500);
  }
});
