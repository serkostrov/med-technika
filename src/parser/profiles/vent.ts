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

type Parsed = { objects: ParsedObject[]; results: ParsedResult[]; log: string[] }

function result(
  grid: SheetGrid,
  r: number,
  c: number,
  key: string,
  unit: string | null,
  objectSeq: number,
  name: string | null,
  seq: number,
): ParsedResult | null {
  const fact = factText(grid, r, c)
  if (fact == null) return null
  const cell = getCell(grid, r, c)
  const num = typeof cell?.v === 'number' ? cell.v : null
  return {
    seq,
    objectSeq,
    sourceKey: key,
    indicatorRaw: name,
    unitSymbol: unit,
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
  }
}

/**
 * Полный «Протокол МР 4.3.0212-20» (эталон 262-26-АС): «Помещение | Вентиляционная система |
 * № точки | Скорость воздушного потока, м/с | Производительность, м3/ч (в точке / общая) |
 * Кратность, час-1». Общая производительность и кратность — в первой точке системы.
 * Порядок во ФГИС: производительность в точках, общая, кратность, затем скорость.
 */
function parseVentMr(grid: SheetGrid): Parsed | null {
  for (let h = 0; h <= grid.maxRow; h++) {
    if (isRowHidden(grid, h) || norm(cellText(grid, h, COL_ROOM)) !== 'помещение') continue
    const find = (re: RegExp, row = h) => {
      for (let c = 1; c <= HEADER_MAX_COL; c++) if (re.test(norm(cellText(grid, row, c)))) return c
      return null
    }
    const speed = find(/^скорость воздушного потока/)
    const system = find(/^вентиляционная система/)
    const flow = find(/^производительность/)
    const exchange = find(/^кратность/)
    if (speed == null || system == null || flow == null) continue
    const flowPoint = find(/^в точке/, h + 1) ?? flow
    const flowTotal = find(/^общая/, h + 1)
    const unitOfCol = (c: number) => unitOf(cellText(grid, h, c).replace(/\.\s*$/, ''))

    const objects: ParsedObject[] = []
    const rows: { row: number; objectSeq: number; name: string }[] = []
    let room: string | null = null
    for (let r = h + 2; r <= grid.maxRow; r++) {
      const sys = normalizeText(cellText(grid, r, system))
      const a = normalizeText(cellText(grid, r, COL_ROOM))
      if (!sys) {
        if (a && !a.startsWith('*')) break
        continue
      }
      if (a) room = a
      if (isRowHidden(grid, r)) continue
      const name = [room, sys].filter(Boolean).join(': ')
      objects.push({ seq: objects.length + 1, name, serialNo: null, year: null, department: room })
      rows.push({ row: r, objectSeq: objects.length, name })
    }

    const results: ParsedResult[] = []
    const push = (x: ParsedResult | null) => {
      if (x) results.push(x)
    }
    const flowUnit = unitOfCol(flow)
    for (const p of rows) push(result(grid, p.row, flowPoint, 'air_flow', flowUnit, p.objectSeq, p.name, results.length + 1))
    if (flowTotal != null) {
      const withTotal = rows.filter((p) => typeof getCell(grid, p.row, flowTotal)?.v === 'number')
      for (const p of withTotal) push(result(grid, p.row, flowTotal, 'air_flow', flowUnit, p.objectSeq, p.name, results.length + 1))
      if (exchange != null) {
        for (const p of withTotal) push(result(grid, p.row, exchange, 'air_exchange', unitOfCol(exchange), p.objectSeq, p.name, results.length + 1))
      }
    }
    for (const p of rows) push(result(grid, p.row, speed, 'air_speed', unitOfCol(speed), p.objectSeq, p.name, results.length + 1))
    return { objects, results, log: [`vent МР: точек ${objects.length}, результатов ${results.length}`] }
  }
  return null
}

export function parseVent(grid: SheetGrid): Parsed {
  const mr = parseVentMr(grid)
  if (mr) return mr
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
