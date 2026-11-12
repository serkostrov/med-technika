import { normalizeCustomerName, normalizeSerial } from '@/dictionaries/normalize/text'
import type { Equipment } from '@/domain'

export function matchEquipment(
  equipment: readonly Equipment[],
  serialRaw: string | null | undefined,
  name: string | null | undefined,
): Equipment | null {
  if (!serialRaw?.trim()) return matchByNameWithoutSerial(equipment, name)
  const norm = normalizeSerial(serialRaw)
  const bySerial = equipment.filter(
    (e) => e.deletedAt === null && e.serialNorm === norm,
  )
  if (bySerial.length === 0) return null
  if (bySerial.length === 1) return bySerial[0]!
  if (name) {
    const words = normalizeCustomerName(name).split(' ').filter(Boolean)
    const scored = bySerial
      .map((e) => ({
        e,
        score: words.filter((w) => normalizeCustomerName(e.name).includes(w))
          .length,
      }))
      .sort((a, b) => b.score - a.score)
    if (scored[0] && scored[0].score > 0) return scored[0].e
  }
  return bySerial[0]!
}

/** «Диафрагма-коллиматор свинцовая (из 3-х пластин), б/н.» → ключ без «б/н» и знаков */
function equipmentNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/(^|[\s,])б\s*\/\s*н\.?(?=$|[\s,.])/g, ' ')
    .replace(/[«»"'.,;:()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Оборудование без заводского номера («б/н», 26-СЗ): номера нет — сопоставляем по
 * наименованию, только при однозначном совпадении. Иначе — ручная привязка (E04).
 */
function matchByNameWithoutSerial(
  equipment: readonly Equipment[],
  name: string | null | undefined,
): Equipment | null {
  if (!name?.trim()) return null
  const key = equipmentNameKey(name)
  if (key.length < 6) return null
  const active = equipment.filter((e) => e.deletedAt === null)
  const exact = active.filter((e) => equipmentNameKey(e.name) === key)
  if (exact.length === 1) return exact[0]!
  if (exact.length > 1) return null
  const contained = active.filter((e) => {
    const k = equipmentNameKey(e.name)
    return k.length >= 6 && key.includes(k)
  })
  return contained.length === 1 ? contained[0]! : null
}
