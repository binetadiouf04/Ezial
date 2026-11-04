import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

// Real, permanent account deletion — calls the delete-account Edge
// Function (see supabase/functions/delete-account/index.ts), the only
// place allowed to hold the service_role key needed to actually remove an
// auth.users row. The frontend can only anonymize what RLS lets it touch
// on its own row; it can never delete the account itself.
//
// Deployed under the slug "bright-api" (auto-assigned at creation in the
// Supabase dashboard — renaming it afterward only changes the display
// name, never the slug/endpoint URL, so the invoke name below must match
// this exact slug rather than the function's source file name).
const DELETE_ACCOUNT_FUNCTION_SLUG = 'bright-api';

// Ezial and Ezial Pro share one Supabase Auth identity when a customer and
// a shop owner are the same real person (same auth.users row — see the
// architecture note in supabaseSellerAuth.ts's linkShopToExistingAccount).
// delete-account anonymizes the shop rather than leaving a dangling
// owner_id, but that still permanently removes the seller's own login to
// it — so both "Supprimer mon compte" screens (customer profile, seller
// settings) check this first and warn explicitly before the real call.
export async function fetchOwnShopForDeletionWarning(): Promise<{ shopName: string } | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data } = await supabase.from('shops').select('name').eq('owner_id', userData.user.id).maybeSingle();
  return data ? { shopName: data.name as string } : null;
}

// Same check from the seller side: deleting a seller account whose
// Supabase identity is also a customer's wipes that customer profile too
// (customer_profiles/favorites/push_subscriptions — see delete-account).
export async function ownsCustomerProfileForDeletionWarning(): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return false;
  const { data } = await supabase.from('customer_profiles').select('id').eq('id', userData.user.id).maybeSingle();
  return !!data;
}

export async function deleteMyAccount(): Promise<{ error?: string }> {
  const { data, error } = await supabase.functions.invoke(DELETE_ACCOUNT_FUNCTION_SLUG);
  if (error) {
    // On a non-2xx response, supabase-js sets `data` to null and never
    // parses the function's own JSON body — the specific error message
    // delete-account tried to send (e.g. a real DB constraint violation)
    // was silently replaced by this generic one. Reading it from the raw
    // response here is what actually surfaces the real cause.
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        if (typeof body?.error === 'string') return { error: body.error };
      } catch {
        // Body wasn't JSON — fall through to the generic message below.
      }
    }
    return { error: "Impossible de supprimer le compte. Réessayez dans quelques instants." };
  }
  if (data?.error) return { error: data.error };
  await supabase.auth.signOut();
  return {};
}
