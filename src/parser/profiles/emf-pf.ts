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
 * Профиль emf-pf (26-ПП, МУК 4.3.2491-09 — ЭМП промышленной частоты 50 Гц).
 *
 * «Результаты измерений»: № | Рабочее место (C) | Высота точки, м (Q) |
 * «Напряженность … Е, кВ/м» | «Индукция … В, мкТл», под каждым — «ср.изм. / факт. / эфф. / ±u».
 * В ФГИС — «ср.изм.» как напечатано («≤0,05»); порядок — показатель, внутри — высоты
 * (эталон 25-26-ПП). Правее BB — служебные расчёты шаблона.
 */

const COL_C = colIndex('C')
const COL_Q = colIndex('Q')
const COL_LIMIT = colIndex('BB')

type Column = { col: number; key: string; indicator: string; unit: string | null }

function norm(s: string): string {
  return normalizeText(s).toLowerCase()
}

/** «… промышленной частоты Е, кВ/м» → «кВ/м» */
function unitOf(text: string): string | null {
  const parts = normalizeText(text).split(',').map((p) => p.trim())
  return parts.length >= 2 && parts[parts.length - 1] ? parts[parts.length - 1]! : null
}

function tableColumns(grid: SheetGrid, headerRow: number): Column[] {
  const columns: Column[] = []
  for (let c = 1; c < Math.min(COL_LIMIT, HEADER_MAX_COL + 1); c++) {
    const t = cellText(grid, headerRow, c)
    const n = norm(t)
    let key: string | null = null
    if (n.startsWith('напряженность переменного электрического')) key = 'e_pf'
    else if (n.startsWith('индукция переменного магнитного')) key = 'b_pf'
    if (!key) continue
    // «ср.изм.» — в строке подзаголовков, начиная с колонки показателя
    let col = c
    for (let cc = c; cc < c + 8; cc++) {
      if (norm(cellText(grid, headerRow + 1, cc)).startsWith('ср')) {
        col = cc
        break
      }
    }
    columns.push({ col, key, indicator: normalizeText(t), unit: unitOf(t) })
  }
  return columns
}

function factText(grid: SheetGrid, r: number, c: number): string | null {
  const cell = getCell(grid, r, c)
  if (!cell || cell.v == null || cell.v === '' || cell.t === 'e') return null
  if (typeof cell.v === 'number') {
    return formatFactValue(cell.v, cell.z && cell.z !== 'General' ? cell.z : 'General')
  }
  const t = normalizeText(String(cell.v))
  if (!t || t === '-' || t === '—') return null
  return t.replace(/\./g, ',')
}

function isEnd(text: string): boolean {
  const n = norm(text)
  return n.startsWith('результаты измерений относятся') || n.startsWith('протокол оформил')
}

export function parseEmfPf(grid: SheetGrid): {
  objects: ParsedObject[]
  results: ParsedResult[]
  log: string[]
} {
  const log: string[] = []
  const objects: ParsedObject[] = []
  const results: ParsedResult[] = []

  for (let h = 0; h <= grid.maxRow; h++) {
    if (isRowHidden(grid, h) || norm(cellText(grid, h, 0)) !== '№') continue
    const columns = tableColumns(grid, h)
    if (columns.length === 0) continue

    type Point = { row: number; objectSeq: number; height: string }
    const points: Point[] = []
    let objectSeq = 0
    let r = h + 2
    for (; r <= grid.maxRow; r++) {
      if (isEnd(cellText(grid, r, 0))) break
      if (isRowHidden(grid, r)) continue
      const place = normalizeText(cellText(grid, r, COL_C))
      if (place) {
        objectSeq = objects.length + 1
        objects.push({ seq: objectSeq, name: place, serialNo: null, year: null, department: null })
      }
      const height = normalizeText(cellText(grid, r, COL_Q))
      if (!height || !objectSeq) continue
      points.push({ row: r, objectSeq, height })
    }

    for (const seq of [...new Set(points.map((p) => p.objectSeq))]) {
      const rows = points.filter((p) => p.objectSeq === seq)
      for (const col of columns) {
        for (const p of rows) {
          const fact = factText(grid, p.row, col.col)
          if (fact == null) continue
          const cell = getCell(grid, p.row, col.col)
          const num = typeof cell?.v === 'number' ? cell.v : null
          results.push({
            seq: results.length + 1,
            objectSeq: seq,
            sourceKey: col.key,
            indicatorRaw: `${col.indicator}; высота ${p.height} м`,
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
    }
    h = r - 1
  }

  log.push(`emf-pf: рабочих мест ${objects.length}, результатов ${results.length}`)
  return { objects, results, log }
}
