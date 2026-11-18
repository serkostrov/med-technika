import { normalizeText } from './text'

export type ParsedFgisTagged = {
  text: string
  /** null при «id отсутствует» или отсутствии тега */
  id: string | null
  isAbsent: boolean
}

/**
 * Из «Текст ||id N||» извлекаем текст и id;
 * «||id отсутствует||» → id null (ТЗ §12).
 */
export function parseFgisTaggedText(raw: string): ParsedFgisTagged {
  const source = normalizeText(raw)
  if (!source) return { text: '', id: null, isAbsent: false }

  const absent = /\|\|\s*id\s+отсутствует\s*\|\|/i.exec(source)
  if (absent) {
    const text = normalizeText(source.replace(absent[0], ''))
    return { text, id: null, isAbsent: true }
  }

  const withId = /\|\|\s*id\s+(\d+)\s*\|\|/i.exec(source)
  if (withId) {
    const text = normalizeText(source.replace(withId[0], ''))
    return { text, id: withId[1]!, isAbsent: false }
  }

  return { text: source, id: null, isAbsent: false }
}

/**
 * Диапазон ОА: «0,00000005 - 10», «10 - 45000000» (ТЗ §8).
 * Нераспознанное → null (потом W07 на проверках протоколов).
 */
export function parseOaRange(rangeText: string): {
  min: number | null
  max: number | null
} {
  const m = /^\s*([\d\s,]+)\s*-\s*([\d\s,]+)\s*$/.exec(rangeText.trim())
  if (!m) return { min: null, max: null }
  const min = Number(m[1]!.replace(/\s/g, '').replace(',', '.'))
  const max = Number(m[2]!.replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: null, max: null }
  return { min, max }
}

/**
 * Единица позиции ОА — не единица измерения, а текст: «наличие/отсутствие» (в ОА id 5-1),
 * «указание не требуется» (id 0). В протоколе единицы нет, в XML — UniqueMeasurement.
 */
export function isTextOnlyOaUnit(unitText: string | null | undefined, unitFgisId: string | null | undefined): boolean {
  const text = unitText?.trim().toLowerCase() ?? ''
  if (!text) return false
  if (/^(наличие|указание не требуется)/.test(text)) return true
  const id = unitFgisId?.trim() ?? ''
  return !id || id === '0' || !/^\d+$/.test(id)
}
