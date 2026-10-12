import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  KeyRound,
  Pencil,
  Trash2,
  X,
  type LucideProps,
} from 'lucide-react'

/** Единый стиль иконок в UI (кнопки действий, пагинация). */
const uiIconDefaults: LucideProps = {
  size: 16,
  strokeWidth: 2,
  absoluteStrokeWidth: false,
  'aria-hidden': true,
}

function withDefaults(
  Icon: (props: LucideProps) => ReactNode,
  props: LucideProps,
) {
  return <Icon {...uiIconDefaults} {...props} />
}

export function IconArrowLeft(props: LucideProps) {
  return withDefaults(ArrowLeft, props)
}

export function IconCheck(props: LucideProps) {
  return withDefaults(Check, props)
}

export function IconClose(props: LucideProps) {
  return withDefaults(X, props)
}

export function IconChevronLeft(props: LucideProps) {
  return withDefaults(ChevronLeft, props)
}

/** Ссылка «назад» с иконкой вместо символа ← */
export function BackLink({
  to,
  children,
}: {
  to: string
  children: ReactNode
}) {
  return (
    <Link to={to} className="back-link">
      <IconArrowLeft size={14} strokeWidth={2.25} />
      <span>{children}</span>
    </Link>
  )
}

/** Разделитель метаданных вместо символа · */
export function MetaSep() {
  return <span className="meta-sep" aria-hidden="true" />
}

export function IconChevronRight(props: LucideProps) {
  return withDefaults(ChevronRight, props)
}

export function IconChevronDown(props: LucideProps) {
  return withDefaults(ChevronDown, props)
}

export function IconPencil(props: LucideProps) {
  return withDefaults(Pencil, props)
}

export function IconTrash(props: LucideProps) {
  return withDefaults(Trash2, props)
}

export function IconKey(props: LucideProps) {
  return withDefaults(KeyRound, props)
}

export function IconEye(props: LucideProps) {
  return withDefaults(Eye, props)
}

/** Документ / скан PDF */
export function IconFilePdf(props: LucideProps) {
  return withDefaults(FileText, props)
}

export function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={
        danger ? 'btn btn--icon btn--icon-danger' : 'btn btn--icon'
      }
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  )
}
