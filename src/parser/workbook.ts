import * as XLSX from 'xlsx'
import {
  type SheetCell,
  type SheetGrid,
  encodeCell,
} from './sheet-utils'

/**
 * Читаем сохранённые значения формул и number_format (ТЗ §3).
 * Формулы не пересчитываем.
 */
export function loadWorkbookGrids(data: ArrayBuffer): SheetGrid[] {
  const wb = XLSX.read(data, {
    type: 'array',
    cellNF: true,
    cellDates: false,
    raw: false,
  })

  return wb.SheetNames.map((name) => {
    const sheet = wb.Sheets[name]
    const cells = new Map<number, Map<number, SheetCell>>()
    let maxRow = 0
    let maxCol = 0
    if (!sheet) {
      return { name, cells, maxRow, maxCol }
    }
    const ref = sheet['!ref']
    if (ref) {
      const range = XLSX.utils.decode_range(ref)
      maxRow = range.e.r
      maxCol = range.e.c
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = encodeCell(r, c)
          const raw = sheet[addr] as XLSX.CellObject | undefined
          if (!raw) continue
          let rowMap = cells.get(r)
          if (!rowMap) {
            rowMap = new Map()
            cells.set(r, rowMap)
          }
          rowMap.set(c, {
            v: raw.v,
            w: raw.w,
            z: typeof raw.z === 'string' ? raw.z : undefined,
            t: raw.t,
          })
        }
      }
    }
    return { name, cells, maxRow, maxCol }
  })
}

export function setCell(
  sheet: XLSX.WorkSheet,
  r: number,
  c: number,
  value: string | number,
  z?: string,
): void {
  const addr = encodeCell(r, c)
  if (typeof value === 'number') {
    sheet[addr] = { t: 'n', v: value, z: z ?? 'General' }
  } else {
    sheet[addr] = { t: 's', v: value }
  }
}
