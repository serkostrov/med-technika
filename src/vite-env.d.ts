/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: string
  /** Persist in-memory DB to IndexedDB/localStorage (`true`/`false`). Default: on. */
  readonly VITE_PERSIST_LOCAL_DB?: string
  /** База API на сервере (`/api`). Пусто — portable-режим без сервера. */
  readonly VITE_API_BASE?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
