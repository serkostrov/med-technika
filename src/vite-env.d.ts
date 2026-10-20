/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: string
  /** Persist in-memory DB to localStorage (`true`/`false`). Default: on. */
  readonly VITE_PERSIST_LOCAL_DB?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
