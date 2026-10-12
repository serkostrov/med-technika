import type { Setting } from '@/domain'
import { SeedIds } from '@/data/ids'

/** Ключи settings из комментария DDL ТЗ §4 и §12. */
export const SEED_SETTINGS: readonly Setting[] = [
  { key: 'lab_address_id', value: 766884 },
  { key: 'approver_staff_id', value: SeedIds.staffSadakov },
  { key: 'recalc_tolerance', value: 1e-6 },
  { key: 'severity_overrides', value: {} },
  {
    key: 'lab_address_text',
    value: 'пер. Искожевский, 16',
  },
]
