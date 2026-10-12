-- Generated from src/data/seed/staff.ts + bootstrap Gromov

INSERT INTO staff (
  id, auth_user_id, full_name, short_name, surname,
  fgis_id_full_name, post_name, fgis_role_ids, app_role, is_active, deleted_at
) VALUES
  (
    '11111111-1111-4111-8111-111111111101',
    NULL,
    'Садаков А.А.',
    'Садаков А.А.',
    'Садаков',
    175409,
    'Руководитель',
    ARRAY[2]::integer[],
    'head',
    TRUE,
    NULL
  ),
  (
    '11111111-1111-4111-8111-111111111102',
    NULL,
    'Судницын Алексей Владимирович',
    'Судницын А.В.',
    'Судницын',
    319815,
    'Испытатель',
    ARRAY[1]::integer[],
    'engineer',
    TRUE,
    NULL
  ),
  (
    '11111111-1111-4111-8111-111111111103',
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
