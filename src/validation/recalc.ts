import type { FormIndicatorMap } from '@/domain'
import type { ServerRecalc } from './values'

export type UbParams = { type: 'rel' | 'abs'; value: number }

/**
 * Пересчёт среднего и неопределённости (ТЗ §6.5).
 * avg = mean(a1..a4)
 * uA  = sqrt( var_sample(a1..a4) / 4 )
 * uB  = rel: avg * delta / sqrt(3)  |  abs: delta / sqrt(3)
 * u   = sqrt(uA² + uB²);  U = 2 * u
 */
export function recalcMeanAndU(
  rawValues: number[],
  ub: UbParams | null,
): ServerRecalc {
  const n = rawValues.length
  if (n === 0) {
    return { avg: NaN, uA: NaN, uB: NaN, u: NaN, U: NaN }
  }
  const avg = rawValues.reduce((a, b) => a + b, 0) / n
  let variance = 0
  if (n > 1) {
    variance = rawValues.reduce((s, x) => s + (x - avg) ** 2, 0) / (n - 1)
  }
  const uA = Math.sqrt(variance / n)
  let uB = 0
  if (ub) {
    uB =
      ub.type === 'rel'
        ? (avg * ub.value) / Math.sqrt(3)
        : ub.value / Math.sqrt(3)
  }
  const u = Math.sqrt(uA * uA + uB * uB)
  return { avg, uA, uB, u, U: 2 * u }
}

export function exceedsRecalcTolerance(
  calc: number,
  excel: number,
  tolerance: number,
): boolean {
  if (!Number.isFinite(calc) || !Number.isFinite(excel)) return false
  return Math.abs(calc - excel) > tolerance * Math.max(1, Math.abs(excel))
}

export function ubFromMap(map: FormIndicatorMap | undefined | null): UbParams | null {
  return map?.ub ?? null
}

export function getRecalcTolerance(settings: { key: string; value: unknown }[]): number {
  const raw = settings.find((s) => s.key === 'recalc_tolerance')?.value
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : 1e-6
}
