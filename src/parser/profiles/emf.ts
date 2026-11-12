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
 * Профиль emf (26-ПЧ, ФР.1.34.2021.39109 — ЭМП на рабочих местах).
 *
 * Таблица: «Высота точек изм., м.» | показатель (магнитное / электрическое поле, ППЭ, ЭСП)
 * → строка диапазонов частот → строка «изм. / ±U» → рабочие места «N. …» и строки высот.
 * В ФГИС уходят значения «изм.» как в ячейке (в т.ч. «≤62,5»); порядок — по показателю,
 * внутри показателя — по высотам (эталон 52-26-ПЧ). Правее BB — служебные расчёты.
 */

type Column = { col: number; key: string; indicator: string; unit: string | null }

function norm(s: string): string {
  return normalizeText(s).toLowerCase()
}

function fieldKind(text: string): { code: string; name: string } | null {
  const t = norm(text)
  if (t.includes('магнитн')) return { code: 'h', name: 'Напряженность магнитного поля' }
  if (t.includes('ппэ')) return { code: 'ppe', name: 'Плотность потока энергии' }
  if (t.includes('эсп') || t.includes('электростат')) {
    return { code: 'esp', name: 'Напряженность электростатического поля' }
  }
  if (t.includes('электрическ')) return { code: 'e', name: 'Напряженность электрического поля' }
  return null
}

/** «…поля, нТл, в диапазоне…» → «нТл» */
function unitOf(text: string): string | null {
  const parts = normalizeText(text).split(',').map((p) => p.trim())
  return parts.length >= 2 && parts[1] ? parts[1] : null
}

/** «5Гц-<2кГц» → { code: '5hz_2khz', text: '5 Гц - < 2 кГц' } */
function bandOf(text: string): { code: string; text: string } | null {
  const t = norm(text).replace(/\s+/g, '')
  if (!t) return null
  if (t.startsWith('5гц')) return { code: '5hz_2khz', text: '5 Гц - < 2 кГц' }
  if (t.startsWith('2-') || t.startsWith('2кгц')) return { code: '2_400khz', text: '2 кГц - < 400 кГц' }
  if (t.startsWith('300мгц')) return { code: '300mhz_40ghz', text: '300 МГц - 40 ГГц' }
  return { code: t, text: normalizeText(text) }
}

function isTableHeader(grid: SheetGrid, r: number): boolean {
  return norm(cellText(grid, r, 0)).startsWith('высота точек')
}

function tableColumns(grid: SheetGrid, headerRow: number): Column[] {
  const kinds: { col: number; kind: { code: string; name: string }; unit: string | null }[] = []
  for (let c = 1; c <= HEADER_MAX_COL; c++) {
    const t = cellText(grid, headerRow, c)
    const kind = t ? fieldKind(t) : null
    if (kind) kinds.push({ col: c, kind, unit: unitOf(t) })
  }
  const bandRow = headerRow + 1
  const columns: Column[] = []
  kinds.forEach((k, i) => {
    const end = i + 1 < kinds.length ? kinds[i + 1]!.col : HEADER_MAX_COL + 1
    const bands: { col: number; band: { code: string; text: string } }[] = []
    for (let c = k.col; c < end; c++) {
      const band = bandOf(cellText(grid, bandRow, c))
      if (band) bands.push({ col: c, band })
    }
    if (bands.length === 0) {
      // ЭСП — без диапазона частот
      columns.push({ col: k.col, key: k.kind.code, indicator: k.kind.name, unit: k.unit })
      return
    }
    for (const b of bands) {
      columns.push({
        col: b.col,
        key: `${k.kind.code}_${b.band.code}`,
        indicator: `${k.kind.name} в диапазоне частот ${b.band.text}`,
        unit: k.unit,
      })
    }
  })
  return columns
}

function factText(grid: SheetGrid, r: number, c: number): string | null {
  const cell = getCell(grid, r, c)
  if (!cell || cell.v == null || cell.v === '') return null
  if (typeof cell.v === 'number') {
    const z = cell.z && cell.z !== 'General' ? cell.z : '0.00'
    return formatFactValue(cell.v, z)
  }
  const t = normalizeText(String(cell.v))
  if (!t || t === '-' || t === '—') return null
  // «≤62,5» / «<0,265» — как напечатано
  return t.replace(/\./g, ',')
}

export function parseEmf(grid: SheetGrid): {
  objects: ParsedObject[]
  results: ParsedResult[]
  log: string[]
} {
  const log: string[] = []
  const objects: ParsedObject[] = []
  const results: ParsedResult[] = []

  for (let h = 0; h <= grid.maxRow; h++) {
    if (isRowHidden(grid, h) || !isTableHeader(grid, h)) continue
    const columns = tableColumns(grid, h)
    if (columns.length === 0) {
      log.push(`emf: строка ${h + 1} — не найдены колонки показателей`)
      continue
    }

    // строки таблицы: рабочие места и высоты
    type Point = { row: number; objectSeq: number; height: string }
    const points: Point[] = []
    let objectSeq = 0
    let r = h + 3 // заголовок, диапазоны, «изм./±U»
    for (; r <= grid.maxRow; r++) {
      if (isRowHidden(grid, r)) continue
      const a = cellText(grid, r, 0)
      const an = norm(a)
      if (!a) continue
      if (an.startsWith('пду') || isTableHeader(grid, r) || an.startsWith('±u')) break
      const m = /^\s*\d+\s*[.)]\s*(\D.*)$/.exec(a)
      if (m) {
        objectSeq = objects.length + 1
        objects.push({ seq: objectSeq, name: m[1]!.trim(), serialNo: null, year: null, department: null })
        continue
      }
      if (!objectSeq) {
        // таблица без нумерации рабочих мест — одно место
        objectSeq = objects.length + 1
        objects.push({ seq: objectSeq, name: null, serialNo: null, year: null, department: null })
      }
      points.push({ row: r, objectSeq, height: a.trim() })
    }

    const objectSeqs = [...new Set(points.map((p) => p.objectSeq))]
    for (const seq of objectSeqs) {
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

  log.push(`emf: рабочих мест ${objects.length}, результатов ${results.length}`)
  return { objects, results, log }
}
