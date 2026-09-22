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
// Schema re-audited 2026-09-22 via pg_constraint/information_schema — the
// prior comment here was wrong on several points:
// - customer_profiles, favorites and push_subscriptions have NO foreign key
//   to auth.users at all, so they are never auto-removed. Explicitly
//   deleted below to avoid leaving personal data (name/phone/address on
//   customer_profiles) orphaned forever.
// - reviews are deliberately left alone: they already display as "Client
//   Ezial" (never tied to a visible name), and deleting them would also
//   remove public product feedback other shoppers rely on. Keeping an
//   anonymized review vs. deleting it entirely is a product decision, not
//   a privacy requirement here.
// - orders has NO foreign key to auth.users either — it can never be
//   cascade-deleted, which is exactly why checkout snapshots the buyer's
//   name/phone/address onto the order itself instead of only ever joining
//   to the live profile.
// - shops.owner_id -> profiles.id is CASCADE, and profiles.id itself
//   cascades from auth.users on the standard Supabase signup trigger —
//   deleting the auth user would therefore cascade-delete the shop (and
//   with it every product/variant/image/seller_transaction) right after
//   the anonymization below, or fail outright if the shop still has
//   orders (order_shops.shop_id -> shops.id is NO ACTION). Fixed at the
//   schema level (see the accompanying migration that changes this FK to
//   ON DELETE SET NULL) so the anonymized shop survives instead.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Called directly from the browser (supabase.functions.invoke), unlike
// send-push (server-to-server via a trigger) — without these headers the
// browser blocks the response entirely before our code's own error
// handling ever gets a chance to run, which is exactly what surfaced as
// the generic "Impossible de supprimer le compte" message.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

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

  // Best-effort personal-data cleanup for tables with no FK to auth.users
  // (see the audit note above) — none of these block account deletion if
  // one fails, since the account removal itself is what matters most.
  await admin.from('customer_profiles').delete().eq('id', userId);
  await admin.from('favorites').delete().eq('user_id', userId);
  await admin.from('push_subscriptions').delete().eq('user_id', userId);

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) return json({ error: deleteError.message }, 500);

  return json({});
});
