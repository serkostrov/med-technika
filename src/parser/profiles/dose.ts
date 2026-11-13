import { normalizeText } from '@/dictionaries/normalize/text'
import { formatFactValue } from '../fact-value'
import {
  HEADER_MAX_COL,
  cellText,
  getCell,
  isRowHidden,
  type SheetGrid,
} from '../sheet-utils'
import type { ParsedObject, ParsedResult } from '../types'

/**
 * Профиль dose (26-ЭД — эффективные дозы облучения пациентов, МУ 2.6.1.2944-11).
 *
 * Таблица «Тип процедуры … | Фокусное расстояние | U | I | t | Q | Керма |
 * Радиационный выход (мА·мин) | Радиационный выход (мА·с) | Эффективная доза, мЗв».
 * Строки без чисел — группы («Взрослые», «Верхняя челюсть»), с числами — процедуры.
 * В ФГИС — радиационный выход на мА·с, затем эффективная доза (эталон 272-26-ЭД).
 */

const OUTPUT_UNIT = 'мГр·м²/(мА·с)'

type Column = { col: number; key: string; unit: string | null }

function norm(s: string): string {
  return normalizeText(s).toLowerCase().replace(/\s+/g, ' ')
}

function unitAfterComma(text: string): string | null {
  const parts = normalizeText(text).split(',').map((p) => p.trim())
  return parts.length >= 2 && parts[parts.length - 1] ? parts[parts.length - 1]! : null
}

function tableColumns(grid: SheetGrid, r: number): Column[] | null {
  if (!norm(cellText(grid, r, 0)).startsWith('тип процедуры')) return null
  const cols: Column[] = []
  for (let c = 1; c <= HEADER_MAX_COL; c++) {
    const t = cellText(grid, r, c)
    // «Радиаци-онный выход» — перенос со знаком дефиса
    const n = norm(t).replace(/-\s*/g, '').replace(/\s+/g, '')
    if (n.startsWith('радиационныйвыход') && /ма[*·]с\)/.test(n)) {
      cols.push({ col: c, key: 'radiation_output', unit: OUTPUT_UNIT })
    } else if (n.includes('эффективнаядоза')) {
      cols.push({ col: c, key: 'effective_dose', unit: unitAfterComma(t) })
    }
  }
  return cols.length ? cols : null
}

/** Число в ячейке; ошибки Excel (#DIV/0! — t='e', v=код) числом не считаем. */
function numericCell(grid: SheetGrid, r: number, c: number) {
  const cell = getCell(grid, r, c)
  return cell && cell.t !== 'e' && typeof cell.v === 'number' ? cell : null
}

function rowHasNumbers(grid: SheetGrid, r: number, cols: Column[]): boolean {
  return cols.some((c) => numericCell(grid, r, c.col) != null)
}

export function parseDose(grid: SheetGrid): {
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

    // группы: пациенты (Взрослые/Дети) → область (Верхняя/Нижняя челюсть)
    const groups: string[] = []
    const rows: { row: number; objectSeq: number }[] = []
    let r = h + 1
    for (; r <= grid.maxRow; r++) {
      const a = normalizeText(cellText(grid, r, 0))
      if (!a) continue
      const n = norm(a)
      if (n.startsWith('результаты измерений относятся') || n.startsWith('протокол оформил')) break
      if (!rowHasNumbers(grid, r, columns)) {
        if (/^(взрослые|дети)/.test(n)) groups.splice(0, groups.length, a)
        else groups.splice(1, groups.length, a)
        continue
      }
      if (isRowHidden(grid, r)) continue
      const objectSeq = objects.length + 1
      objects.push({
        seq: objectSeq,
        name: a,
        serialNo: null,
        year: null,
        department: groups.join(', ') || null,
      })
      rows.push({ row: r, objectSeq })
    }

    for (const col of columns) {
      for (const p of rows) {
        const cell = numericCell(grid, p.row, col.col)
        if (!cell || typeof cell.v !== 'number') continue
        const z = cell.z && cell.z !== 'General' ? cell.z : 'General'
        results.push({
          seq: results.length + 1,
          objectSeq: p.objectSeq,
          sourceKey: col.key,
          indicatorRaw: `${objects[p.objectSeq - 1]!.department ?? ''}: ${objects[p.objectSeq - 1]!.name}`,
          unitSymbol: col.unit,
          setValue: null,
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
    }
    h = r - 1
  }

  log.push(`dose: процедур ${objects.length}, результатов ${results.length}`)
  return { objects, results, log }
}
