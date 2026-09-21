import { supabase } from './supabaseClient';

// Real, permanent account deletion — calls the delete-account Edge
// Function (see supabase/functions/delete-account/index.ts), the only
// place allowed to hold the service_role key needed to actually remove an
// auth.users row. The frontend can only anonymize what RLS lets it touch
// on its own row; it can never delete the account itself.
export async function deleteMyAccount(): Promise<{ error?: string }> {
  const { data, error } = await supabase.functions.invoke('delete-account');
  if (error) return { error: "Impossible de supprimer le compte. Réessayez dans quelques instants." };
  if (data?.error) return { error: data.error };
  await supabase.auth.signOut();
  return {};
}
