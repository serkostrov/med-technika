import { normalizeCustomerName, normalizeSerial } from '@/dictionaries/normalize/text'
import type { Equipment } from '@/domain'

export function matchEquipment(
  equipment: readonly Equipment[],
  serialRaw: string | null | undefined,
  name: string | null | undefined,
): Equipment | null {
  // «б/н», «-» — номера нет (26-ЭП: кассета, тест-объекты) → по наименованию
  if (!serialRaw?.trim() || /^(б\s*\/\s*н|-|—)\.?$/i.test(serialRaw.trim())) {
    return matchByNameWithoutSerial(equipment, name)
  }
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
    // «Диафрагма – коллиматор» (справочник) ≡ «Диафрагма-коллиматор» (протокол)
    .replace(/[«»"'.,;:()\-–—]/g, ' ')
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
  if (contained.length === 1) return contained[0]!
  if (contained.length > 1) return null
  return matchByModelCode(active, name)
}

/** Обозначения моделей: «ТКЧ-03К», «ТПР-1-2», «НГС-1К» (буквы + дефис / цифры). */
function modelCodes(name: string): string[] {
  return (name.toUpperCase().match(/[A-ZА-ЯЁ]{2,}(?:-[A-ZА-ЯЁ\d]+)+/g) ?? []).filter((c) => c.length >= 5)
}

/**
 * Последний шанс для «б/н»: в протоколе и справочнике прибор назван по-разному
 * («Тест-контроль чувствительности ТКЧ-03К» / «Тест контрастной чувствительности ТКЧ-03»),
 * общее — обозначение модели. Совпадение (одно — начало другого) только однозначное.
 */
function matchByModelCode(equipment: readonly Equipment[], name: string): Equipment | null {
  const codes = modelCodes(name)
  if (codes.length === 0) return null
  const hits = equipment.filter((e) =>
    modelCodes(e.name).some((dc) => codes.some((pc) => pc === dc || pc.startsWith(dc) || dc.startsWith(pc))),
  )
  return hits.length === 1 ? hits[0]! : null
}
