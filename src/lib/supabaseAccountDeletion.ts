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
