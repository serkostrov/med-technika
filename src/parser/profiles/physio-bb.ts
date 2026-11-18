import type { FormIndicatorMap } from '@/domain'
import { formatFactValue } from '../fact-value'
import { recalcMeanAndU, ubFromMap } from '../recalc'
import {
  COL,
  cellNumber,
  cellText,
  getCell,
  isRowHidden,
  type SheetGrid,
} from '../sheet-utils'
import type { ParsedObject, ParsedResult } from '../types'

function splitIndicatorUnit(ac: string): { indicator: string; unit: string | null } {
  const idx = ac.lastIndexOf(',')
  if (idx < 0) return { indicator: ac.trim(), unit: null }
  return {
    indicator: ac.slice(0, idx).trim(),
    unit: ac.slice(idx + 1).trim() || null,
  }
}

function sourceKey(indicator: string, unit: string | null): string {
  return `${indicator}${unit ? `, ${unit}` : ''}`.toLowerCase()
}

/**
 * Заголовок блока: A = «№», показатель «<название>, <единица>» — обычно в AC,
 * но бывает правее (26-МТ «Лазер ИМИ»: «Длительность импульса, нс» в AK);
 * «Длина волны …» — описательная колонка, не показатель.
 */
function blockIndicator(grid: SheetGrid, r: number): string | null {
  if (cellText(grid, r, COL.A).trim() !== '№') return null
  for (let c = COL.AC; c <= COL.AS; c++) {
    const t = cellText(grid, r, c)
    if (t.includes(',') && !/^длина волны/i.test(t.trim())) return t
  }
  return null
}

/** Режим поля (26-МТ «Магнито-терапия», колонка K): от него зависит позиция ОА. */
const FIELD_MODE_RE = /^(переменн|импульсн|постоянн)/i
const COL_MODE = 10 // K

function bbBeAllNumeric(grid: SheetGrid, r: number): number[] | null {
  const vals: number[] = []
  for (const c of [COL.BB, COL.BC, COL.BD, COL.BE]) {
    const n = cellNumber(grid, r, c)
    if (n == null) return null
    vals.push(n)
  }
  return vals
}

/**
 * Профиль physio-bb (26-МТ: УВЧ, НЧ) — ТЗ §6.4.
 */
export function parsePhysioBb(
  grid: SheetGrid,
  maps: readonly FormIndicatorMap[],
  recalcTolerance: number,
): { objects: ParsedObject[]; results: ParsedResult[]; log: string[] } {
  const log: string[] = []
  const objects: ParsedObject[] = []
  const results: ParsedResult[] = []

  // найти заголовок блока: A=«№», показатель в AC (или правее)
  let headerRow = -1
  for (let r = 0; r <= grid.maxRow; r++) {
    if (blockIndicator(grid, r)) {
      headerRow = r
      break
    }
  }
  if (headerRow < 0) {
    log.push('physio-bb: не найден заголовок блока результатов (A=№, AC=показатель)')
    return { objects, results, log }
  }

  // текущий показатель из заголовка / смены AC в заголовочных строках
  let currentIndicator = blockIndicator(grid, headerRow)!
  let objectSeq = 0
  const objectKey = new Map<string, number>()

  for (let r = headerRow + 1; r <= grid.maxRow; r++) {
    // новый подзаголовок показателя — учитываем и скрытый (его строки тоже скрыты,
    // но следующий видимый блок без заголовка иначе получил бы чужой показатель)
    const header = blockIndicator(grid, r)
    if (header) {
      currentIndicator = header
      continue
    }
    if (isRowHidden(grid, r)) continue

    const rawValues = bbBeAllNumeric(grid, r)
    if (!rawValues) continue

    const name = cellText(grid, r, COL.C)
    const serial = cellText(grid, r, COL.S)
    const year = cellText(grid, r, COL.Y)

    if (name) {
      const key = `${normalizeKey(name)}|${normalizeKey(serial)}`
      const existing = objectKey.get(key)
      if (existing != null) {
        objectSeq = existing
      } else {
        objectSeq = objects.length + 1
        objectKey.set(key, objectSeq)
        objects.push({
          seq: objectSeq,
          name,
          serialNo: serial || null,
          year: year || null,
          department: null,
        })
      }
    }

    const { indicator, unit } = splitIndicatorUnit(currentIndicator)
    const mode = cellText(grid, r, COL_MODE).trim()
    const key = FIELD_MODE_RE.test(mode)
      ? `${sourceKey(indicator, unit)} | ${mode.toLowerCase()}`
      : sourceKey(indicator, unit)
    const map = maps.find((m) => m.sourceKey === key)

    const setValue = cellText(grid, r, COL.AC) || null

    const akCell = getCell(grid, r, COL.AK)
    const displayValue =
      cellNumber(grid, r, COL.AK) ??
      (akCell?.v != null ? Number(akCell.v) : null)
    const numberFormat = akCell?.z ?? '0.0'
    const avgExcel = cellNumber(grid, r, COL.BF)
    const uExcel = cellNumber(grid, r, COL.BJ)
    const ubExcel = cellNumber(grid, r, COL.BH)

    const recalc = recalcMeanAndU(rawValues, ubFromMap(map), ubExcel)
    const factSource =
      displayValue != null
        ? displayValue
        : avgExcel != null
          ? avgExcel
          : recalc.avg
    const factValue = formatFactValue(factSource, numberFormat)

    if (
      avgExcel != null &&
      Number.isFinite(recalc.avg) &&
      Math.abs(recalc.avg - avgExcel) >
        recalcTolerance * Math.max(1, Math.abs(avgExcel))
    ) {
      log.push(
        `W02-кандидат: ${key} avg calc=${recalc.avg} excel=${avgExcel}`,
      )
    }

    results.push({
      seq: results.length + 1,
      objectSeq: objectSeq || null,
      sourceKey: key,
      indicatorRaw: indicator,
      unitSymbol: unit,
      setValue,
      rawValues,
      avgExcel,
      uExcel,
      ubExcel,
      avgCalc: recalc.avg,
      uCalc: recalc.U,
      numberFormat,
      factValue,
      displayValue,
    })
  }

  log.push(
    `physio-bb: объектов ${objects.length}, результатов ${results.length}`,
  )
  return { objects, results, log }
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}
