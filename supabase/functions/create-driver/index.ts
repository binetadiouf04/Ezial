// Supabase Edge Function — admin-only: creates a real driver account
// (auth.users + profiles) from just a username, so the driver never sees
// or handles an email/password. Mirrors delete-account's structure: the
// service_role key lives here only, never in the frontend.
//
// Deploy: supabase functions deploy create-driver
// Requires the migration that adds profiles.username/pin_hash/
// pin_setup_required/is_suspended (and the sensitive-fields protection
// trigger) to already be applied.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// 4–32 chars, letters/digits/./_/- , no spaces — matches the spec exactly.
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{4,32}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'Non authentifié.' }, 401);

  // Resolves the caller from THEIR OWN token, then requires real admin
  // membership — never trust a client-supplied role/flag.
  const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Non authentifié.' }, 401);

  const { data: adminRow } = await admin.from('admins').select('user_id').eq('user_id', userData.user.id).maybeSingle();
  if (!adminRow) return json({ error: 'Accès refusé.' }, 403);

  let body: { firstName?: string; lastName?: string; username?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Requête invalide.' }, 400);
  }

  const firstName = (body.firstName ?? '').trim();
  const lastName = (body.lastName ?? '').trim();
  const username = (body.username ?? '').trim();
  const phone = (body.phone ?? '').trim() || null;

  if (!firstName) return json({ error: 'Le prénom est obligatoire.' }, 400);
  if (!USERNAME_PATTERN.test(username)) {
    return json({ error: "Nom d'utilisateur invalide (4 à 32 caractères : lettres, chiffres, points, tirets ou underscores, sans espace)." }, 400);
  }

  // Case-insensitive uniqueness — Moussa01 and moussa01 are the same account.
  const normalizedUsername = username.toLowerCase();
  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .ilike('username', normalizedUsername)
    .maybeSingle();
  if (existing) return json({ error: "Ce nom d'utilisateur est déjà utilisé." }, 409);

  // Technical, never-delivered identity — same internal-domain convention
  // already used for sellers (sellers.ezial.internal is a real domain seen
  // in auth.users). Never shown to the driver, never used as their UX
  // identifier, never a real deliverable mailbox.
  const technicalEmail = `driver.${crypto.randomUUID()}@drivers.ezial.internal`;
  // Required by the Auth API but functionally irrelevant: the driver only
  // ever authenticates via username+PIN → magic-link exchange (see
  // driver-login), never with this password. Generated and discarded here,
  // never logged, never stored anywhere else.
  const throwawayPassword = crypto.randomUUID() + crypto.randomUUID();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: technicalEmail,
    password: throwawayPassword,
    email_confirm: true,
  });
  if (createError || !created.user) return json({ error: createError?.message ?? 'Création du compte impossible.' }, 500);

  // handle_new_auth_user() already inserted a default profiles row (role
  // defaults to 'customer') — overwrite it with the real driver identity.
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      role: 'driver',
      username: normalizedUsername,
      first_name: firstName,
      last_name: lastName || null,
      phone,
      pin_setup_required: true,
      is_suspended: false,
    })
    .eq('id', created.user.id);

  if (profileError) {
    // Never leave a half-created, unmanageable auth user behind.
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: profileError.message }, 500);
  }

  return json({ id: created.user.id, username: normalizedUsername, firstName, lastName });
});
