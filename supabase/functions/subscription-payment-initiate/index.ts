// Supabase Edge Function — lance le paiement Orange Money (« QR CODE – OM ») de l'abonnement Ezial Plus
// d'une boutique et renvoie le QR et les liens d'ouverture de l'application (Max It / Orange Money).
//
// Même mécanique que payment-initiate (commandes), sur la table subscription_payment_attempts :
//   * l'identité vient UNIQUEMENT du jeton, re-vérifié par getUser() ; la boutique doit appartenir à l'appelant ;
//   * le MONTANT n'est jamais lu de la requête : la base le recalcule depuis la périodicité demandée
//     (subscription_plan_price : 6 000 FCFA / 3 mois, 20 000 FCFA / an) ;
//   * actif seulement si les secrets ORANGE_MONEY_* sont présents ET (payment_settings.orange_money_enabled = true
//     OU compte listé dans payment_testers) ; sinon 503 « not_available » sans rien écrire ;
//   * QR valable 30 minutes ; adresse de retour avec référence non devinable (ref={transactionId}) vers une page
//     lisible sans connexion (/abonnement/retour) ;
//   * l'abonnement est activé UNIQUEMENT par la base, à la confirmation d'Orange (payment-webhook / payments-reconcile).
//
// Appelée par le site (supabase.functions.invoke) avec la session du vendeur.
// Déploiement : supabase functions deploy subscription-payment-initiate   (vérification JWT de la plateforme ACTIVE)
// Corps : { shopId: uuid, billingPeriod: 'quarterly' | 'annual' | 'test_25' (testeurs seulement), provider: 'orange_money' }.
// Secrets : ceux de payment-initiate (SUPABASE_*, PAYMENTS_ENVIRONMENT, ORANGE_MONEY_*) ; facultatifs :
//   PAYMENTS_SUBSCRIPTION_RETURN_URL / PAYMENTS_SUBSCRIPTION_CANCEL_URL (« {transactionId} » est remplacé).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { UserFacingError, createAdapters, isProvider, isUuid } from '../_shared/payments/core.ts';
import type { CheckoutData, InitiateErrorCode, PaymentSettings } from '../_shared/payments/core.ts';
import { initiateSubscriptionPayment, isBillingPeriod } from '../_shared/payments/subscription.ts';
import type { BillingPeriod, SubscriptionAttemptRow, SubscriptionInitiateDb } from '../_shared/payments/subscription.ts';
import { paymentsEnv } from '../_shared/payments/vault.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const DEFAULT_RETURN_URL = 'https://www.ezial.net/abonnement/retour?paiement=retour&ref={transactionId}';
const DEFAULT_CANCEL_URL = 'https://www.ezial.net/abonnement/retour?paiement=annule&ref={transactionId}';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** Erreur SQL métier (raise exception … errcode P0001) → message destiné au vendeur. */
function rpcError(error: { code?: string; message: string }): Error {
  return error.code === 'P0001' ? new UserFacingError(error.message) : new Error(error.message);
}

const db: SubscriptionInitiateDb = {
  async createAttempt(shopId: string, billingPeriod: BillingPeriod, provider, userId: string) {
    const { data, error } = await admin.rpc('subscription_payments_create_attempt', {
      p_shop_id: shopId, p_billing_period: billingPeriod, p_provider: provider, p_user_id: userId,
    });
    if (error) throw rpcError(error);
    return data as SubscriptionAttemptRow;
  },
  async saveCheckoutData(attemptId: string, checkoutData: CheckoutData) {
    const { error } = await admin.from('subscription_payment_attempts').update({ checkout_data: checkoutData }).eq('id', attemptId);
    if (error) throw new Error(error.message);
  },
  async setPending(attemptId: string, providerReference: string, checkoutUrl: string | null, expiresAt: string | null) {
    const { error } = await admin.rpc('subscription_payments_set_pending', {
      p_attempt_id: attemptId, p_provider_reference: providerReference, p_checkout_url: checkoutUrl, p_expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);
  },
  async fail(attemptId: string, status: 'failed' | 'cancelled' | 'expired', reason: string) {
    const { data, error } = await admin.rpc('subscription_payments_fail', { p_attempt_id: attemptId, p_status: status, p_reason: reason });
    if (error) throw new Error(error.message);
    return data as string;
  },
};

const HTTP_STATUS: Record<InitiateErrorCode, number> = {
  not_available: 503,
  invalid_request: 400,
  refused: 409,
  provider_error: 502,
  internal_error: 500,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.', code: 'invalid_request' }, 405);

  // Identité : uniquement le jeton vérifié du vendeur.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'Connectez-vous pour payer votre abonnement.', code: 'unauthenticated' }, 401);
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Connectez-vous pour payer votre abonnement.', code: 'unauthenticated' }, 401);
  const userId = userData.user.id;

  let body: { shopId?: unknown; billingPeriod?: unknown; provider?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Demande de paiement invalide.', code: 'invalid_request' }, 400);
  }
  const { shopId, billingPeriod, provider } = body ?? {};
  if (!isUuid(shopId) || !isBillingPeriod(billingPeriod) || !isProvider(provider)) {
    return json({ error: 'Demande de paiement invalide.', code: 'invalid_request' }, 400);
  }

  try {
    const { data: settings, error: settingsError } = await admin
      .from('payment_settings')
      .select('collections_enabled, payouts_enabled, orange_money_enabled')
      .maybeSingle();
    if (settingsError) throw new Error(settingsError.message);

    // Test réservé : interrupteur général éteint, mais Orange Money ouvert aux comptes listés dans payment_testers
    // (la base applique la même règle : subscription_payments_create_attempt).
    // Plan de test « test_25 » (25 FCFA, 1 jour) : comptes testeurs seulement (la base applique la même règle).
    const { data: testerRow } = await admin.from('payment_testers').select('user_id').eq('user_id', userId).maybeSingle();
    const isTester = !!testerRow;
    let effectiveSettings = (settings as PaymentSettings | null) ?? { collections_enabled: false, payouts_enabled: false };
    if (provider === 'orange_money' && !effectiveSettings.orange_money_enabled) {
      const { data: tester, error: testerError } = await admin.from('payment_testers').select('user_id').eq('user_id', userId).maybeSingle();
      if (!testerError && tester) effectiveSettings = { ...effectiveSettings, orange_money_enabled: true };
    }

    const adapters = createAdapters(await paymentsEnv(admin, Deno.env.toObject()));
    const result = await initiateSubscriptionPayment(
      db,
      adapters.collection[provider],
      {
        shopId,
        billingPeriod,
        provider,
        userId,
        returnUrl: Deno.env.get('PAYMENTS_SUBSCRIPTION_RETURN_URL') || DEFAULT_RETURN_URL,
        cancelUrl: Deno.env.get('PAYMENTS_SUBSCRIPTION_CANCEL_URL') || DEFAULT_CANCEL_URL,
      },
      { settings: effectiveSettings, isTester },
    );

    if (result.ok) {
      return json({
        transactionId: result.transactionId, checkoutData: result.checkoutData, expiresAt: result.expiresAt,
        amount: result.amount, billingPeriod: result.billingPeriod,
      });
    }
    return json({ error: result.message, code: result.code }, HTTP_STATUS[result.code]);
  } catch (err) {
    console.error('[paiements] subscription-payment-initiate :', err instanceof Error ? err.message : String(err));
    return json({ error: 'Le paiement n’a pas pu être lancé. Réessayez dans un instant.', code: 'internal_error' }, 500);
  }
});
