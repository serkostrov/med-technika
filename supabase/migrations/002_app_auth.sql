-- Migration 002: app auth tables + measurement_kinds.code
-- Согласовано с src/server/auth/types.ts и in-memory Database.

BEGIN;

ALTER TABLE measurement_kinds
  ADD COLUMN IF NOT EXISTS code text;

UPDATE measurement_kinds SET code = id::text WHERE code IS NULL;

ALTER TABLE measurement_kinds
  ALTER COLUMN code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS measurement_kinds_code_uidx
  ON measurement_kinds (code);

CREATE TABLE IF NOT EXISTS auth_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  staff_id uuid NOT NULL REFERENCES staff(id),
  created_by uuid REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS app_sessions (
  token text PRIMARY KEY,
  auth_user_id uuid NOT NULL REFERENCES auth_accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS app_sessions_auth_user_idx
  ON app_sessions (auth_user_id);

CREATE INDEX IF NOT EXISTS app_sessions_expires_idx
  ON app_sessions (expires_at);

-- Storage buckets are managed outside SQL (Supabase Storage / S3).
-- Expected bucket names: protocol-sources, protocol-scans, fgis-exports

COMMIT;
