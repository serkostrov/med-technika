-- Generated from src/data/seed/settings.ts — do not edit by hand
-- npm run seed:sql

INSERT INTO settings (key, value) VALUES
  ('lab_address_id', '766884'::jsonb),
  ('approver_staff_id', '"11111111-1111-4111-8111-111111111101"'::jsonb),
  ('recalc_tolerance', '0.000001'::jsonb),
  ('severity_overrides', '{}'::jsonb),
  ('lab_address_text', '"пер. Искожевский, 16"'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
