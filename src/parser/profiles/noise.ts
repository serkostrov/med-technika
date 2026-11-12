import { normalizeText } from '@/dictionaries/normalize/text'
import { formatFactValue } from '../fact-value'
import {
  colIndex,
  cellNumber,
  cellText,
  getCell,
  type SheetGrid,
} from '../sheet-utils'
import type { ParsedObject, ParsedResult } from '../types'

/** Колонки итоговой таблицы 26-Ш (ГОСТ ISO 9612). */
const NOISE_COL = {
  label: 0,
  value: colIndex('U'),
  uStd: colIndex('AC'),
  uExp: colIndex('AK'),
} as const

export const NOISE_INDICATOR = 'Эквивалентный уровень звука'
export const NOISE_UNIT = 'дБА'

/** sourceKey итоговых строк: за 8-часовой день и за фактическую смену. */
export const NOISE_KEY = {
  lex8h: 'laeq_8h',
  shift: 'laeq_shift',
} as const

function norm(s: string): string {
  return normalizeText(s).toLowerCase()
}

function isSummaryHeader(grid: SheetGrid, r: number): boolean {
  const a = norm(cellText(grid, r, NOISE_COL.label))
  const ac = norm(cellText(grid, r, NOISE_COL.uStd))
  return a.startsWith('эквивалентный уровень звука, дб') && ac.includes('неопредел')
}

function isTableEnd(text: string): boolean {
  return (
    text.startsWith('эквивалентный уровень звука за рабочую смену') ||
    text.startsWith('нетипичные') ||
    text.startsWith('результаты измерений относятся') ||
    text.startsWith('измерения провел')
  )
}

function summaryKey(label: string): string | null {
  const t = norm(label)
  if (t.includes('8-час') || t.includes('lex')) return NOISE_KEY.lex8h
  if (t.includes('фактическ')) return NOISE_KEY.shift
  return null
}

/**
 * Профиль noise (26-Ш, ГОСТ ISO 9612-2016).
 *
 * В ФГИС уходит только итоговая таблица «Эквивалентный уровень звука, дБ»:
 * по каждому рабочему месту — LEX,8h и уровень за фактическую смену (колонка U).
 * Измерения по рабочим операциям (AC/AG/AK) — промежуточные, в выгрузку не идут.
 */
export function parseNoise(grid: SheetGrid): {
  objects: ParsedObject[]
  results: ParsedResult[]
  log: string[]
} {
  const log: string[] = []
  const objects: ParsedObject[] = []
  const results: ParsedResult[] = []

  let headerRow = -1
  for (let r = 0; r <= grid.maxRow; r++) {
    if (isSummaryHeader(grid, r)) {
      headerRow = r
      break
    }
  }
  if (headerRow < 0) {
    log.push('noise: не найдена итоговая таблица «Эквивалентный уровень звука, дБ»')
    return { objects, results, log }
  }

  let objectSeq = 0
  for (let r = headerRow + 1; r <= grid.maxRow; r++) {
    const label = cellText(grid, r, NOISE_COL.label)
    if (!label) continue
    if (isTableEnd(norm(label))) break

    const value = cellNumber(grid, r, NOISE_COL.value)
    if (value == null) {
      // строка рабочего места: «1. Стоматологический кабинет №1, …»
      const m = /^\s*\d+\s*[.)]\s*(.+)$/.exec(label)
      if (m) {
        objectSeq = objects.length + 1
        objects.push({
          seq: objectSeq,
          name: m[1]!.trim(),
          serialNo: null,
          year: null,
          department: null,
        })
      }
      continue
    }

    const key = summaryKey(label)
    if (!key) {
      log.push(`noise: строка ${r + 1} «${label}» — неизвестный тип итога, пропущена`)
      continue
    }
    if (!objectSeq) {
      log.push(`noise: строка ${r + 1} — итог без рабочего места, пропущена`)
      continue
    }

    const cell = getCell(grid, r, NOISE_COL.value)
    const numberFormat = cell?.z && cell.z !== 'General' ? cell.z : '0.0'
    results.push({
      seq: results.length + 1,
      objectSeq,
      sourceKey: key,
      indicatorRaw: label.trim(),
      unitSymbol: NOISE_UNIT,
      setValue: null,
      rawValues: null,
      avgExcel: value,
      uExcel: cellNumber(grid, r, NOISE_COL.uExp),
      ubExcel: null,
      avgCalc: null,
      uCalc: null,
      numberFormat,
      factValue: formatFactValue(value, numberFormat),
      displayValue: value,
    })
  }

  log.push(`noise: рабочих мест ${objects.length}, результатов ${results.length}`)
  return { objects, results, log }
}
