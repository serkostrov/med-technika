/** Стабильные UUID для seed (не случайные при каждом запуске). */
export const SeedIds = {
  staffSadakov: '11111111-1111-4111-8111-111111111101',
  staffSudnitsyn: '11111111-1111-4111-8111-111111111102',

  oaEditionCurrent: '22222222-2222-4222-8222-222222222201',
  oaItemUhfPower: '22222222-2222-4222-8222-222222222211',
  oaItemUhfFreq: '22222222-2222-4222-8222-222222222212',
  oaItemLfCurrent: '22222222-2222-4222-8222-222222222213',
  oaItemDfEnergy: '22222222-2222-4222-8222-222222222214',
  oaItemDfInterval: '22222222-2222-4222-8222-222222222215',

  formUhf: '33333333-3333-4333-8333-333333333301',
  formLf: '33333333-3333-4333-8333-333333333302',
  formDf: '33333333-3333-4333-8333-333333333303',
} as const

let seq = 0
export function newId(prefix = 'id'): string {
  seq += 1
  return `${prefix}-${seq.toString(16).padStart(8, '0')}-${crypto.randomUUID()}`
}
