// Supabase Edge Function — service d'envoi des notifications WhatsApp.
//
// Appelée uniquement par pg_cron / pg_net (une fois par minute, quand la
// personne l'aura planifiée — voir docs/whatsapp-notifications.md), jamais par
// le site. Elle réserve les notifications dues dans public.whatsapp_notifications,
// re-vérifie la commande juste avant l'envoi, envoie via le fournisseur
// configuré et enregistre le résultat.
//
// AUCUN ENVOI RÉEL tant qu'aucun fournisseur officiel n'est branché : sans
// WHATSAPP_PROVIDER (ou avec une valeur inconnue), le fournisseur est désactivé
// et rien n'est réservé (voir core.ts, dispatchBatch).
//
// Déploiement : supabase functions deploy whatsapp-dispatch --no-verify-jwt
// Secrets (Edge Functions > Secrets) :
//   WHATSAPP_DISPATCH_SECRET   — secret partagé, vérifié ci-dessous ; même valeur
//                                que le secret Vault « whatsapp_dispatch_secret »
//                                lu par la tâche planifiée
//   WHATSAPP_PROVIDER          — absent / « aucun » : rien n'est envoyé ;
//                                « test » : simulation sans réseau
//   WHATSAPP_TEMPLATE_*        — identifiants des modèles approuvés
//   (WHATSAPP_API_URL, WHATSAPP_API_TOKEN, WHATSAPP_SENDER_ID,
//    WHATSAPP_BUSINESS_ACCOUNT_ID : lus par le futur adaptateur du fournisseur)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — fournis automatiquement.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createProviderFromEnv, dispatchBatch, templateIdsFromEnv } from './core.ts';
import type { ClaimedJob, DispatchDb, MessageContext, Outcome } from './core.ts';

const DISPATCH_SECRET = Deno.env.get('WHATSAPP_DISPATCH_SECRET') ?? '';
const BATCH_LIMIT = 20;

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
const db: DispatchDb = {
  async claimBatch(limit: number): Promise<ClaimedJob[]> {
    const { data, error } = await supabase.rpc('whatsapp_claim_batch', { p_limit: limit });
    if (error) throw new Error(error.message);
    return (data ?? []) as ClaimedJob[];
  },
  async messageContext(id: string): Promise<MessageContext> {
    const { data, error } = await supabase.rpc('whatsapp_message_context', { p_id: id });
    if (error) throw new Error(error.message);
    return (data ?? { relevant: false, reason: 'not_found' }) as MessageContext;
  },
  async complete(id: string, outcome: Outcome, provider: string | null, providerMessageId: string | null, error: string | null) {
    const { data, error: rpcError } = await supabase.rpc('whatsapp_complete', {
      p_id: id,
      p_outcome: outcome,
      p_provider: provider,
      p_provider_message_id: providerMessageId,
      p_error: error,
    });
    if (rpcError) throw new Error(rpcError.message);
    return data;
  },
  async recordDispatch(provider: string, ready: boolean, error: string | null) {
    const { error: rpcError } = await supabase.rpc('whatsapp_record_dispatch', {
      p_provider: provider,
      p_ready: ready,
      p_error: error,
    });
    if (rpcError) throw new Error(rpcError.message);
  },
};

// TODO (webhooks de statut du fournisseur — NON implémenté volontairement) :
// quand un fournisseur officiel sera choisi et s'il envoie des accusés de
// livraison / lecture, les traiter dans une fonction SÉPARÉE (par exemple
// « whatsapp-webhook », déployée à part), jamais ici. Cette fonction devra :
//   - pour la vérification d'abonnement (GET), comparer le jeton reçu à
//     WHATSAPP_WEBHOOK_VERIFY_TOKEN ;
//   - pour chaque notification (POST), vérifier la signature du fournisseur
//     avec WHATSAPP_WEBHOOK_SECRET avant toute lecture du contenu ;
//   - ne mettre à jour que le statut lié à provider_message_id, via une
//     fonction SQL réservée à service_role (à créer par migration).
// Aucun point d'entrée ouvert ne doit exister tant que ce n'est pas fait.

Deno.serve(async (req) => {
  // Sans secret configuré, on refuse tout : la fonction n'est pas prête.
  if (!DISPATCH_SECRET) return json({ error: 'Service WhatsApp non configuré.' }, 503);
  if (!safeEqual(req.headers.get('x-webhook-secret') ?? '', DISPATCH_SECRET)) {
    return json({ error: 'Unauthorized' }, 401);
  }
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  const env = Deno.env.toObject();
  const provider = createProviderFromEnv(env);
  const templateIds = templateIdsFromEnv(env);

  try {
    const summary = await dispatchBatch(db, provider, templateIds, { limit: BATCH_LIMIT });
    return json({ ok: !summary.error, ...summary }, summary.error ? 500 : 200);
  } catch (err) {
    // Erreur inattendue (ex. base injoignable) ; aucun numéro dans le message.
    const message = err instanceof Error ? err.message : String(err);
    console.error('[whatsapp] passage interrompu :', message);
    return json({ ok: false, error: 'Passage interrompu.' }, 500);
  }
});
