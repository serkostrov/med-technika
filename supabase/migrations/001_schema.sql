-- Migration 001: schema + RLS stubs (ТЗ §4–5, §13, §16)
-- Целевая БД: Postgres (Supabase self-hosted).
-- Текущий runtime приложения — portable in-memory Database;
-- эта миграция фиксирует контракт для production-развёртывания.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE,
  full_name text NOT NULL,
  short_name text NOT NULL,
  surname text NOT NULL,
  fgis_id_full_name integer,
  post_name text,
  fgis_role_ids integer[] NOT NULL DEFAULT '{}',
  app_role text NOT NULL CHECK (app_role IN ('head', 'engineer')),
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind_id integer NOT NULL,
  name text NOT NULL,
  name_aliases text[] NOT NULL DEFAULT '{}',
  inn text,
  ogrn text,
  phone text,
  email text,
  address text,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS oa_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('current', 'extension')),
  is_active boolean NOT NULL DEFAULT true,
  source_file text,
  loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oa_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES oa_editions(id),
  item_no text NOT NULL,
  methodik_text text,
  methodik_fgis_id integer,
  method_text text,
  method_fgis_id integer,
  object_type text,
  indicator_text text NOT NULL,
  indicator_fgis_id text,
  unit_text text,
  unit_fgis_id text,
  range_text text,
  range_min numeric,
  range_max numeric,
  is_calculated boolean NOT NULL DEFAULT false,
  object_name text,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS units (
  fgis_id text PRIMARY KEY,
  name text,
  symbol text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS unit_conversions (
  from_symbol text NOT NULL,
  to_symbol text NOT NULL,
  factor numeric NOT NULL,
  PRIMARY KEY (from_symbol, to_symbol)
);

CREATE TABLE IF NOT EXISTS equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  serial_no text,
  serial_norm text,
  inv_no text,
  fgis_equipment_id integer UNIQUE,
  kind text NOT NULL CHECK (kind IN ('si', 'aux', 'test')),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS equipment_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES equipment(id),
  certificate_no text,
  verified_on date,
  valid_until date,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS measurement_kinds (
  id integer PRIMARY KEY,
  title text NOT NULL,
  suffix text
);

CREATE TABLE IF NOT EXISTS protocol_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind_id integer REFERENCES measurement_kinds(id),
  template_file text,
  sheet_name text NOT NULL,
  title text NOT NULL,
  parser_profile text NOT NULL,
  status text NOT NULL,
  type_object_id integer,
  fgis_directory text,
  conditions_limits jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS form_indicator_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES protocol_forms(id),
  source_key text NOT NULL,
  oa_item_id uuid NOT NULL REFERENCES oa_items(id),
  ub jsonb,
  UNIQUE (form_id, source_key)
);

CREATE TABLE IF NOT EXISTS protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL,
  protocol_date date NOT NULL,
  form_id uuid NOT NULL REFERENCES protocol_forms(id),
  status text NOT NULL CHECK (status IN ('review','approved','ready','exported','sent')),
  customer_id uuid REFERENCES customers(id),
  engineer_staff_id uuid REFERENCES staff(id),
  uploaded_by uuid REFERENCES staff(id),
  approved_by uuid REFERENCES staff(id),
  approved_at timestamptz,
  measure_start date,
  measure_end date,
  application_date date,
  object_full_name text,
  place_address text,
  accred_scope_353 boolean,
  scan_path text,
  source_path text NOT NULL,
  source_sha256 text NOT NULL,
  raw jsonb,
  deleted_at timestamptz,
  UNIQUE (number, protocol_date)
);

CREATE TABLE IF NOT EXISTS protocol_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id uuid NOT NULL REFERENCES protocols(id),
  seq integer,
  name text,
  serial_no text,
  year integer,
  department text
);

CREATE TABLE IF NOT EXISTS protocol_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id uuid NOT NULL REFERENCES protocols(id),
  object_id uuid REFERENCES protocol_objects(id),
  seq integer NOT NULL,
  source_key text,
  indicator_text text,
  set_value text,
  samples jsonb,
  avg_excel numeric,
  u_excel numeric,
  fact_value text,
  unit_symbol text,
  oa_item_id uuid REFERENCES oa_items(id),
  include_in_xml boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS protocol_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id uuid NOT NULL REFERENCES protocols(id),
  equipment_id uuid REFERENCES equipment(id),
  role text,
  name_from_protocol text,
  serial_from_protocol text
);

CREATE TABLE IF NOT EXISTS protocol_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id uuid NOT NULL REFERENCES protocols(id),
  code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('error','warning')),
  message text NOT NULL,
  ref jsonb,
  acknowledged_by uuid REFERENCES staff(id),
  acknowledged_at timestamptz,
  ack_comment text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fgis_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path text NOT NULL,
  file_size bigint,
  protocols_count integer,
  created_by uuid REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  uploaded_marked_by uuid REFERENCES staff(id),
  uploaded_marked_at timestamptz
);

CREATE TABLE IF NOT EXISTS fgis_export_items (
  export_id uuid NOT NULL REFERENCES fgis_exports(id),
  protocol_id uuid NOT NULL REFERENCES protocols(id),
  PRIMARY KEY (export_id, protocol_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  entity text NOT NULL,
  entity_id text,
  action text NOT NULL,
  actor uuid,
  at timestamptz NOT NULL DEFAULT now(),
  diff jsonb
);

CREATE TABLE IF NOT EXISTS fsa_entries (
  id text NOT NULL,
  catalog text NOT NULL,
  name text,
  is_actual boolean NOT NULL DEFAULT true,
  PRIMARY KEY (catalog, id)
);

-- Security helpers (ТЗ §5)
CREATE OR REPLACE FUNCTION current_staff_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.staff_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION is_head() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff s
    WHERE s.id = current_staff_id() AND s.app_role = 'head' AND s.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION is_engineer() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff s
    WHERE s.id = current_staff_id() AND s.app_role = 'engineer' AND s.deleted_at IS NULL
  );
$$;

ALTER TABLE protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS protocols_select ON protocols;
CREATE POLICY protocols_select ON protocols FOR SELECT USING (
  deleted_at IS NULL AND (
    is_head() OR uploaded_by = current_staff_id() OR engineer_staff_id = current_staff_id()
  )
);

-- Запрет прямого UPDATE status: только через RPC (security definer).
DROP POLICY IF EXISTS protocols_update_no_status ON protocols;
CREATE POLICY protocols_update_no_status ON protocols FOR UPDATE USING (
  is_head() OR uploaded_by = current_staff_id() OR engineer_staff_id = current_staff_id()
) WITH CHECK (
  status = (SELECT p.status FROM protocols p WHERE p.id = protocols.id)
  OR current_setting('app.allow_status_rpc', true) = 'on'
);

COMMIT;
