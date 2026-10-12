import type { Staff } from '@/domain'
import { AppRole } from '@/domain'
import { SeedIds } from '@/data/ids'

/**
 * Персонал из ТЗ (эталоны + роли).
 * Учётные записи Auth создаются отдельно на экране «Пользователи».
 */
export const SEED_STAFF: readonly Staff[] = [
  {
    id: SeedIds.staffSadakov,
    authUserId: null,
    fullName: 'Садаков А.А.',
    shortName: 'Садаков А.А.',
    surname: 'Садаков',
    fgisIdFullName: 175409,
    postName: 'Руководитель',
    fgisRoleIds: [2],
    appRole: AppRole.head,
    isActive: true,
    deletedAt: null,
  },
  {
    id: SeedIds.staffSudnitsyn,
    authUserId: null,
    fullName: 'Судницын Алексей Владимирович',
    shortName: 'Судницын А.В.',
    surname: 'Судницын',
    fgisIdFullName: 319815,
    postName: 'Испытатель',
    fgisRoleIds: [1],
    appRole: AppRole.engineer,
    isActive: true,
    deletedAt: null,
  },
]
