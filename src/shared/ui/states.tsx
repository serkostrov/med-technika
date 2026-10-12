import type { ReactNode } from 'react'

export function LoadingState({
  label = 'Загрузка…',
}: {
  label?: string
}) {
  return (
    <div className="state-panel" role="status" aria-busy="true">
      <div className="spinner" aria-hidden />
      <p>{label}</p>
    </div>
  )
}

export function EmptyState({
  title = 'Нет данных',
  description,
  action,
}: {
  title?: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="state-panel state-panel--empty">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  )
}

export function ErrorState({
  title = 'Не удалось загрузить',
  message,
  onRetry,
}: {
  title?: string
  message?: string
  onRetry?: () => void
}) {
  return (
    <div className="state-panel state-panel--error" role="alert">
      <h2>{title}</h2>
      {message ? <p>{message}</p> : null}
      {onRetry ? (
        <button type="button" className="btn btn--primary" onClick={onRetry}>
          Повторить
        </button>
      ) : null}
    </div>
  )
}
