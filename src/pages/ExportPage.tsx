import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  PROTOCOL_STATUS_LABELS,
  ProtocolStatus,
} from '@/domain'
import { useAuth } from '@/client/auth-context'
import { fetchProtocols } from '@/client/api'
import { apiFetchJson } from '@/client/dictionaries-api'
import { useToast } from '@/shared/ui/toast'
import { MetaSep } from '@/shared/ui/icons'
import {
  formatCalendarDate,
  formatMoscowDate,
  formatMoscowDateTime,
} from '@/shared/time/moscow'
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/states'
import type { ProtocolListRow } from '@/server/protocol/list-query'

type ExportRow = {
  id: string
  filePath: string
  fileName?: string
  fileSize: number | null
  protocolsCount: number | null
  createdAt: string
  createdByName?: string | null
  uploadedMarkedAt: string | null
}

type BuildResult = {
  exportId: string
  fileName: string
  fileSize: number
  includedProtocolIds: string[]
  skipped: { protocolId: string; number: string; reason: string }[]
}

const MAX = 100

export function ExportPage() {
  const { capabilities } = useAuth()
  const { notify } = useToast()
  const [candidates, setCandidates] = useState<ProtocolListRow[] | null>(null)
  const [exports, setExports] = useState<ExportRow[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lastSkipped, setLastSkipped] = useState<BuildResult['skipped']>([])

  const reload = useCallback(async () => {
    setError(null)
    try {
      const [readyList, exportedList, elist] = await Promise.all([
        fetchProtocols({ status: ProtocolStatus.ready, pageSize: 200 }),
        fetchProtocols({ status: ProtocolStatus.exported, pageSize: 200 }),
        apiFetchJson<ExportRow[]>('/fgis-exports'),
      ])
      const merged = [...readyList.items, ...exportedList.items]
      const byId = new Map(merged.map((p) => [p.id, p]))
      setCandidates([...byId.values()])
      setExports(elist)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const selectedCount = selected.size

  if (!capabilities?.canBuildXml) {
    return <Navigate to="/" replace />
  }
  if (error) {
    return <ErrorState message={error} onRetry={() => void reload()} />
  }
  if (!candidates || !exports) {
    return <LoadingState label="Загрузка выгрузки…" />
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < MAX) next.add(id)
      return next
    })
  }

  async function build() {
    if (selected.size === 0) {
      notify('Выберите протоколы', 'error')
      return
    }
    setBusy(true)
    try {
      const result = await apiFetchJson<BuildResult>('/rpc/build_fgis_xml', {
        method: 'POST',
        body: JSON.stringify({ protocolIds: [...selected] }),
      })
      setLastSkipped(result.skipped)
      notify(
        `XML сформирован: ${result.fileName} (${result.includedProtocolIds.length} протоколов)`,
        'success',
      )
      setSelected(new Set())
      await reload()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка генерации', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function markUploaded(exportId: string) {
    setBusy(true)
    try {
      await apiFetchJson('/rpc/export_mark_uploaded', {
        method: 'POST',
        body: JSON.stringify({ exportId }),
      })
      notify('Отмечено: загружено во ФГИС', 'success')
      await reload()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function download(exportId: string) {
    try {
      const file = await apiFetchJson<{
        fileName: string
        xml: string
      }>(`/fgis-exports/${exportId}`)
      const blob = new Blob([file.xml], {
        type: 'application/xml;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.fileName
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка скачивания', 'error')
    }
  }

  return (
    <div className="page page--wide">
      <div className="page__head">
        <div>
          <h1>Выгрузка во ФГИС</h1>
          <p className="muted">
            Пакетный XML (до {MAX} шт.). Выбрано: <strong>{selectedCount}</strong>
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || selectedCount === 0}
          onClick={() => void build()}
        >
          Сформировать XML
        </button>
      </div>

      {candidates.length === 0 ? (
        <EmptyState
          title="Нет протоколов к выгрузке"
          description="Нужны протоколы в статусе «Готов к передаче» (или «Выгружен» для повторной выгрузки)."
          action={
            <Link to="/" className="btn">
              В реестр
            </Link>
          }
        />
      ) : (
        <div className="card-panel">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th></th>
                  <th>№</th>
                  <th>Дата</th>
                  <th>Заказчик</th>
                  <th>Статус</th>
                  <th>Скан</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p.id)}
                        disabled={!selected.has(p.id) && selected.size >= MAX}
                      />
                    </td>
                    <td>
                      <Link to={`/protocols/${p.id}`}>{p.number}</Link>
                      {p.status === ProtocolStatus.exported ? (
                        <span className="muted small page__meta">
                          <MetaSep />
                          повтор
                        </span>
                      ) : null}
                    </td>
                    <td>{formatCalendarDate(p.protocolDate)}</td>
                    <td className="small">{p.customerName ?? '—'}</td>
                    <td>
                      <span
                        className={`badge badge--status badge--status-${p.status}`}
                      >
                        {PROTOCOL_STATUS_LABELS[p.status]}
                      </span>
                    </td>
                    <td>{p.hasScan ? 'да' : 'нет'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {lastSkipped.length > 0 && (
        <div className="card-panel callout callout--warn">
          <strong>Исключены из XML:</strong>
          <ul>
            {lastSkipped.map((s) => (
              <li key={s.protocolId}>
                {s.number}: {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card-panel">
        <h2>История экспортов</h2>
        {exports.length === 0 ? (
          <p className="muted">Пока нет выгрузок.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Кто создал</th>
                  <th>Файл</th>
                  <th>Протоколов</th>
                  <th>Размер</th>
                  <th>ФГИС</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {exports.map((e) => (
                  <tr key={e.id}>
                    <td className="mono small">
                      {formatMoscowDateTime(e.createdAt)}
                    </td>
                    <td>{e.createdByName ?? '—'}</td>
                    <td className="small">
                      {e.fileName ?? e.filePath.split('/').pop()}
                    </td>
                    <td>{e.protocolsCount ?? '—'}</td>
                    <td>
                      {e.fileSize != null
                        ? `${Math.round(e.fileSize / 1024)} КБ`
                        : '—'}
                    </td>
                    <td>
                      {e.uploadedMarkedAt
                        ? `загружено ${formatMoscowDate(e.uploadedMarkedAt)}`
                        : 'не отмечено'}
                    </td>
                    <td className="upload-actions">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void download(e.id)}
                      >
                        Скачать
                      </button>
                      {!e.uploadedMarkedAt && (
                        <button
                          type="button"
                          className="btn btn--primary"
                          disabled={busy}
                          onClick={() => void markUploaded(e.id)}
                        >
                          Отметить загруженным
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
