import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Calendar } from 'lucide-react'
import {
  IconChevronLeft,
  IconChevronRight,
} from '@/shared/ui/icons'
import { formatCalendarDate } from '@/shared/time/moscow'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const
const MONTHS = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
] as const

type DatePickerProps = {
  value: string
  onChange?: (value: string) => void
  disabled?: boolean
  readOnly?: boolean
  placeholder?: string
  className?: string
  id?: string
  'aria-label'?: string
  allowClear?: boolean
}

function parseIso(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d!)
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m! - 1 ||
    dt.getDate() !== d
  ) {
    return null
  }
  return dt
}

function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDisplay(value: string): string {
  if (!parseIso(value)) return ''
  const formatted = formatCalendarDate(value)
  return formatted === '—' ? '' : formatted
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Календарная сетка: понедельник — первый день недели. */
function buildMonthGrid(view: Date): { date: Date; inMonth: boolean }[] {
  const first = startOfMonth(view)
  const weekday = (first.getDay() + 6) % 7 // Mon=0
  const start = new Date(first)
  start.setDate(first.getDate() - weekday)
  const cells: { date: Date; inMonth: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    cells.push({
      date,
      inMonth: date.getMonth() === view.getMonth(),
    })
  }
  return cells
}

export function DatePicker({
  value,
  onChange,
  disabled = false,
  readOnly = false,
  placeholder = 'дд.мм.гггг',
  className,
  id,
  'aria-label': ariaLabel,
  allowClear = true,
}: DatePickerProps) {
  const selected = useMemo(() => parseIso(value), [value])
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => selected ?? new Date())
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const today = useMemo(() => {
    const t = new Date()
    return new Date(t.getFullYear(), t.getMonth(), t.getDate())
  }, [])

  const locked = disabled || readOnly

  function placeMenu() {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const menuW = 292
    const menuH = 340
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < menuH && rect.top > spaceBelow
    let left = rect.left
    if (left + menuW > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - menuW - 8)
    }
    setMenuStyle({
      position: 'fixed',
      left,
      width: menuW,
      top: openUp ? undefined : rect.bottom + 6,
      bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
      zIndex: 80,
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    placeMenu()
    function onScroll() {
      placeMenu()
    }
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggle() {
    if (locked) return
    setOpen((v) => {
      const next = !v
      if (next) setView(selected ?? new Date())
      return next
    })
  }

  function choose(d: Date) {
    onChange?.(toIso(d))
    setOpen(false)
  }

  function clear() {
    onChange?.('')
    setOpen(false)
  }

  function onTriggerKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (locked) return
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setView(selected ?? new Date())
      setOpen(true)
    }
  }

  const grid = useMemo(() => buildMonthGrid(view), [view])
  const label = formatDisplay(value)
  const monthName = MONTHS[view.getMonth()] ?? ''
  const title = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${view.getFullYear()}`

  return (
    <div
      ref={rootRef}
      className={['ui-datepicker', open ? 'ui-datepicker--open' : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className="ui-datepicker__trigger"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-readonly={readOnly || undefined}
        onClick={toggle}
        onKeyDown={onTriggerKey}
      >
        <span
          className={
            label
              ? 'ui-datepicker__value'
              : 'ui-datepicker__value ui-datepicker__value--placeholder'
          }
        >
          {label || placeholder}
        </span>
        <Calendar size={16} strokeWidth={2} aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            className="ui-datepicker__menu"
            role="dialog"
            aria-label="Выбор даты"
            style={menuStyle}
          >
            <div className="ui-datepicker__header">
              <button
                type="button"
                className="ui-datepicker__nav"
                aria-label="Предыдущий месяц"
                onClick={() =>
                  setView(
                    new Date(view.getFullYear(), view.getMonth() - 1, 1),
                  )
                }
              >
                <IconChevronLeft size={16} />
              </button>
              <div className="ui-datepicker__title">{title}</div>
              <button
                type="button"
                className="ui-datepicker__nav"
                aria-label="Следующий месяц"
                onClick={() =>
                  setView(
                    new Date(view.getFullYear(), view.getMonth() + 1, 1),
                  )
                }
              >
                <IconChevronRight size={16} />
              </button>
            </div>

            <div className="ui-datepicker__weekdays" aria-hidden="true">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>

            <div className="ui-datepicker__grid" role="grid">
              {grid.map(({ date, inMonth }) => {
                const iso = toIso(date)
                const isSelected = selected ? sameDay(date, selected) : false
                const isToday = sameDay(date, today)
                return (
                  <button
                    key={iso}
                    type="button"
                    role="gridcell"
                    className={[
                      'ui-datepicker__day',
                      inMonth ? '' : 'ui-datepicker__day--muted',
                      isSelected ? 'ui-datepicker__day--selected' : '',
                      isToday ? 'ui-datepicker__day--today' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => choose(date)}
                  >
                    {date.getDate()}
                  </button>
                )
              })}
            </div>

            <div className="ui-datepicker__footer">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => choose(today)}
              >
                Сегодня
              </button>
              {allowClear ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={clear}
                >
                  Очистить
                </button>
              ) : null}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
