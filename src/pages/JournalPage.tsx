import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAudit } from '@/client/api'
import { useAuth } from '@/client/auth-context'
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/states'
import type { AuditListResult } from '@/server/protocol/audit-query'
import { auditEntityLabel, formatAuditDiffLines } from '@/shared/ui/labels'
import { Select } from '@/shared/ui/Select'
import { DatePicker } from '@/shared/ui/DatePicker'
import {
  IconButton,
  IconChevronLeft,
  IconChevronRight,
  MetaSep,
} from '@/shared/ui/icons'
import { formatMoscowDateTime } from '@/shared/time/moscow'

export function JournalPage() {
  const { capabilities } = useAuth()
  const [data, setData] = useState<AuditListResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [entity, setEntity] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const reload = useCallback(async () => {
    setError(null)
    try {
      const result = await fetchAudit({
        page,
        pageSize: 50,
        entity: entity || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      })
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки')
    }
  }, [page, entity, dateFrom, dateTo])

  useEffect(() => {
    void reload()
  }, [reload])

  if (error) {
    return <ErrorState message={error} onRetry={() => void reload()} />
  }
  if (!data) return <LoadingState label="Загрузка журнала…" />

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))

  return (
    <div className="page page--wide">
      <div className="page__head">
        <div>
          <h1>Журнал</h1>
          <p className="muted">
            Кто и что менял: загрузка, правки, утверждение, выгрузка.
            {!capabilities?.canViewAllProtocols
              ? ' Только ваши протоколы и действия.'
              : ''}
          </p>
        </div>
      </div>

      <form
        className="filter-grid card-panel"
        onSubmit={(e) => {
          e.preventDefault()
          setPage(1)
          void reload()
        }}
      >
        <label className="field">
          <span>Сущность</span>
          <Select
            value={entity}
            onChange={(v) => {
              setEntity(v)
              setPage(1)
            }}
            options={[
              { value: '', label: 'Все' },
              { value: 'protocols', label: 'Протоколы' },
              { value: 'protocol_issues', label: 'Замечания' },
              { value: 'protocol_results', label: 'Результаты' },
              { value: 'fgis_exports', label: 'Выгрузки во ФГИС' },
              { value: 'settings', label: 'Настройки' },
              { value: 'customers', label: 'Заказчики' },
              {
                value: 'form_indicator_map',
                label: 'Сопоставление показателей',
              },
            ]}
          />
        </label>
        <label className="field">
          <span>С</span>
          <DatePicker value={dateFrom} onChange={setDateFrom} />
        </label>
        <label className="field">
          <span>По</span>
          <DatePicker value={dateTo} onChange={setDateTo} />
        </label>
        <div className="filter-actions">
          <button type="submit" className="btn btn--primary">
            Применить
          </button>
        </div>
      </form>

      {data.items.length === 0 ? (
        <EmptyState
          title="Записей нет"
          description="События появятся после операций с протоколами и справочниками."
        />
      ) : (
        <>
          <div className="table-wrap table-wrap--scroll">
            <table className="data-table data-table--compact">
              <thead>
                <tr>
                  <th>Когда</th>
                  <th>Кто</th>
                  <th className="cell-start">Объект</th>
                  <th>Действие</th>
                  <th className="cell-start">Изменения</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id}>
                    <td className="mono small">
                      {formatMoscowDateTime(a.at)}
                    </td>
                    <td>{a.actorName ?? a.actor ?? '—'}</td>
                    <td className="cell-start small">
                      {auditEntityLabel(a.entity)}
                      {a.entityId ? (
                        <>
                          {' '}
                          {a.entity === 'protocols' ? (
                            <Link to={`/protocols/${a.entityId}`}>
                              открыть
                            </Link>
                          ) : (
                            <span className="muted page__meta">
                              <MetaSep />
                              запись
                            </span>
                          )}
                        </>
                      ) : null}
                    </td>
                    <td>
                      <strong>{a.label}</strong>
                    </td>
                    <td className="cell-start small">
                      {(() => {
                        const lines = formatAuditDiffLines(a.diff)
                        if (lines.length === 0) return '—'
                        return (
                          <div className="audit-detail">
                            {lines.map((line, i) => (
                              <div
                                key={`${i}-${line}`}
                                className="audit-detail__line"
                              >
                                {line}
                              </div>
                            ))}
                          </div>
                        )
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <IconButton
              label="Назад"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <IconChevronLeft />
            </IconButton>
            <span className="muted page__meta">
              Стр. {data.page} из {totalPages}
              <MetaSep />
              всего {data.total}
            </span>
            <IconButton
              label="Вперёд"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <IconChevronRight />
            </IconButton>
          </div>
        </>
      )}
    </div>
  )
}
