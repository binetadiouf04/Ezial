import { createClient } from '@supabase/supabase-js';

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
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
);
