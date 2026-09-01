import { createClient } from '@supabase/supabase-js';

// Centralized, frontend-only Supabase client.
//
// Only the public URL and the anon/publishable key belong here — both are
// safe to ship in the browser bundle because access is enforced by RLS
// policies on the database side. The service_role key must NEVER be read,
// stored, or referenced from frontend code.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Non-fatal: the mock catalog still works without Supabase configured.
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
    'Copy .env.example to .env.local and fill in your project values to enable Supabase calls.',
  );
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');
