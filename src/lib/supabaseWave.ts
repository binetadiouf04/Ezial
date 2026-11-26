import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { isWaveLink } from './orderPayment';
import { PAYMENT_INITIATE_FUNCTION } from './supabaseOrangeMoney';

// Paiement Wave (Checkout) côté site.
//   * la session de paiement est créée par la fonction Edge payment-initiate (clés Wave
//     uniquement côté serveur, jamais dans le site) ;
//   * la personne est envoyée sur l'adresse « wave_launch_url », ouverte par le navigateur
//     (Wave l'exige : jamais dans une vue intégrée) ;
//   * le site ne déclare JAMAIS un paiement réussi : seule la base, après vérification
//     auprès de Wave, passe la commande à « payée » (l'adresse de retour ne prouve rien).

export interface WaveSession {
  transactionId: string;
  url: string;          // wave_launch_url
  validUntil: string;   // fin de validité de la session (30 minutes chez Wave)
}

export function toSession(transactionId: unknown, url: unknown, expiresAt: unknown): WaveSession | null {
  if (typeof transactionId !== 'string' || !transactionId || !isWaveLink(url)) return null;
  if (typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) return null;
  return { transactionId, url, validUntil: expiresAt };
}

/** Crée (ou réutilise, si elle est encore valable) la session de paiement Wave d'une commande. */
export async function startWavePayment(orderId: string): Promise<{ session: WaveSession } | { error: string }> {
  const { data, error } = await supabase.functions.invoke(PAYMENT_INITIATE_FUNCTION, { body: { orderId, provider: 'wave' } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        if (typeof body?.error === 'string') return { error: body.error };
      } catch { /* réponse illisible : message générique ci-dessous */ }
    }
    return { error: 'Le paiement Wave n’a pas pu être lancé. Vérifiez votre connexion et réessayez.' };
  }
  // checkoutUrl : adresse de la page Wave ; expiresAt : renvoyé avec les données de session
  // (ou relu dans la base si la réponse ne le contient pas).
  let expiresAt: unknown = data?.expiresAt ?? data?.checkoutData?.validUntil;
  if (typeof expiresAt !== 'string' && typeof data?.transactionId === 'string') {
    const row = await supabase.from('payment_transactions').select('expires_at').eq('id', data.transactionId).maybeSingle();
    expiresAt = row.data?.expires_at;
  }
  const session = toSession(data?.transactionId, data?.checkoutUrl, expiresAt);
  if (!session) return { error: 'Wave n’a pas renvoyé de page de paiement. Réessayez dans un instant.' };
  return { session };
}

/** Session Wave encore valable déjà créée pour cette commande (rechargement de la page) : aucun appel à Wave. */
export async function fetchOpenWaveSession(orderId: string): Promise<WaveSession | null> {
  const { data, error } = await supabase
    .from('payment_transactions')
    .select('id, checkout_url, expires_at')
    .eq('order_id', orderId)
    .eq('provider', 'wave')
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return toSession(data.id, data.checkout_url, data.expires_at);
}
