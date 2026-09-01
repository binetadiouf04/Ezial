#!/usr/bin/env node
// Standalone connectivity check — mirrors src/lib/supabaseHealthCheck.ts but
// runs outside Vite (plain Node), so it reads .env.local by hand instead of
// import.meta.env. Usage: npm run check:supabase
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

function loadEnvLocal() {
  const path = fileURLToPath(new URL('../.env.local', import.meta.url));
  if (!existsSync(path)) return {};
  const env = {};
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const fileEnv = loadEnvLocal();
const url = process.env.VITE_SUPABASE_URL ?? fileEnv.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? fileEnv.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
  console.error('Copy .env.example to .env.local and fill in your project values, then re-run.');
  process.exit(1);
}

const supabase = createClient(url, anonKey);

const [shops, products] = await Promise.all([
  supabase.from('shops').select('id', { count: 'exact', head: true }),
  supabase.from('products').select('id', { count: 'exact', head: true }),
]);

console.log('public.shops   :', shops.error ? `ERROR — ${shops.error.message}` : `OK — ${shops.count} row(s) readable`);
console.log('public.products:', products.error ? `ERROR — ${products.error.message}` : `OK — ${products.count} row(s) readable`);

if (shops.error || products.error) {
  console.error('\nSupabase connection check FAILED.');
  process.exit(1);
}

console.log('\nSupabase connection OK — frontend can read shops and products under the current RLS policies.');
