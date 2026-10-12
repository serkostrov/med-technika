/**
 * Генерирует SQL seed из TypeScript-справочников.
 * Запуск: npm run seed:sql
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  SEED_FORM_INDICATOR_MAPS,
  SEED_MEASUREMENT_KINDS,
  SEED_OA_EDITIONS,
  SEED_OA_ITEMS,
  SEED_PROTOCOL_FORMS,
  SEED_SETTINGS,
  SEED_STAFF,
  SEED_UNIT_CONVERSIONS,
  SEED_UNITS,
} from '@/data/seed'
import { SeedIds } from '@/data/ids'
import { SeedCredentials, SeedIdsExt } from '@/server/bootstrap'
import { hashPasswordDeterministic } from '@/server/auth/password'

/** Фиксированные соли — стабильный git diff при npm run seed:sql. */
const SEED_SALT_HEAD = '0123456789abcdef0123456789abcdef'
const SEED_SALT_ENG = 'fedcba9876543210fedcba9876543210'

const OUT = path.resolve(import.meta.dirname, '../../../supabase/seed')

function sqlStr(v: string | null | undefined): string {
  if (v == null) return 'NULL'
  return `'${v.replace(/'/g, "''")}'`
}

function sqlJson(v: unknown): string {
  if (v == null) return 'NULL'
  return `${sqlStr(JSON.stringify(v))}::jsonb`
}

function sqlNum(v: number | null | undefined): string {
  if (v == null) return 'NULL'
  return String(v)
}

function sqlBool(v: boolean): string {
  return v ? 'TRUE' : 'FALSE'
}

function sqlIntArray(xs: readonly number[]): string {
  if (xs.length === 0) return `'{}'::integer[]`
  return `ARRAY[${xs.join(',')}]::integer[]`
}

