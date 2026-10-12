import type { CalendarDate, InstantUtc } from '@/domain'

const MOSCOW = 'Europe/Moscow'
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T/

/** Отображение timestamptz (UTC) по Москве: дд.мм.гггг, чч:мм. */
export function formatMoscowDateTime(
  utc: InstantUtc | string | null | undefined,
): string {
  if (!utc) return '—'
  const d = new Date(utc)
  if (Number.isNaN(d.getTime())) return String(utc)
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: MOSCOW,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

/** Календарный день по Москве из timestamptz: дд.мм.гггг. */
export function formatMoscowDate(
  utc: InstantUtc | string | null | undefined,
): string {
  if (!utc) return '—'
  const d = new Date(utc)
  if (Number.isNaN(d.getTime())) return String(utc)
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: MOSCOW,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

/** Отображение calendar date (YYYY-MM-DD) без сдвига часового пояса → дд.мм.гггг. */
export function formatCalendarDate(
  date: CalendarDate | string | null | undefined,
): string {
  if (date == null || date === '') return '—'
  const m = ISO_DATE_RE.exec(date)
  if (!m) return date
  return `${m[3]}.${m[2]}.${m[1]}`
}

/** Автоформат ISO-даты или момента для UI. */
export function formatUiTemporal(value: string): string {
  const t = value.trim()
  if (ISO_DATE_RE.test(t)) return formatCalendarDate(t)
  if (ISO_INSTANT_RE.test(t)) return formatMoscowDateTime(t)
  return t
}
