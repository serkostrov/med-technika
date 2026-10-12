/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: string
  /** Persist in-memory DB to sessionStorage (`true`/`false`). Default: on in dev, off in production. */
  readonly VITE_PERSIST_LOCAL_DB?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
