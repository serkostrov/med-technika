import Decimal from 'decimal.js'
import type { ExcelDisplayValue, FactValueText } from './values'

Decimal.set({ rounding: Decimal.ROUND_HALF_UP })

/**
 * FactValue из отображаемого Excel-значения (ТЗ §6.6).
 * Не использовать ServerRecalc / avgCalc.
 */
export function computeFactValue(display: ExcelDisplayValue): FactValueText {
  if (display.value == null || !Number.isFinite(display.value)) {
    return ''
  }
  return formatFactValue(display.value, display.numberFormat)
}

export function formatFactValue(
  value: number,
  numberFormat: string | null | undefined,
): FactValueText {
  const v = Number(Number(value).toPrecision(15))
  if (!Number.isFinite(v)) return String(value)

  const fmt = numberFormat?.trim() || 'General'
  if (/^general$/i.test(fmt)) {
    return shortestRepresentation(v)
  }

  const decimals = decimalsFromFormat(fmt)
  if (decimals === null) {
    return shortestRepresentation(v)
  }

  const rounded = new Decimal(v).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP)
  if (decimals === 0) {
    return rounded.toFixed(0)
  }
  return rounded.toFixed(decimals).replace('.', ',')
}

function decimalsFromFormat(fmt: string): number | null {
  const m = /^0(\.(0+))?/.exec(fmt.replace(/\\/g, ''))
  if (!m) return null
  return m[2] ? m[2].length : 0
}

function shortestRepresentation(v: number): string {
  return String(Number(v.toPrecision(15))).replace('.', ',')
}

export function parseFactValueNumber(factValue: string): number | null {
  const n = Number(factValue.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** 10 эталонных кейсов ТЗ §6.6 */
export const FACT_VALUE_CASES: {
  value: number
  format: string
  expected: string
}[] = [
  { value: 63.27, format: '0.0', expected: '63,3' },
  { value: 6.952500000000001, format: '0.0', expected: '7,0' },
  { value: 27.13025, format: '0.000', expected: '27,130' },
  { value: 27.686999999999998, format: '0.000', expected: '27,687' },
  { value: 92.465, format: '0.00', expected: '92,47' },
  { value: 5.0925, format: '0.00', expected: '5,09' },
  { value: 6.5, format: '0', expected: '7' },
  { value: 162.5, format: '0', expected: '163' },
  { value: 119, format: 'General', expected: '119' },
  { value: 9.350000000000001, format: '0.0', expected: '9,4' },
]
