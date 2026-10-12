import { useEffect, useRef, type ReactNode } from 'react'
import {
  IconButton,
  IconPencil,
  IconTrash,
  MetaSep,
} from '@/shared/ui/icons'

export function SectionHead({
  title,
  summary,
  canWrite,
  onAdd,
  onExcel,
  addLabel = 'Добавить',
  excelLabel = 'Excel',
  busy,
}: {
  title: string
  summary?: ReactNode
  canWrite: boolean
  onAdd?: () => void
  onExcel?: (file: File) => void
  addLabel?: string
  excelLabel?: string
  busy?: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="section-head-block">
      <div className="section-head">
        <h2>{title}</h2>
        {canWrite && (onAdd || onExcel) && (
          <div className="section-head__actions">
            {onExcel && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  hidden
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) onExcel(f)
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  {excelLabel}
                </button>
              </>
            )}
            {onAdd && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={onAdd}
              >
                {addLabel}
              </button>
            )}
          </div>
        )}
      </div>
      {summary ? <p className="muted small">{summary}</p> : null}
    </div>
  )
}

export function ModalDialog({
  title,
  open,
  onClose,
  busy,
  children,
  footer,
}: {
  title: string
  open: boolean
  onClose: () => void
  busy?: boolean
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div className="form-stack">{children}</div>
        {footer ? <div className="form-actions">{footer}</div> : null}
      </div>
    </div>
  )
}

export function RowActions({
  canWrite,
  onEdit,
  onDelete,
}: {
  canWrite: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  if (!canWrite) return null
  return (
    <td className="row-actions">
      <span className="row-actions__group">
        <IconButton label="Изменить" onClick={onEdit}>
          <IconPencil />
        </IconButton>
        <IconButton label="Удалить" onClick={onDelete} danger>
          <IconTrash />
        </IconButton>
      </span>
    </td>
  )
}

export function ImportPreviewBlock({
  issues,
  rowCount,
  canCommit,
  onCommit,
  busy,
  children,
}: {
  issues: { severity: string; row: number; message: string; code: string }[]
  rowCount: number
  canCommit: boolean
  onCommit: () => void
  busy: boolean
  children?: ReactNode
}) {
  return (
    <div className="preview-box">
      <h3 className="page__meta">
        Предпросмотр
        <MetaSep />
        строк: {rowCount}
      </h3>
      {children}
      {issues.length > 0 ? (
        <ul className="issue-list">
          {issues.map((i, idx) => (
            <li
              key={`${i.code}-${i.row}-${idx}`}
              className={
                i.severity === 'error' ? 'issue issue--error' : 'issue issue--warn'
              }
            >
              [{i.severity === 'error' ? 'ошибка' : 'замечание'}] строка{' '}
              {i.row}: {i.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Замечаний нет</p>
      )}
      <button
        type="button"
        className="btn btn--primary"
        disabled={!canCommit || busy}
        onClick={onCommit}
      >
        Записать в справочник
      </button>
    </div>
  )
}
