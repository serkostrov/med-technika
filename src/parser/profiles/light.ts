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
 * Профиль light (26-О, ГОСТ 24940-2016 / ГОСТ 33393-2015).
 *
 * Таблицы «№ п.п. | Место измерений | Плоскость | Система освещения | <показатель>»:
 * освещённость Е, лк (значение — колонка «фактическое») и коэффициент пульсации, %
 * («среднее», часто «≤1,0»). Таблица пульсации может продолжаться на следующей
 * странице повторным заголовком. Строки «Кабинет …» без номера — подзаголовки помещений.
 */

const COL_PLACE = colIndex('E')
const COL_PLANE = colIndex('U')

type Kind = { key: string; unit: string | null; valueCol: number }

function norm(s: string): string {
  return normalizeText(s).toLowerCase()
}

function unitOf(text: string): string | null {
  const parts = normalizeText(text).split(',').map((p) => p.trim())
  return parts.length >= 2 && parts[parts.length - 1] ? parts[parts.length - 1]! : null
}

function tableKind(grid: SheetGrid, r: number): Kind | null {
  if (!norm(cellText(grid, r, 0)).startsWith('№ п.п')) return null
  for (let c = 1; c <= HEADER_MAX_COL; c++) {
    const t = cellText(grid, r, c)
    const n = norm(t)
    let key: string | null = null
    if (n.startsWith('освещенность') || n.startsWith('освещённость')) key = 'illuminance'
    else if (n.startsWith('коэффициент пульсации')) key = 'pulsation'
    if (!key) continue
    // подзаголовок: «среднее | фактическое | ±U» — берём «фактическое», иначе первую колонку
    let valueCol = c
    for (let c2 = c; c2 <= HEADER_MAX_COL; c2++) {
      const sub = norm(cellText(grid, r + 1, c2))
      if (sub.startsWith('фактическ')) {
        valueCol = c2
        break
      }
    }
    return { key, unit: unitOf(t), valueCol }
  }
  return null
}

function isTableEnd(text: string): boolean {
  const n = norm(text)
  return n.startsWith('±u') || n.startsWith('протокол оформил') || n.startsWith('измерения провел')
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

export function parseLight(grid: SheetGrid): {
  objects: ParsedObject[]
  results: ParsedResult[]
  log: string[]
} {
  const log: string[] = []
  const objects: ParsedObject[] = []
  const results: ParsedResult[] = []
  /** № п.п. → объект: одна точка измерения общая для освещённости и пульсации */
  const objectByNo = new Map<string, number>()

  for (let h = 0; h <= grid.maxRow; h++) {
    if (isRowHidden(grid, h)) continue
    const kind = tableKind(grid, h)
    if (!kind) continue

    let room: string | null = null
    let r = h + 2
    for (; r <= grid.maxRow; r++) {
      const a = cellText(grid, r, 0)
      if (a && (isTableEnd(a) || tableKind(grid, r))) break
      const place = normalizeText(cellText(grid, r, COL_PLACE))
      if (!/^\d+$/.test(a.trim()) || !place) {
        // подзаголовок помещения (в т.ч. скрытый — им подписаны видимые строки)
        if (a && !/^\d+$/.test(a.trim())) room = a.trim()
        continue
      }
      if (isRowHidden(grid, r)) continue

      const no = a.trim()
      let objectSeq = objectByNo.get(no)
      if (objectSeq == null) {
        objectSeq = objects.length + 1
        objectByNo.set(no, objectSeq)
        objects.push({ seq: objectSeq, name: place, serialNo: null, year: null, department: room })
      }

      const fact = factText(grid, r, kind.valueCol)
      if (fact == null) {
        log.push(`light: строка ${r + 1} — нет значения`)
        continue
      }
      const cell = getCell(grid, r, kind.valueCol)
      const num = typeof cell?.v === 'number' ? cell.v : null
      results.push({
        seq: results.length + 1,
        objectSeq,
        sourceKey: kind.key,
        indicatorRaw: `${place}; ${normalizeText(cellText(grid, r, COL_PLANE))}`,
        unitSymbol: kind.unit,
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
    h = r - 1
  }

  log.push(`light: точек ${objects.length}, результатов ${results.length}`)
  return { objects, results, log }
}
