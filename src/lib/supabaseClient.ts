import { createClient } from '@supabase/supabase-js';
import { isRefreshTokenRequestUrl } from '@/pro/sellerSessionCore';

// Centralized, frontend-only Supabase client.
//
// Only the public URL and the anon/publishable key belong here — both are
// safe to ship in the browser bundle because access is enforced by RLS
// policies on the database side. The service_role key must NEVER be read,
// stored, or referenced from frontend code.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isConfigured) {
  // Non-fatal: the mock catalog still works without Supabase configured.
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
    'Copy .env.example to .env.local and fill in your project values to enable Supabase calls.',
  );
}

// createClient() throws synchronously if given an empty/invalid URL, which
// would crash the whole app at import time on any deploy without the env
// vars set (e.g. this GitHub Pages build has no Supabase secrets yet). Fall
// back to a harmless placeholder so the app keeps rendering; real calls will
// then fail at request time with a normal, catchable network/DNS error.
//
// Session (21 nov. 2026) : réglages par défaut de supabase-js, écrits ici pour qu'on ne
// les change pas par mégarde — session gardée dans localStorage et renouvelée
// automatiquement. Ne JAMAIS changer la clé de stockage (storageKey) : toutes les
// personnes connectées seraient déconnectées.
//
// Renouvellement du jeton : supabase-js efface la session (déconnexion) quand le
// serveur d'authentification répond 500 à un renouvellement, alors qu'il la garde pour
// 502/503/504. Un 500 y est pourtant une panne passagère du serveur (journaux Supabase
// du 19 nov. 2026 : « error finding refresh token: failed to connect … operation was
// canceled », suivi d'une reconnexion forcée). Il est donc présenté comme un 503 : la
// session est gardée et le renouvellement refait. Un vrai refus (jeton révoqué,
// session expirée : réponses 4xx) déconnecte toujours.
const resilientFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (response.status !== 500) return response;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!isRefreshTokenRequestUrl(url)) return response;
  return new Response(await response.text(), { status: 503, statusText: 'Service Unavailable', headers: response.headers });
};

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { fetch: resilientFetch },
  },
);
