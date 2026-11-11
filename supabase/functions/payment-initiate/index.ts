// Supabase Edge Function — lance un paiement Wave / Orange Money pour une
// commande du client connecté et renvoie l'adresse de la page de paiement
// du fournisseur.
//
// ÉTAT ACTUEL : AUCUN PAIEMENT POSSIBLE. Les adaptateurs d'encaissement sont
// « non configurés » (voir ../_shared/payments/core.ts) : la fonction répond
// 503 « not_available » sans rien écrire en base, tant que les API officielles
// ne sont pas intégrées et testées et que payment_settings.collections_enabled
// reste à false. Voir docs/paiements-decaissements.md.
//
// Appelée par le site (supabase.functions.invoke) avec la session du client.
// Déploiement : supabase functions deploy payment-initiate
// (vérification JWT de la plateforme ACTIVE ; l'identité est en plus
// re-vérifiée ci-dessous via getUser() : userId vient du jeton, jamais du corps.)
// Corps : { orderId: uuid, provider: 'wave' | 'orange_money' }.
// Le montant n'est JAMAIS lu depuis la requête : payments_create_transaction
// le recalcule depuis orders.total_amount.
//
// Secrets :
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY — fournis automatiquement
//   PAYMENTS_ENVIRONMENT  — « sandbox » (défaut) ou « production »
//   PAYMENTS_RETURN_URL   — adresse de retour après paiement ; « {orderNumber} » est remplacé
//   PAYMENTS_CANCEL_URL   — adresse de retour après abandon ; idem
//   (secrets propres à chaque fournisseur : lus par les futurs adaptateurs)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { UserFacingError, createAdapters, initiatePayment, isProvider, isUuid } from '../_shared/payments/core.ts';
import type { InitiateDb, InitiateErrorCode, PaymentSettings, Provider, TransactionRow } from '../_shared/payments/core.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const DEFAULT_RETURN_URL = 'https://www.ezial.net/compte/commande/{orderNumber}?paiement=retour';
const DEFAULT_CANCEL_URL = 'https://www.ezial.net/compte/commande/{orderNumber}?paiement=annule';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** Erreur SQL métier (raise exception … errcode P0001) → message destiné au client. */
function rpcError(error: { code?: string; message: string }): Error {
  return error.code === 'P0001' ? new UserFacingError(error.message) : new Error(error.message);
}

const db: InitiateDb = {
  async createTransaction(orderId: string, provider: Provider, userId: string) {
    const { data, error } = await admin.rpc('payments_create_transaction', { p_order_id: orderId, p_provider: provider, p_user_id: userId });
    if (error) throw rpcError(error);
    return data as TransactionRow;
  },
  async getOrderNumber(orderId: string) {
    const { data, error } = await admin.from('orders').select('order_number').eq('id', orderId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.order_number as string | undefined) ?? null;
  },
  async setPending(transactionId: string, providerReference: string, checkoutUrl: string, expiresAt: string | null) {
    const { error } = await admin.rpc('payments_set_pending', {
      p_transaction_id: transactionId,
      p_provider_reference: providerReference,
      p_checkout_url: checkoutUrl,
      p_expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);
  },
  async fail(transactionId: string, status: 'failed' | 'cancelled' | 'expired', reason: string) {
    const { data, error } = await admin.rpc('payments_fail', { p_transaction_id: transactionId, p_status: status, p_reason: reason });
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

  // Identité : uniquement le jeton vérifié du client.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'Connectez-vous pour payer votre commande.', code: 'unauthenticated' }, 401);
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Connectez-vous pour payer votre commande.', code: 'unauthenticated' }, 401);
  const userId = userData.user.id;

  let body: { orderId?: unknown; provider?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Demande de paiement invalide.', code: 'invalid_request' }, 400);
  }
  const { orderId, provider } = body ?? {};
  if (!isUuid(orderId) || !isProvider(provider)) {
    return json({ error: 'Demande de paiement invalide.', code: 'invalid_request' }, 400);
  }

  try {
    const { data: settings, error: settingsError } = await admin
      .from('payment_settings')
      .select('collections_enabled, payouts_enabled')
      .maybeSingle();
    if (settingsError) throw new Error(settingsError.message);

    const adapters = createAdapters(Deno.env.toObject());
    const result = await initiatePayment(
      db,
      adapters.collection[provider],
      {
        orderId,
        provider,
        userId,
        returnUrl: Deno.env.get('PAYMENTS_RETURN_URL') || DEFAULT_RETURN_URL,
        cancelUrl: Deno.env.get('PAYMENTS_CANCEL_URL') || DEFAULT_CANCEL_URL,
      },
      { settings: (settings as PaymentSettings | null) ?? { collections_enabled: false, payouts_enabled: false } },
    );

    if (result.ok) return json({ checkoutUrl: result.checkoutUrl });
    return json({ error: result.message, code: result.code }, HTTP_STATUS[result.code]);
  } catch (err) {
    console.error('[paiements] payment-initiate :', err instanceof Error ? err.message : String(err));
    return json({ error: 'Le paiement n’a pas pu être lancé. Réessayez dans un instant.', code: 'internal_error' }, 500);
  }
});
