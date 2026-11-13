import { normalizeText } from '@/dictionaries/normalize/text'
import { formatFactValue } from '../fact-value'
import {
  HEADER_MAX_COL,
  cellNumber,
  cellText,
  colIndex,
  getCell,
  isRowHidden,
  type SheetGrid,
} from '../sheet-utils'
import type { ParsedObject, ParsedResult } from '../types'

/**
 * Профиль rk (26-РК, МУК 2.6.1.3829-22 — радиационный контроль рентгенкабинета).
 *
 * Таблица «№ | Наименование места измерения | Направление | I уст | Результаты:
 * Ḣ*(10) | ±U | Ė пр | ДМЭД | Примечание». Строки без номера — группы точек
 * («Помещения, смежные…», «Рабочее место рентгенлаборанта…»), строка «1 2 3 …» —
 * нумерация колонок. В ФГИС — все Ḣ*(10), затем все Ė пр (эталон 328-26-РК), мкЗв/ч.
 */

const COL_PLACE = colIndex('C')
const COL_PLACE_EXTRA = colIndex('G')

type Column = { col: number; key: string; unit: string | null }

function norm(s: string): string {
  return normalizeText(s).toLowerCase()
}

function unitAfterComma(text: string): string | null {
  const parts = normalizeText(text).split(',').map((p) => p.trim())
  return parts.length >= 2 && parts[parts.length - 1] ? parts[parts.length - 1]! : null
}

function isTableHeader(grid: SheetGrid, r: number): boolean {
  return (
    norm(cellText(grid, r, 0)) === '№' &&
    norm(cellText(grid, r, COL_PLACE)).startsWith('наименование места')
  )
}

/** Подзаголовок «Ḣ*(10), мкЗв/ч | ±U(0,95), мкЗв/ч | Ė пр, мкЗв/ч» — без неопределённости. */
function resultColumns(grid: SheetGrid, r: number): Column[] {
  const cols: Column[] = []
  for (let c = COL_PLACE; c <= HEADER_MAX_COL; c++) {
    const t = cellText(grid, r, c)
    const n = norm(t)
    if (!n || n.startsWith('±')) continue
    if (n.includes('(10)')) cols.push({ col: c, key: 'h10', unit: unitAfterComma(t) })
    else if (n.startsWith('ė') || n.startsWith('е пр') || n.startsWith('ė пр')) {
      cols.push({ col: c, key: 'e_eff', unit: unitAfterComma(t) })
    }
  }
  return cols
}

function factText(grid: SheetGrid, r: number, c: number): string | null {
  const cell = getCell(grid, r, c)
  if (!cell || cell.v == null || cell.v === '') return null
  if (typeof cell.v === 'number') {
    const z = cell.z && cell.z !== 'General' ? cell.z : 'General'
    return formatFactValue(cell.v, z)
  }
  const t = normalizeText(String(cell.v))
  if (!t || t === '-' || t === '—') return null
  return t.replace(/\./g, ',')
}

export function parseRk(grid: SheetGrid): {
  objects: ParsedObject[]
  results: ParsedResult[]
  log: string[]
} {
  const log: string[] = []
  const objects: ParsedObject[] = []
  const results: ParsedResult[] = []

  for (let h = 0; h <= grid.maxRow; h++) {
    if (isRowHidden(grid, h) || !isTableHeader(grid, h)) continue
    const columns = resultColumns(grid, h + 1)
    if (columns.length === 0) {
      log.push(`rk: строка ${h + 2} — нет колонок Ḣ*(10) / Ė пр`)
      continue
    }

    const rows: { row: number; objectSeq: number }[] = []
    let group: string | null = null
    let r = h + 2
    for (; r <= grid.maxRow; r++) {
      const a = cellText(grid, r, 0).trim()
      if (!a) continue
      if (norm(a).startsWith('результаты измерений относятся')) break
      if (!/^\d+$/.test(a)) {
        group = normalizeText(a) // группа точек (в т.ч. скрытая)
        continue
      }
      // строка нумерации колонок «1 | 2 | 3 …»
      if (cellNumber(grid, r, COL_PLACE) != null) continue
      if (isRowHidden(grid, r)) continue
      const name = [cellText(grid, r, COL_PLACE), cellText(grid, r, COL_PLACE_EXTRA)]
        .map((t) => normalizeText(t))
        .filter(Boolean)
        .join(' ')
      const objectSeq = objects.length + 1
      objects.push({ seq: objectSeq, name: name || null, serialNo: null, year: null, department: group })
      rows.push({ row: r, objectSeq })
    }

    for (const col of columns) {
      for (const p of rows) {
        const fact = factText(grid, p.row, col.col)
        if (fact == null) continue
        const cell = getCell(grid, p.row, col.col)
        const num = typeof cell?.v === 'number' ? cell.v : null
        results.push({
          seq: results.length + 1,
          objectSeq: p.objectSeq,
          sourceKey: col.key,
          indicatorRaw: objects[p.objectSeq - 1]!.name,
          unitSymbol: col.unit,
          setValue: cellText(grid, p.row, colIndex('R')) || null,
          rawValues: null,
          avgExcel: num,
          uExcel: null,
          ubExcel: null,
          avgCalc: null,
          uCalc: null,
          numberFormat: cell?.z ?? null,
          factValue: fact,
          displayValue: num,
        })
      }
    }
    h = r - 1
  }

  log.push(`rk: точек ${objects.length}, результатов ${results.length}`)
  return { objects, results, log }
}
