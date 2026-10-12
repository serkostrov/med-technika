import type { FormIndicatorMap } from '@/domain'
import { formatFactValue } from '../fact-value'
import { recalcMeanAndU, ubFromMap } from '../recalc'
import {
  COL,
  cellNumber,
  cellText,
  getCell,
  type SheetGrid,
} from '../sheet-utils'
import type { ParsedObject, ParsedResult } from '../types'

const OBJECT_RE =
  /^(\d+)\.\s*Дефибриллятор:\s*(.+?),\s*зав\.?\s*№\s*([^,]+)(?:,\s*(\d{4})\s*г\.?)?/i

type BlockKey = 'energy_le2kv' | 'energy_2_8kv' | 'interval'

function detectBlock(text: string): BlockKey | null {
  const t = text.toLowerCase()
  if (!t.includes('результат')) return null
  if (t.includes('интервал')) return 'interval'
  if (t.includes('до 2') || t.includes('до2')) return 'energy_le2kv'
  if (t.includes('от 2') || t.includes('2 до 8') || t.includes('до 8')) {
    return 'energy_2_8kv'
  }
  if (t.includes('энерг')) return 'energy_le2kv'
  return null
}

function bbBe(grid: SheetGrid, r: number): number[] | null {
  const vals: number[] = []
  for (const c of [COL.BB, COL.BC, COL.BD, COL.BE]) {
    const n = cellNumber(grid, r, c)
    if (n == null) return null
    vals.push(n)
  }
  return vals
}

/**
 * Профиль physio-df (Дефибриллятор ИЭВИ) — ТЗ §6.4.
 */
export function parsePhysioDf(
  grid: SheetGrid,
  maps: readonly FormIndicatorMap[],
  recalcTolerance: number,
): { objects: ParsedObject[]; results: ParsedResult[]; log: string[] } {
  const log: string[] = []
  const objects: ParsedObject[] = []
  const results: ParsedResult[] = []

  let currentObjectSeq: number | null = null
  let currentDepartment: string | null = null
  let currentBlock: BlockKey | null = null
  const objectBySerial = new Map<string, number>()

  for (let r = 0; r <= grid.maxRow; r++) {
    const a = cellText(grid, r, COL.A)
    if (!a) continue

    const block = detectBlock(a)
    if (block) {
      currentBlock = block
      continue
    }

    const obj = OBJECT_RE.exec(a)
    if (obj) {
      const prev = cellText(grid, r - 1, COL.A)
      if (
        prev &&
        !OBJECT_RE.test(prev) &&
        !detectBlock(prev) &&
        !/результат/i.test(prev)
      ) {
        currentDepartment = prev
      }
      const serial = obj[3]!.trim()
      const existing = objectBySerial.get(serial.toUpperCase())
      if (existing != null) {
        currentObjectSeq = existing
        const o = objects.find((x) => x.seq === existing)
        if (o && !o.year && obj[4]) o.year = obj[4]
      } else {
        currentObjectSeq = objects.length + 1
        objectBySerial.set(serial.toUpperCase(), currentObjectSeq)
        const year = obj[4] ?? null
        if (!year) log.push(`W06-кандидат: нет года у объекта ${obj[2]}`)
        objects.push({
          seq: currentObjectSeq,
          name: obj[2]!.trim(),
          serialNo: serial,
          year,
          department: currentDepartment,
        })
      }
      continue
    }

    const rawValues = bbBe(grid, r)
    if (!rawValues || !currentBlock || currentObjectSeq == null) continue

    const yCell = getCell(grid, r, COL.Y)
    const displayValue = cellNumber(grid, r, COL.Y)
    const numberFormat = yCell?.z ?? (currentBlock === 'interval' ? '0.0' : '0')
    const uExcel = cellNumber(grid, r, COL.AM)
    const setValue = a || null
    const map = maps.find((m) => m.sourceKey === currentBlock)
    const recalc = recalcMeanAndU(rawValues, ubFromMap(map))

    // для энергии без BB иногда значение только в Y
    const factSource =
      displayValue != null
        ? displayValue
        : Number.isFinite(recalc.avg)
          ? recalc.avg
          : 0

    const factValue = formatFactValue(factSource, numberFormat)

    if (
      displayValue != null &&
      Number.isFinite(recalc.avg) &&
      Math.abs(recalc.avg - displayValue) >
        recalcTolerance * Math.max(1, Math.abs(displayValue))
    ) {
      void recalcTolerance
    }

    results.push({
      seq: results.length + 1,
      objectSeq: currentObjectSeq,
      sourceKey: currentBlock,
      indicatorRaw:
        currentBlock === 'interval'
          ? 'Интервал времени'
          : 'Энергия высоковольтного импульса',
      unitSymbol: currentBlock === 'interval' ? 'с' : 'Дж',
      setValue,
      rawValues,
      avgExcel: displayValue,
      uExcel,
      avgCalc: recalc.avg,
      uCalc: recalc.U,
      numberFormat,
      factValue,
      displayValue,
    })
  }

  log.push(
    `physio-df: объектов ${objects.length}, результатов ${results.length}`,
  )
  return { objects, results, log }
}
