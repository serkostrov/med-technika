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
 * Профиль micro (26-МК, МИ М.08−2021 — микроклимат на рабочих местах).
 *
 * Таблица «№ | Место проведения измерений | Высота | Температура, оС | Влажность, % |
 * Скорость движения воздуха, м/с» (каждый показатель — «измеренное значение | ±U»).
 * Точка: строка с номером + строки следующих высот; над ней — подзаголовок помещения.
 * В ФГИС — по показателю (вся температура, затем влажность, затем скорость), «-» пропуск.
 */

const COL_PLACE = colIndex('C')
const COL_HEIGHT = colIndex('S')

type Column = { col: number; key: string; unit: string | null }

function norm(s: string): string {
  return normalizeText(s).toLowerCase()
}

/** «оС» / «ºС» / «°C» → «°С» */
export function normalizeUnitSymbol(unit: string): string {
  const u = normalizeText(unit)
  if (/^[оoº°]\s*[сc]$/i.test(u)) return '°С'
  return u
}

function unitOf(text: string): string | null {
  const parts = normalizeText(text).split(',').map((p) => p.trim())
  const u = parts.length >= 2 ? parts[parts.length - 1] : null
  return u ? normalizeUnitSymbol(u) : null
}

function columnKey(text: string): string | null {
  const t = norm(text)
  if (t.startsWith('температура')) return 'temperature'
  if (t.startsWith('относительная влажность')) return 'humidity'
  if (t.startsWith('скорость движения воздуха')) return 'air_speed'
  return null
}

function tableColumns(grid: SheetGrid, r: number): Column[] | null {
  if (norm(cellText(grid, r, 0)) !== '№') return null
  if (!norm(cellText(grid, r, COL_PLACE)).startsWith('место')) return null
  const cols: Column[] = []
  for (let c = COL_PLACE + 1; c <= HEADER_MAX_COL; c++) {
    const t = cellText(grid, r, c)
    const key = t ? columnKey(t) : null
    if (key) cols.push({ col: c, key, unit: unitOf(t) })
  }
  return cols.length ? cols : null
}

function isTableEnd(text: string): boolean {
  const n = norm(text)
  return n.startsWith('±u') || n.startsWith('протокол оформил') || n.startsWith('измерения провел')
}

function factText(grid: SheetGrid, r: number, c: number, key: string): string | null {
  const cell = getCell(grid, r, c)
  if (!cell || cell.v == null || cell.v === '') return null
  if (typeof cell.v === 'number') {
    const fallback = key === 'air_speed' ? '0.00' : '0.0'
    const z = cell.z && cell.z !== 'General' ? cell.z : fallback
    return formatFactValue(cell.v, z)
  }
  const t = normalizeText(String(cell.v))
  if (!t || t === '-' || t === '—') return null
  return t.replace(/\./g, ',')
}

export function parseMicro(grid: SheetGrid): {
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

    type Point = { row: number; objectSeq: number; height: string }
    const points: Point[] = []
    let room: string | null = null
    let objectSeq = 0
    let r = h + 2
    for (; r <= grid.maxRow; r++) {
      const a = cellText(grid, r, 0).trim()
      if (a && (isTableEnd(a) || tableColumns(grid, r))) break
      const height = normalizeText(cellText(grid, r, COL_HEIGHT))
      if (!height) {
        // подзаголовок помещения
        if (a) room = normalizeText(a)
        continue
      }
      if (isRowHidden(grid, r)) continue
      if (/^\d+$/.test(a)) {
        objectSeq = objects.length + 1
        objects.push({
          seq: objectSeq,
          name: normalizeText(cellText(grid, r, COL_PLACE)) || null,
          serialNo: null,
          year: null,
          department: room,
        })
      }
      if (!objectSeq) continue
      points.push({ row: r, objectSeq, height })
    }

    for (const col of columns) {
      for (const p of points) {
        const fact = factText(grid, p.row, col.col, col.key)
        if (fact == null) continue
        const cell = getCell(grid, p.row, col.col)
        const num = typeof cell?.v === 'number' ? cell.v : null
        results.push({
          seq: results.length + 1,
          objectSeq: p.objectSeq,
          sourceKey: col.key,
          indicatorRaw: `высота ${p.height}`,
          unitSymbol: col.unit,
          setValue: p.height,
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

  log.push(`micro: точек ${objects.length}, результатов ${results.length}`)
  return { objects, results, log }
}
