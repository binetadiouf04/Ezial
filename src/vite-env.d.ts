/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Identifiant de la version construite (vite.config.ts) ; « dev » en développement. */
declare const __EZIAL_BUILD_ID__: string;
