import { AppRole } from '@/domain'
import { SeedIds } from '@/data/ids'
import { createEmptyDatabase, type Database } from '@/server/db/database'
import { hashPassword } from '@/server/auth/password'
import { SecureApi } from '@/server/rpc/secure-api'

/** Тестовые пароли только для локального/тестового bootstrap. */
export const SeedCredentials = {
  head: { email: 'head@il.local', password: 'head-test-password' },
  engineer: { email: 'engineer@il.local', password: 'engineer-test-password' },
} as const

export const SeedIdsExt = {
  ...SeedIds,
  staffGromov: '11111111-1111-4111-8111-111111111103',
  authHead: '55555555-5555-4555-8555-555555555501',
  authEngineer: '55555555-5555-4555-8555-555555555502',
} as const

/**
 * Серверная БД + API с seed-учётками.
 * Громов — персонал ФГИС без учётной записи (ТЗ §4).
 */
export async function bootstrapServer(): Promise<{
  db: Database
  api: SecureApi
}> {
  const db = createEmptyDatabase()

  db.staff.push({
    id: SeedIdsExt.staffGromov,
    authUserId: null,
    fullName: 'Громов',
    shortName: 'Громов',
    surname: 'Громов',
    fgisIdFullName: null,
    postName: 'Испытатель',
    fgisRoleIds: [1],
    appRole: AppRole.engineer,
    isActive: true,
    deletedAt: null,
  })

  db.authAccounts.push(
    {
      id: SeedIdsExt.authHead,
      email: SeedCredentials.head.email,
      passwordHash: await hashPassword(SeedCredentials.head.password),
      staffId: SeedIds.staffSadakov,
      createdBy: null,
      createdAt: '2026-10-04T00:00:00.000Z',
      isActive: true,
    },
    {
      id: SeedIdsExt.authEngineer,
      email: SeedCredentials.engineer.email,
      passwordHash: await hashPassword(SeedCredentials.engineer.password),
      staffId: SeedIds.staffSudnitsyn,
      createdBy: SeedIds.staffSadakov,
      createdAt: '2026-10-04T00:00:00.000Z',
      isActive: true,
    },
  )

  const head = db.staff.find((s) => s.id === SeedIds.staffSadakov)
  const engineer = db.staff.find((s) => s.id === SeedIds.staffSudnitsyn)
  if (head) head.authUserId = SeedIdsExt.authHead
  if (engineer) engineer.authUserId = SeedIdsExt.authEngineer

  return { db, api: new SecureApi(db) }
}
