// Supabase Edge Function — permanently deletes the CALLING user's own
// Supabase Auth account. Invoked directly by the frontend (customer or
// seller "Supprimer mon compte" button) with the user's own session —
// this is the only way to actually remove an auth.users row, since that
// requires the service_role key, which must never reach the browser.
//
// Deploy: supabase functions deploy delete-account
// (default JWT verification stays ON — the platform itself rejects a
// request with no valid session before this code even runs; the explicit
// getUser() check below is a second, defense-in-depth confirmation, and
// is what the userId actually comes from — never trust a client-supplied id.)
//
// Schema audit behind this (checked via pg_constraint against auth.users,
// 2026-09-21): customer_profiles.id → CASCADE (auto-removed when the user
// is deleted, nothing to do here), favorites/reviews/push_subscriptions →
// CASCADE (removed too — reviews already display as "Client Ezial", never
// tied to a visible name, so losing them isn't a privacy fix, just a side
// effect worth knowing about). orders has NO foreign key to auth.users at
// all — it can never be cascade-deleted by this, which is exactly why
// checkout snapshots the buyer's name/phone/address onto the order itself
// instead of only ever joining to the live profile. shops.owner_id also
// has no FK, so a seller's shop would otherwise survive untouched with a
// dangling owner_id — anonymized explicitly below before the user goes.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'Non authentifié.' }, 401);

  // Resolves the caller from THEIR OWN token — the only source of truth
  // for which account gets deleted.
  const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Non authentifié.' }, 401);
  const userId = userData.user.id;

  const { data: shop } = await admin.from('shops').select('id').eq('owner_id', userId).maybeSingle();
  if (shop) {
    await admin.from('shops').update({
      name: 'Boutique supprimée',
      description: null,
      phone: null,
      address_text: null,
      logo_url: null,
      cover_url: null,
      neighborhood: null,
      latitude: null,
      longitude: null,
      status: 'deleted',
    }).eq('id', shop.id);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) return json({ error: deleteError.message }, 500);

  return json({});
});
