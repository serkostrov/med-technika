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
 * Профиль vent (26-АС, МР 4.3.0212-20 — аэродинамические характеристики вентиляции).
 *
 * Таблица «Помещение | Вентиляционная система | Производительность, м3/ч | Кратность, час-1»,
 * каждый показатель — «значение | ± | U». Строка = система в помещении (объект).
 * В ФГИС — по показателю: вся производительность, затем вся кратность (эталон 260-26-АС).
 */

const COL_ROOM = 0
const COL_SYSTEM = colIndex('X')

type Column = { col: number; key: string; unit: string | null }

function norm(s: string): string {
  return normalizeText(s).toLowerCase()
}

function unitOf(text: string): string | null {
  const parts = normalizeText(text).split(',').map((p) => p.trim())
  return parts.length >= 2 && parts[parts.length - 1] ? parts[parts.length - 1]! : null
}

function columnKey(text: string): string | null {
  const t = norm(text)
  if (t.startsWith('производительность')) return 'air_flow'
  if (t.startsWith('кратность')) return 'air_exchange'
  return null
}

function tableColumns(grid: SheetGrid, r: number): Column[] | null {
  if (norm(cellText(grid, r, COL_ROOM)) !== 'помещение') return null
  if (!norm(cellText(grid, r, COL_SYSTEM)).startsWith('вентиляционная система')) return null
  const cols: Column[] = []
  for (let c = COL_SYSTEM + 1; c <= HEADER_MAX_COL; c++) {
    const t = cellText(grid, r, c)
    const key = t ? columnKey(t) : null
    if (key) cols.push({ col: c, key, unit: unitOf(t) })
  }
  return cols.length ? cols : null
}

function factText(grid: SheetGrid, r: number, c: number): string | null {
  const cell = getCell(grid, r, c)
  if (!cell || cell.v == null || cell.v === '') return null
  if (typeof cell.v === 'number') {
    const z = cell.z && cell.z !== 'General' ? cell.z : '0'
    return formatFactValue(cell.v, z)
  }
  const t = normalizeText(String(cell.v))
  if (!t || t === '-' || t === '—') return null
  return t.replace(/\./g, ',')
}

export function parseVent(grid: SheetGrid): {
  objects: ParsedObject[]
  results: ParsedResult[]
  log: string[]
} {
  const log: string[] = []
  const objects: ParsedObject[] = []
  const results: ParsedResult[] = []

  for (let h = 0; h <= grid.maxRow; h++) {
    if (isRowHidden(grid, h)) continue
    const columns = tableColumns(grid, h)
    if (!columns) continue

    const rows: { row: number; objectSeq: number }[] = []
    let room: string | null = null
    let r = h + 1
    for (; r <= grid.maxRow; r++) {
      const system = normalizeText(cellText(grid, r, COL_SYSTEM))
      const a = normalizeText(cellText(grid, r, COL_ROOM))
      if (!system) {
        // сноска «* в указанном помещении…» / конец таблицы
        if (a && !a.startsWith('*')) break
        continue
      }
      // помещение пишется в первой строке, у следующих систем того же помещения A пусто
      if (a) room = a
      if (isRowHidden(grid, r)) continue
      const objectSeq = objects.length + 1
      objects.push({
        seq: objectSeq,
        name: room ? `${room}: ${system}` : system,
        serialNo: null,
        year: null,
        department: room,
      })
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
          setValue: null,
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

  log.push(`vent: систем ${objects.length}, результатов ${results.length}`)
  return { objects, results, log }
}
