/**
 * Примитивы предметной области.
 * - InstantUtc: timestamptz, хранение UTC (ISO-8601 с Z)
 * - CalendarDate: date без времени (YYYY-MM-DD)
 * - DisplayText: отображаемые значения (FactValue и т.п.) — text
 * - MeasureNumber: числовые замеры — number (double precision)
 */

export type EntityId = string
export type InstantUtc = string
export type CalendarDate = string
export type DisplayText = string
export type MeasureNumber = number

export type SoftDeletable = {
  deletedAt: InstantUtc | null
}

export function isActive<T extends SoftDeletable>(entity: T): boolean {
  return entity.deletedAt === null
}

export function softDelete<T extends SoftDeletable>(
  entity: T,
  at: InstantUtc = new Date().toISOString(),
): T {
  return { ...entity, deletedAt: at }
}
