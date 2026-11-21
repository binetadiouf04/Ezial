import { supabase } from '@/lib/supabaseClient';
import type { SellerAuthShop } from '@/lib/supabaseSellerAuth';
import { hasStoredSupabaseSession } from './proAuthMarker';
import { classifySessionCheckError, type ErrorLike } from './sellerSessionCore';

// Vérification de la session de l'espace boutique à l'ouverture de l'application.
// Même contrôle que restoreSellerSession() (vraie session Supabase + boutique possédée,
// shops.owner_id = auth.uid()), mais une erreur passagère n'est plus confondue avec
// « pas connecté » : elle renvoie 'unavailable', la session et le repère sont gardés
// et la vérification est refaite (retour du réseau, retour dans l'application, bouton).

export type SellerSessionCheck =
  | { kind: 'seller'; shop: SellerAuthShop }
  /** Session valide mais sans boutique (compte acheteur) : laissée telle quelle. */
  | { kind: 'no_shop' }
  | { kind: 'signed_out' }
  | { kind: 'unavailable' };

// Au-delà, la vérification est considérée comme impossible pour l'instant (réseau très
// lent) : l'écran « Connexion impossible pour le moment » remplace le chargement.
const CHECK_TIMEOUT_MS = 15_000;

class CheckTimeoutError extends Error {
  constructor() { super('Délai dépassé'); this.name = 'TimeoutError'; }
}

function fromError(error: ErrorLike | null | undefined): SellerSessionCheck {
  return { kind: classifySessionCheckError(error, hasStoredSupabaseSession()) };
}

async function runCheck(): Promise<SellerSessionCheck> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) return fromError(sessionError);
  if (!sessionData.session) return { kind: 'signed_out' };

  // Vérification auprès du serveur (jamais la seule copie locale) : session encore active ?
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) return fromError(userError);
  const userId = userData.user?.id;
  if (!userId) return { kind: 'signed_out' };

  const { data: shop, error: shopError } = await supabase
    .from('shops')
    .select('id, name, owner_id, is_official, seller_code')
    .eq('owner_id', userId)
    .maybeSingle();
  // Lecture de la boutique impossible (réseau, serveur) : rien ne dit que la personne
  // n'est plus vendeuse — on réessaiera.
  if (shopError) return hasStoredSupabaseSession() ? { kind: 'unavailable' } : { kind: 'signed_out' };
  if (!shop) return { kind: 'no_shop' };

  return {
    kind: 'seller',
    shop: {
      shopId: shop.id as string,
      shopName: shop.name as string,
      sellerCode: (shop.seller_code as string | null) ?? '',
      isOfficial: Boolean(shop.is_official),
    },
  };
}

export async function checkSellerSession(): Promise<SellerSessionCheck> {
  // Appareil hors ligne : inutile d'attendre les nouvelles tentatives de supabase-js.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return hasStoredSupabaseSession() ? { kind: 'unavailable' } : { kind: 'signed_out' };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new CheckTimeoutError()), CHECK_TIMEOUT_MS); });
  try {
    return await Promise.race([runCheck(), timeout]);
  } catch (error) {
    return fromError(error as ErrorLike);
  } finally {
    clearTimeout(timer);
  }
}
