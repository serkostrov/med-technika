import { normalizeText } from '@/dictionaries/normalize/text'

export function colIndex(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n - 1
}

export const COL = {
  A: 0,
  C: 2,
  S: 18,
  Y: 24,
  AC: 28,
  AK: 36,
  AM: 38,
  AS: 44,
  BB: 53,
  BC: 54,
  BD: 55,
  BE: 56,
  BF: 57,
  BG: 58,
  BH: 59,
  BI: 60,
  BJ: 61,
} as const

/** Столбцы BB и правее в шапке игнорируем (ТЗ §6.3). */
export const HEADER_MAX_COL = COL.BB - 1

export type SheetCell = {
  v: unknown
  w?: string
  z?: string
  t?: string
}

export type SheetGrid = {
  name: string
  /** row → col → cell */
  cells: Map<number, Map<number, SheetCell>>
  maxRow: number
  maxCol: number
}

export function encodeCell(r: number, c: number): string {
  let col = ''
  let n = c + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    col = String.fromCharCode(65 + rem) + col
    n = Math.floor((n - 1) / 26)
  }
  return `${col}${r + 1}`
}

export function getCell(grid: SheetGrid, r: number, c: number): SheetCell | null {
  return grid.cells.get(r)?.get(c) ?? null
}

export function cellText(grid: SheetGrid, r: number, c: number): string {
  const cell = getCell(grid, r, c)
  if (!cell) return ''
  if (cell.w != null && String(cell.w).trim() !== '') return String(cell.w).trim()
  if (cell.v == null) return ''
  return String(cell.v).trim()
}

export function cellNumber(grid: SheetGrid, r: number, c: number): number | null {
  const cell = getCell(grid, r, c)
  if (!cell || cell.v == null || cell.v === '') return null
  if (typeof cell.v === 'number' && Number.isFinite(cell.v)) return cell.v
  const n = Number(String(cell.v).replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(n) ? n : null
}

export function normalizeSheetName(name: string): string {
  return normalizeText(name)
}

export function sheetLooksService(name: string): boolean {
  const n = normalizeSheetName(name).toLowerCase()
  const patterns = [
    /^рп\b/,
    /^списки/,
    /^оценка результатов/,
    /^автозаполнение/,
    /^рисунки/,
    /^подсказки/,
    /^приложение/,
    /^этикетк/,
    /^кривая\s*pb/,
    /^измерение/,
  ]
  return patterns.some((p) => p.test(n))
}

export function findAnchorRows(
  grid: SheetGrid,
  anchors: string[],
): number[] {
  const norms = anchors.map((a) => normalizeText(a).toLowerCase())
  const rows: number[] = []
  for (let r = 0; r <= grid.maxRow; r++) {
    const text = normalizeText(cellText(grid, r, COL.A)).toLowerCase()
    if (!text) continue
    if (norms.some((a) => text.includes(a) || text.startsWith(a))) {
      rows.push(r)
    }
  }
  return rows
}

/** Первая непустая ячейка правее якоря в той же строке, до BB (ТЗ §6.3). */
export function valueRightOf(grid: SheetGrid, row: number): string {
  for (let c = 1; c <= HEADER_MAX_COL; c++) {
    const t = cellText(grid, row, c)
    if (t) return t
  }
  return ''
}

export function parseRuDate(text: string): string | null {
  const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(text)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

export const PROTOCOL_LINE_RE =
  /Протокол\s*№\s*(\S+)\s+от\s+(\d{2}\.\d{2}\.\d{4})/i

export function isTemplateProtocolNumber(number: string): boolean {
  const n = number.trim()
  if (!n) return true
  if (/^[_\-–—XxХх.]+$/.test(n)) return true
  if (/[XxХх]{2,}/.test(n)) return true
  if (/^№?\.?$/.test(n)) return true
  return false
}

export function extractPhoneDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 11 && digits.startsWith('7')) {
    return `8${digits.slice(1)}`
  }
  if (digits.length === 11 && digits.startsWith('8')) return digits
  if (digits.length === 10) return `8${digits}`
  return digits
}
