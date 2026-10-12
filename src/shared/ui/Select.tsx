import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { IconCheck, IconChevronDown } from '@/shared/ui/icons'

export type SelectOption = {
  value: string
  label: string
  disabled?: boolean
}

type SelectProps = {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  disabled?: boolean
  placeholder?: string
  className?: string
  id?: string
  'aria-label'?: string
}

export function Select({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = '—',
  className,
  id,
  'aria-label': ariaLabel,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const selected = options.find((o) => o.value === value)
  const label = selected?.label ?? placeholder

  function placeMenu() {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < 220 && rect.top > spaceBelow
    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: Math.max(rect.width, 160),
      top: openUp ? undefined : rect.bottom + 4,
      bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
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
    if (disabled) return
    setOpen((v) => !v)
  }

  function choose(next: string) {
    onChange(next)
    setOpen(false)
  }

  function onTriggerKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen(true)
    }
  }

  return (
    <div
      ref={rootRef}
      className={['ui-select', open ? 'ui-select--open' : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className="ui-select__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={toggle}
        onKeyDown={onTriggerKey}
      >
        {/* Внутренний flex: у button в WebKit align-items часто не центрирует текст */}
        <span className="ui-select__inner">
          <span
            className={
              selected
                ? 'ui-select__value'
                : 'ui-select__value ui-select__value--placeholder'
            }
          >
            {label}
          </span>
          <span className="ui-select__chevron" aria-hidden="true">
            <IconChevronDown size={14} strokeWidth={2} />
          </span>
        </span>
      </button>
      {open &&
        createPortal(
          <ul
            ref={menuRef}
            id={listId}
            className="ui-select__menu"
            role="listbox"
            style={menuStyle}
            aria-activedescendant={
              selected ? `${listId}-${selected.value || 'empty'}` : undefined
            }
          >
            {options.map((opt) => {
              const active = opt.value === value
              const optId = `${listId}-${opt.value || 'empty'}`
              return (
                <li key={optId} role="presentation">
                  <button
                    type="button"
                    id={optId}
                    role="option"
                    aria-selected={active}
                    disabled={opt.disabled}
                    className={
                      active
                        ? 'ui-select__option ui-select__option--active'
                        : 'ui-select__option'
                    }
                    onClick={() => choose(opt.value)}
                  >
                    <span>{opt.label}</span>
                    {active ? (
                      <span className="ui-select__check" aria-hidden="true">
                        <IconCheck size={14} strokeWidth={2.5} />
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>,
          document.body,
        )}
    </div>
  )
}
