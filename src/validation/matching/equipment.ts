import { normalizeCustomerName, normalizeSerial } from '@/dictionaries/normalize/text'
import type { Equipment } from '@/domain'

export function matchEquipment(
  equipment: readonly Equipment[],
  serialRaw: string | null | undefined,
  name: string | null | undefined,
): Equipment | null {
  if (!serialRaw?.trim()) return null
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
