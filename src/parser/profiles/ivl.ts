import { normalizeText } from '@/dictionaries/normalize/text'
import { formatFactValue } from '../fact-value'
import {
  cellText,
  colIndex,
  getCell,
  isRowHidden,
  type SheetGrid,
} from '../sheet-utils'
import type { ParsedObject, ParsedResult } from '../types'

/**
 * Профиль ivl (26-МТ «ИВЛ» — параметры дыхательного оборудования, Citrex H4).
 *
 * Блоки «Объект измерений N:» (наименование, заводской номер, год) и таблицы
 * «Определяемый показатель | измеренное значение / результат определения (AD) | ±U | единица (AT)».
 * Отношение вдоха к выдоху — текстом «1,0/1,5», во ФГИС «1,0:1,5» (эталон 5-26-ИВЛ).
 * «Пункт не применим» не выгружается.
 */

const COL_VALUE = colIndex('AD')
const COL_UNIT = colIndex('AT')
const COL_HEADER_VALUE = colIndex('P')

/** Показатель → ключ сопоставления с ОА. */
const INDICATORS: { re: RegExp; key: string }[] = [
  { re: /^низкое давление/, key: 'low_pressure' },
  { re: /^высокое давление/, key: 'high_pressure' },
  { re: /^объ[её]мная доля кислорода/, key: 'oxygen_fraction' },
  { re: /^объем|^объём/, key: 'volume' },
  { re: /^расход/, key: 'flow' },
  { re: /^отношение (времени )?вдох/, key: 'ie_ratio' },
]

/** «литр» → «л» (как в ОА: л ||id 613||) */
function normalizeUnit(unit: string): string | null {
  const u = normalizeText(unit)
  if (!u || u === '-') return null
  if (/^литр/i.test(u)) return 'л'
  return u
}

function norm(s: string): string {
  return normalizeText(s).toLowerCase()
}

export function parseIvl(grid: SheetGrid): {
  objects: ParsedObject[]
  results: ParsedResult[]
  log: string[]
} {
  const log: string[] = []
  const objects: ParsedObject[] = []
  const results: ParsedResult[] = []
  let objectSeq = 0
  let inTable = false

  for (let r = 0; r <= grid.maxRow; r++) {
    if (isRowHidden(grid, r)) continue
    const a = normalizeText(cellText(grid, r, 0))
    const n = norm(a)
    if (!n) continue
    if (n.startsWith('±u') || n.includes('протокол оформил')) break

    if (n.startsWith('объект измерений')) {
      objectSeq = objects.length + 1
      objects.push({ seq: objectSeq, name: null, serialNo: null, year: null, department: null })
      inTable = false
      continue
    }
    const obj = objects[objectSeq - 1]
    if (obj && n.startsWith('наименование аппарата')) {
      obj.name = normalizeText(cellText(grid, r, COL_HEADER_VALUE)) || null
      continue
    }
    if (obj && n.startsWith('заводской')) {
      obj.serialNo = normalizeText(cellText(grid, r, COL_HEADER_VALUE)) || null
      continue
    }
    if (obj && n.startsWith('год выпуска')) {
      obj.year = normalizeText(cellText(grid, r, COL_HEADER_VALUE)) || null
      continue
    }
    if (n.startsWith('определяемый показатель')) {
      const head = norm(cellText(grid, r, COL_VALUE))
      // результаты — таблица с «измеренное значение» / «результат определения» в AD
      inTable = head.startsWith('измеренное') || head.startsWith('результат определения')
      continue
    }
    if (n.startsWith('установленные параметры')) {
      inTable = false
      continue
    }
    if (!inTable || !objectSeq) continue

    const indicator = INDICATORS.find((i) => i.re.test(n))
    if (!indicator) {
      log.push(`ivl: строка ${r + 1} «${a}» — показатель не сопоставлен, пропущена`)
      continue
    }
    const cell = getCell(grid, r, COL_VALUE)
    if (!cell || cell.v == null || cell.v === '') continue
    let fact: string
    let num: number | null = null
    if (cell.t !== 'e' && typeof cell.v === 'number') {
      num = cell.v
      const z = cell.z && cell.z !== 'General' ? cell.z : 'General'
      fact = formatFactValue(cell.v, z)
    } else {
      const t = normalizeText(String(cell.v))
      if (!t || /не применим/i.test(t) || t === '-') continue
      fact = indicator.key === 'ie_ratio' ? t.replace(/\//g, ':') : t
    }
    results.push({
      seq: results.length + 1,
      objectSeq,
      sourceKey: indicator.key,
      indicatorRaw: a,
      unitSymbol: normalizeUnit(cellText(grid, r, COL_UNIT)),
      setValue: null,
      rawValues: null,
      avgExcel: num,
      uExcel: null,
      ubExcel: null,
      avgCalc: null,
      uCalc: null,
      numberFormat: cell.z ?? null,
      factValue: fact,
      displayValue: num,
    })
  }

  log.push(`ivl: аппаратов ${objects.length}, результатов ${results.length}`)
  return { objects, results, log }
}
