// Supabase Edge Function — first-login PIN creation for a driver account
// that was provisioned with pin_setup_required = true. Requires the
// one-time activation code an admin generated for this driver
// (admin_issue_driver_activation_code), so knowing a new driver's username
// is never enough to choose their PIN. Hashes the PIN server-side
// (set_driver_pin RPC, pgcrypto) and, on success, exchanges it for a real
// Supabase Auth session token via the Admin API's generateLink — the
// frontend never learns the driver's technical email, only a one-time
// token_hash to redeem with supabase.auth.verifyOtp().
//
// Deployed in this project under the slug "swift-processor".
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

const PIN_PATTERN = /^\d{6}$/;
const INVALID_CODE_ERROR = "Nom d'utilisateur ou code d'activation incorrect (ou code expiré). Demandez un nouveau code à un administrateur Ezial si besoin.";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let body: { username?: string; pin?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Requête invalide.' }, 400);
  }

  const username = (body.username ?? '').trim();
  const pin = body.pin ?? '';
  const code = (body.code ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!username) return json({ error: "Nom d'utilisateur requis." }, 400);
  if (code.length !== 8) return json({ error: "Saisissez le code d'activation à 8 caractères remis par Ezial." }, 400);
  if (!PIN_PATTERN.test(pin)) return json({ error: 'Le NIP doit comporter exactement 6 chiffres.' }, 400);

  // set_driver_pin() refuses (empty result) if the account doesn't exist,
  // isn't a driver, is suspended, already has a PIN, or if the code is
  // wrong or expired — each failure counts toward a 15-minute lockout after
  // 5 attempts (it then raises with the message shown below).
  const { data, error } = await admin.rpc('set_driver_pin', { p_username: username, p_pin: pin, p_setup_code: code });
  if (error) return json({ error: error.code === 'P0001' ? error.message : 'Impossible de créer le NIP. Réessayez.' }, 400);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.email) return json({ error: INVALID_CODE_ERROR }, 400);

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: row.email });
  if (linkError || !link) return json({ error: 'Connexion impossible après création du NIP.' }, 500);

  return json({ tokenHash: link.properties.hashed_token });
});
