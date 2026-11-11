// Supabase Edge Function — reçoit les notifications (webhooks) des
// fournisseurs de paiement.
//
//   https://lkqezdrdbogtborgjvlw.supabase.co/functions/v1/payment-webhook?provider=wave
//   https://lkqezdrdbogtborgjvlw.supabase.co/functions/v1/payment-webhook?provider=orange_money
//
// ÉTAT ACTUEL : 503 pour tout appel. Les adaptateurs d'encaissement sont
// « non configurés » (voir ../_shared/payments/core.ts) : aucune notification
// n'est lue, enregistrée ni traitée tant que les API officielles ne sont pas
// intégrées et testées. Voir docs/paiements-decaissements.md.
//
// Règles (appliquées par handleCollectionWebhook) :
//   - signature vérifiée par l'adaptateur sur le corps BRUT, avant toute
//     lecture ; une notification non signée ou mal signée → 401, rien n'est
//     enregistré ;
//   - chaque notification n'est traitée qu'une fois (payments_record_event) ;
//   - le contenu de la notification ne suffit JAMAIS : le statut et le montant
//     sont redemandés à l'API du fournisseur avant payments_confirm.
//
// Déploiement : supabase functions deploy payment-webhook --no-verify-jwt
// (le fournisseur n'a pas de session Supabase ; la sécurité repose sur la
// signature vérifiée par l'adaptateur.)
// Secrets : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automatiques),
//   PAYMENTS_ENVIRONMENT, et les secrets de signature de chaque fournisseur
//   (lus par les futurs adaptateurs).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createAdapters, handleCollectionWebhook, isProvider } from '../_shared/payments/core.ts';
import type { Provider, RecordEventInput, WebhookDb } from '../_shared/payments/core.ts';

const MAX_BODY_BYTES = 64 * 1024;

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Accès base : fonctions RPC réservées à service_role + une lecture ciblée.
const db: WebhookDb = {
  async recordEvent(input: RecordEventInput) {
    const { data, error } = await supabase.rpc('payments_record_event', {
      p_provider: input.provider,
      p_capability: input.capability,
      p_provider_event_id: input.providerEventId,
      p_event_type: input.eventType,
      p_provider_reference: input.providerReference,
      p_reported_status: input.reportedStatus,
      p_reported_amount: input.reportedAmount,
      p_signature_valid: input.signatureValid,
    });
    if (error) throw new Error(error.message);
    const row = (data ?? {}) as { new?: boolean; id?: string | null; processed?: boolean };
    return { new: row.new === true, id: row.id ?? null, processed: row.processed !== false };
  },
  async markEventProcessed(eventId: string, result: string) {
    const { error } = await supabase.rpc('payments_mark_event_processed', { p_event_id: eventId, p_result: result });
    if (error) throw new Error(error.message);
  },
  async findTransactionByReference(provider: Provider, providerReference: string) {
    const { data, error } = await supabase
      .from('payment_transactions')
      .select('id, amount, status')
      .eq('provider', provider)
      .eq('provider_reference', providerReference)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { id: string; amount: number; status: string } | null) ?? null;
  },
  async confirm(transactionId: string, providerReference: string, confirmedAmount: number) {
    const { data, error } = await supabase.rpc('payments_confirm', {
      p_transaction_id: transactionId,
      p_provider_reference: providerReference,
      p_confirmed_amount: confirmedAmount,
    });
    if (error) throw new Error(error.message);
    return data as string;
  },
  async fail(transactionId: string, status: 'failed' | 'cancelled' | 'expired', reason: string) {
    const { data, error } = await supabase.rpc('payments_fail', { p_transaction_id: transactionId, p_status: status, p_reason: reason });
    if (error) throw new Error(error.message);
    return data as string;
  },
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  const url = new URL(req.url);
  const provider = url.searchParams.get('provider');
  const capability = url.searchParams.get('capability') ?? 'collection';
  if (!isProvider(provider)) return json({ error: 'Fournisseur inconnu.' }, 404);

  // TODO (notifications de décaissement — NON implémenté volontairement) :
  // même schéma avec capability = 'disbursement' (?provider=…&capability=disbursement) :
  // signature vérifiée par l'adaptateur de décaissement, payments_record_event
  // (capability 'disbursement'), puis statut RÉEL redemandé via
  // getPayoutStatus avant payouts_record_result. D'ici là, le rapprochement
  // de payouts-dispatch suffit et aucun point d'entrée n'est ouvert.
  if (capability !== 'collection') return json({ error: 'Notifications de versement non prises en charge.' }, 503);

  const adapter = createAdapters(Deno.env.toObject()).collection[provider];
  if (!adapter.status().ready) return json({ error: 'Paiement en ligne non configuré.' }, 503);

  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return json({ error: 'Contenu trop volumineux.' }, 413);
  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) return json({ error: 'Contenu trop volumineux.' }, 413);

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  try {
    const res = await handleCollectionWebhook(db, adapter, rawBody, headers);
    return json(res.body, res.status);
  } catch (err) {
    console.error('[paiements] payment-webhook :', err instanceof Error ? err.message : String(err));
    return json({ ok: false, result: 'error' }, 500);
  }
});
