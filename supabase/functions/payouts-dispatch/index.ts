// Supabase Edge Function — versements automatiques aux vendeurs (Wave /
// Orange Money) et rapprochement des versements incertains.
//
// Appelée uniquement par pg_cron / pg_net (toutes les 15 minutes, quand la
// personne l'aura planifiée — voir docs/paiements-decaissements.md), jamais
// par le site.
//
// ÉTAT ACTUEL : AUCUN VERSEMENT. Les adaptateurs de décaissement sont « non
// configurés » (voir ../_shared/payments/core.ts) : runPayouts enregistre
// seulement l'état des API puis s'arrête AVANT de préparer ou réserver le
// moindre versement. De plus, payment_settings.payouts_enabled vaut false.
//
// Déploiement : supabase functions deploy payouts-dispatch --no-verify-jwt
// Secrets :
//   PAYOUTS_DISPATCH_SECRET — secret partagé, vérifié ci-dessous ; même valeur
//                             que le secret Vault « payouts_dispatch_secret »
//                             lu par la tâche planifiée
//   PAYMENTS_ENVIRONMENT    — « sandbox » (défaut) ou « production »
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — fournis automatiquement.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createAdapters, runPayouts } from '../_shared/payments/core.ts';
import type { Capability, PaymentSettings, PayoutDb, PayoutOutcome, PayoutRow, Provider } from '../_shared/payments/core.ts';

const DISPATCH_SECRET = Deno.env.get('PAYOUTS_DISPATCH_SECRET') ?? '';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Comparaison à durée constante (évite de deviner le secret caractère par caractère). */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// Accès base : uniquement les fonctions RPC réservées à service_role.
const db: PayoutDb = {
  async recordProviderStatus(provider: Provider, capability: Capability, configured: boolean, ready: boolean, balance: number | null, error: string | null) {
    const { error: rpcError } = await supabase.rpc('payments_record_provider_status', {
      p_provider: provider,
      p_capability: capability,
      p_configured: configured,
      p_ready: ready,
      p_balance: balance,
      p_error: error,
    });
    if (rpcError) throw new Error(rpcError.message);
  },
  async toReconcile(limit: number) {
    const { data, error } = await supabase.rpc('payouts_to_reconcile', { p_limit: limit });
    if (error) throw new Error(error.message);
    return (data ?? []) as PayoutRow[];
  },
  async prepareDue() {
    const { data, error } = await supabase.rpc('payouts_prepare_due');
    if (error) throw new Error(error.message);
    return Number(data ?? 0);
  },
  async claimBatch(limit: number) {
    const { data, error } = await supabase.rpc('payouts_claim_batch', { p_limit: limit });
    if (error) throw new Error(error.message);
    return (data ?? []) as PayoutRow[];
  },
  async recordPayoutResult(payoutId: string, outcome: PayoutOutcome, providerReference: string | null, error: string | null) {
    const { data, error: rpcError } = await supabase.rpc('payouts_record_result', {
      p_payout_id: payoutId,
      p_outcome: outcome,
      p_provider_reference: providerReference,
      p_error: error,
    });
    if (rpcError) throw new Error(rpcError.message);
    return data as string;
  },
};

Deno.serve(async (req) => {
  // Sans secret configuré, on refuse tout : la fonction n'est pas prête.
  if (!DISPATCH_SECRET) return json({ error: 'Service de versement non configuré.' }, 503);
  if (!safeEqual(req.headers.get('x-webhook-secret') ?? '', DISPATCH_SECRET)) {
    return json({ error: 'Unauthorized' }, 401);
  }
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  try {
    const { data: settings, error } = await supabase
      .from('payment_settings')
      .select('collections_enabled, payouts_enabled, payout_frequency, payout_weekday')
      .maybeSingle();
    if (error) throw new Error(error.message);

    const adapters = createAdapters(Deno.env.toObject());
    const summary = await runPayouts(
      db,
      adapters,
      (settings as PaymentSettings | null) ?? { collections_enabled: false, payouts_enabled: false },
    );
    return json({ ok: !summary.error, environment: adapters.environment, ...summary }, summary.error ? 500 : 200);
  } catch (err) {
    // Erreur inattendue (ex. base injoignable) ; aucun numéro dans le message.
    console.error('[versements] passage interrompu :', err instanceof Error ? err.message : String(err));
    return json({ ok: false, error: 'Passage interrompu.' }, 500);
  }
});
