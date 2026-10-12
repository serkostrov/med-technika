-- Dev/bootstrap auth accounts (PBKDF2 hashes from src/server/auth/password.ts)
-- Emails: head@il.local / engineer@il.local
-- ONLY for local/staging. Rotate passwords before production.

INSERT INTO auth_accounts (
  id, email, password_hash, staff_id, created_by, created_at, is_active
) VALUES
  (
    '55555555-5555-4555-8555-555555555501',
    'head@il.local',
    '0123456789abcdef0123456789abcdef:4c9fe5328ef1e99c09f2e51ca66e93e657acd780fb8de9ec3f54b1bbea0ef41bc012e116f35f27bd05fdc5026481dc4f3b499713707564536bb662258cffaa00',
    '11111111-1111-4111-8111-111111111101',
    NULL,
    '2026-10-04T00:00:00.000Z',
    TRUE
  ),
  (
    '55555555-5555-4555-8555-555555555502',
    'engineer@il.local',
    'fedcba9876543210fedcba9876543210:10d20a88db5a01311a50752e990f78317adf2dfada20e418099c135d01486ca2d89e428ff42e595812d2d0b5f1bfebda04a16ae40191f3cf8e6eae0953addeff',
    '11111111-1111-4111-8111-111111111102',
    '11111111-1111-4111-8111-111111111101',
    '2026-10-04T00:00:00.000Z',
    TRUE
  )
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  staff_id = EXCLUDED.staff_id,
  is_active = EXCLUDED.is_active;

UPDATE staff SET auth_user_id = '55555555-5555-4555-8555-555555555501'
WHERE id = '11111111-1111-4111-8111-111111111101';

UPDATE staff SET auth_user_id = '55555555-5555-4555-8555-555555555502'
WHERE id = '11111111-1111-4111-8111-111111111102';
