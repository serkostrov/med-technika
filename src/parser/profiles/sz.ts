import { normalizeText } from '@/dictionaries/normalize/text'
import { formatFactValue } from '../fact-value'
import {
  HEADER_MAX_COL,
  cellText,
  colIndex,
  getCell,
  isRowHidden,
  type SheetGrid,
} from '../sheet-utils'
import type { ParsedObject, ParsedResult } from '../types'

/**
 * Профиль sz (26-СЗ, ФР.1.38.2021.40260 — свинцовый эквивалент средств защиты).
 *
 * Таблица «№ | Наименование, производитель, зав. № | dPb по ТУ | dPb по МИ с учётом
 * неопределённости». Строка = изделие (объект). В ФГИС — «dPb по МИ», мм Pb.
 * Справа от BB — расчёт по кривой Pb (служебное).
 */

const COL_NAME = colIndex('D')
export const SZ_UNIT = 'мм Pb'

function norm(s: string): string {
  return normalizeText(s).toLowerCase()
}

function valueColumn(grid: SheetGrid, r: number): number | null {
  if (norm(cellText(grid, r, 0)) !== '№') return null
  if (!norm(cellText(grid, r, COL_NAME)).startsWith('наименование')) return null
  for (let c = COL_NAME + 1; c <= HEADER_MAX_COL; c++) {
    if (norm(cellText(grid, r, c)).includes('по ми')) return c
  }
  return null
}

export function parseSz(grid: SheetGrid): {
  objects: ParsedObject[]
  results: ParsedResult[]
  log: string[]
} {
  const log: string[] = []
  const objects: ParsedObject[] = []
  const results: ParsedResult[] = []

  for (let h = 0; h <= grid.maxRow; h++) {
    if (isRowHidden(grid, h)) continue
    const col = valueColumn(grid, h)
    if (col == null) continue

    let r = h + 1
    for (; r <= grid.maxRow; r++) {
      const a = cellText(grid, r, 0).trim()
      if (!a) continue
      if (!/^\d+$/.test(a)) break
      if (isRowHidden(grid, r)) continue
      const name = normalizeText(cellText(grid, r, COL_NAME))
      const cell = getCell(grid, r, col)
      if (!name || typeof cell?.v !== 'number') continue

      const z = cell.z && cell.z !== 'General' ? cell.z : '0.000'
      const serial = /зав\.?\s*№\s*([^\s,;]+)/i.exec(name)?.[1] ?? null
      const objectSeq = objects.length + 1
      objects.push({ seq: objectSeq, name, serialNo: serial, year: null, department: null })
      results.push({
        seq: results.length + 1,
        objectSeq,
        sourceKey: 'pb_equivalent',
        indicatorRaw: name,
        unitSymbol: SZ_UNIT,
        setValue: cellText(grid, r, colIndex('X')) || null,
        rawValues: null,
        avgExcel: cell.v,
        uExcel: null,
        ubExcel: null,
        avgCalc: null,
        uCalc: null,
        numberFormat: cell.z ?? null,
        factValue: formatFactValue(cell.v, z),
        displayValue: cell.v,
      })
    }
    h = r - 1
  }

  log.push(`sz: изделий ${objects.length}, результатов ${results.length}`)
  return { objects, results, log }
}