describe('generate supabase seed SQL', () => {
  it('writes seed files from TypeScript sources', async () => {
    mkdirSync(OUT, { recursive: true })

    const headHash = await hashPasswordDeterministic(
      SeedCredentials.head.password,
      SEED_SALT_HEAD,
    )
    const engHash = await hashPasswordDeterministic(
      SeedCredentials.engineer.password,
      SEED_SALT_ENG,
    )

    const settings = `-- Generated from src/data/seed/settings.ts — do not edit by hand
-- npm run seed:sql

INSERT INTO settings (key, value) VALUES
${SEED_SETTINGS.map((s) => `  (${sqlStr(s.key)}, ${sqlJson(s.value)})`).join(',\n')}
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
`

    const staff = `-- Generated from src/data/seed/staff.ts + bootstrap Gromov

INSERT INTO staff (
  id, auth_user_id, full_name, short_name, surname,
  fgis_id_full_name, post_name, fgis_role_ids, app_role, is_active, deleted_at
) VALUES
${SEED_STAFF.map(
  (s) => `  (
    ${sqlStr(s.id)},
    NULL,
    ${sqlStr(s.fullName)},
    ${sqlStr(s.shortName)},
    ${sqlStr(s.surname)},
    ${sqlNum(s.fgisIdFullName)},
    ${sqlStr(s.postName)},
    ${sqlIntArray(s.fgisRoleIds)},
    ${sqlStr(s.appRole)},
    ${sqlBool(s.isActive)},
    NULL
  )`,
).join(',\n')},
  (
    ${sqlStr(SeedIdsExt.staffGromov)},
    NULL,
    'Громов',
    'Громов',
    'Громов',
    NULL,
    'Испытатель',
    ARRAY[1]::integer[],
    'engineer',
    TRUE,
    NULL
  )
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  short_name = EXCLUDED.short_name,
  surname = EXCLUDED.surname,
  fgis_id_full_name = EXCLUDED.fgis_id_full_name,
  post_name = EXCLUDED.post_name,
  fgis_role_ids = EXCLUDED.fgis_role_ids,
  app_role = EXCLUDED.app_role,
  is_active = EXCLUDED.is_active;
`

    const units = `-- Generated from src/data/seed/units.ts

INSERT INTO units (fgis_id, name, symbol) VALUES
${SEED_UNITS.map((u) => `  (${sqlStr(u.fgisId)}, ${sqlStr(u.name)}, ${sqlStr(u.symbol)})`).join(',\n')}
ON CONFLICT (fgis_id) DO UPDATE SET name = EXCLUDED.name, symbol = EXCLUDED.symbol;

INSERT INTO unit_conversions (from_symbol, to_symbol, factor) VALUES
${SEED_UNIT_CONVERSIONS.map(
  (c) => `  (${sqlStr(c.fromSymbol)}, ${sqlStr(c.toSymbol)}, ${c.factor})`,
).join(',\n')}
ON CONFLICT (from_symbol, to_symbol) DO UPDATE SET factor = EXCLUDED.factor;
`

    const kinds = `-- Generated from src/data/seed/measurement-kinds.ts

INSERT INTO measurement_kinds (id, code, title, suffix) VALUES
${SEED_MEASUREMENT_KINDS.map(
  (k) =>
    `  (${k.id}, ${sqlStr(k.code)}, ${sqlStr(k.title)}, ${sqlStr(k.suffix)})`,
).join(',\n')}
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  title = EXCLUDED.title,
  suffix = EXCLUDED.suffix;
`

    const oa = `-- Generated from src/data/seed/oa.ts

INSERT INTO oa_editions (id, title, kind, is_active, source_file, loaded_at) VALUES
${SEED_OA_EDITIONS.map(
  (e) =>
    `  (${sqlStr(e.id)}, ${sqlStr(e.title)}, ${sqlStr(e.kind)}, ${sqlBool(e.isActive)}, ${sqlStr(e.sourceFile)}, ${sqlStr(e.loadedAt)})`,
).join(',\n')}
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  kind = EXCLUDED.kind,
  is_active = EXCLUDED.is_active,
  source_file = EXCLUDED.source_file,
  loaded_at = EXCLUDED.loaded_at;

INSERT INTO oa_items (
  id, edition_id, item_no, methodik_text, methodik_fgis_id,
  method_text, method_fgis_id, object_type, indicator_text, indicator_fgis_id,
  unit_text, unit_fgis_id, range_text, range_min, range_max,
  is_calculated, object_name, deleted_at
) VALUES
${SEED_OA_ITEMS.map(
  (i) => `  (
    ${sqlStr(i.id)},
    ${sqlStr(i.editionId)},
    ${sqlStr(i.itemNo)},
    ${sqlStr(i.methodikText)},
    ${sqlNum(i.methodikFgisId)},
    ${sqlStr(i.methodText)},
    ${sqlNum(i.methodFgisId)},
    ${sqlStr(i.objectType)},
    ${sqlStr(i.indicatorText)},
    ${sqlStr(i.indicatorFgisId)},
    ${sqlStr(i.unitText)},
    ${sqlStr(i.unitFgisId)},
    ${sqlStr(i.rangeText)},
    ${sqlNum(i.rangeMin)},
    ${sqlNum(i.rangeMax)},
    ${sqlBool(i.isCalculated)},
    ${sqlStr(i.objectName)},
    NULL
  )`,
).join(',\n')}
ON CONFLICT (id) DO UPDATE SET
  edition_id = EXCLUDED.edition_id,
  item_no = EXCLUDED.item_no,
  indicator_text = EXCLUDED.indicator_text,
  unit_text = EXCLUDED.unit_text,
  unit_fgis_id = EXCLUDED.unit_fgis_id;
`

    const forms = `-- Generated from src/data/seed/protocol-forms.ts

INSERT INTO protocol_forms (
  id, kind_id, template_file, sheet_name, title, parser_profile,
  status, type_object_id, fgis_directory, conditions_limits, settings
) VALUES
${SEED_PROTOCOL_FORMS.map(
  (f) => `  (
    ${sqlStr(f.id)},
    ${sqlNum(f.kindId)},
    ${sqlStr(f.templateFile)},
    ${sqlStr(f.sheetName)},
    ${sqlStr(f.title)},
    ${sqlStr(f.parserProfile)},
    ${sqlStr(f.status)},
    ${sqlNum(f.typeObjectId)},
    ${sqlStr(f.fgisDirectory)},
    ${sqlJson(f.conditionsLimits)},
    ${sqlJson(f.settings)}
  )`,
).join(',\n')}
ON CONFLICT (id) DO UPDATE SET
  kind_id = EXCLUDED.kind_id,
  sheet_name = EXCLUDED.sheet_name,
  title = EXCLUDED.title,
  parser_profile = EXCLUDED.parser_profile,
  status = EXCLUDED.status,
  settings = EXCLUDED.settings;
`

    const maps = `-- Generated from src/data/seed/oa.ts (form_indicator_map)

INSERT INTO form_indicator_map (id, form_id, source_key, oa_item_id, ub) VALUES
${SEED_FORM_INDICATOR_MAPS.map(
  (m) =>
    `  (${sqlStr(m.id)}, ${sqlStr(m.formId)}, ${sqlStr(m.sourceKey)}, ${sqlStr(m.oaItemId)}, ${sqlJson(m.ub)})`,
).join(',\n')}
ON CONFLICT (id) DO UPDATE SET
  form_id = EXCLUDED.form_id,
  source_key = EXCLUDED.source_key,
  oa_item_id = EXCLUDED.oa_item_id,
  ub = EXCLUDED.ub;
`

    const auth = `-- Dev/bootstrap auth accounts (PBKDF2 hashes from src/server/auth/password.ts)
-- Emails: ${SeedCredentials.head.email} / ${SeedCredentials.engineer.email}
-- ONLY for local/staging. Rotate passwords before production.

INSERT INTO auth_accounts (
  id, email, password_hash, staff_id, created_by, created_at, is_active
) VALUES
  (
    ${sqlStr(SeedIdsExt.authHead)},
    ${sqlStr(SeedCredentials.head.email)},
    ${sqlStr(headHash)},
    ${sqlStr(SeedIds.staffSadakov)},
    NULL,
    '2026-10-04T00:00:00.000Z',
    TRUE
  ),
  (
    ${sqlStr(SeedIdsExt.authEngineer)},
    ${sqlStr(SeedCredentials.engineer.email)},
    ${sqlStr(engHash)},
    ${sqlStr(SeedIds.staffSudnitsyn)},
    ${sqlStr(SeedIds.staffSadakov)},
    '2026-10-04T00:00:00.000Z',
    TRUE
  )
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  staff_id = EXCLUDED.staff_id,
  is_active = EXCLUDED.is_active;

UPDATE staff SET auth_user_id = ${sqlStr(SeedIdsExt.authHead)}
WHERE id = ${sqlStr(SeedIds.staffSadakov)};

UPDATE staff SET auth_user_id = ${sqlStr(SeedIdsExt.authEngineer)}
WHERE id = ${sqlStr(SeedIds.staffSudnitsyn)};
`

    const files: Record<string, string> = {
      '001_settings.sql': settings,
      '002_staff.sql': staff,
      '003_units.sql': units,
      '004_measurement_kinds.sql': kinds,
      '005_oa.sql': oa,
      '006_protocol_forms.sql': forms,
      '007_form_indicator_maps.sql': maps,
      '008_auth_accounts.dev.sql': auth,
    }

    for (const [name, body] of Object.entries(files)) {
      writeFileSync(path.join(OUT, name), body, 'utf8')
    }

    expect(SEED_PROTOCOL_FORMS.length).toBeGreaterThan(20)
    expect(SEED_UNITS.length).toBeGreaterThan(0)
  })
})
