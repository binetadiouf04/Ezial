// Supabase Edge Function — normal driver login (username + PIN already
// set). Verifies the PIN server-side (verify_driver_pin RPC, which also
// enforces the 5-attempt/15-minute lockout), then exchanges it for a real
// Supabase Auth session token the same way driver-set-pin does — never
// exposes the driver's technical email to the frontend.
//
// Deploy: supabase functions deploy driver-login
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let body: { username?: string; pin?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Requête invalide.' }, 400);
  }

  const username = (body.username ?? '').trim();
  const pin = body.pin ?? '';
  if (!username || !pin) return json({ error: 'Identifiants requis.' }, 400);

  const { data, error } = await admin.rpc('verify_driver_pin', { p_username: username, p_pin: pin });
  // The RPC raises an exception only for the lockout case (too many
  // attempts) — everything else (wrong PIN, unknown username, suspended)
  // comes back as an empty result, kept as one generic message below so a
  // caller can't tell which case it hit.
  if (error) return json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' }, 429);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.email) return json({ error: "Nom d'utilisateur ou NIP incorrect." }, 401);

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: row.email });
  if (linkError || !link) return json({ error: 'Connexion impossible.' }, 500);

  return json({ tokenHash: link.properties.hashed_token });
});
