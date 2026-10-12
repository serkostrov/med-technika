import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Select } from '@/shared/ui/Select'
import { DatePicker } from '@/shared/ui/DatePicker'
import {
  IconButton,
  IconChevronLeft,
  IconChevronRight,
  IconTrash,
  MetaSep,
} from '@/shared/ui/icons'
import {
  formatCalendarDate,
  formatMoscowDate,
} from '@/shared/time/moscow'
import {
  PROTOCOL_STATUS_LABELS,
  ProtocolStatus,
  type ProtocolStatus as Status,
} from '@/domain'
import { fetchProtocols } from '@/client/api'
import { deleteProtocolCard } from '@/client/protocol-api'
import { useAuth } from '@/client/auth-context'
import { apiFetchJson } from '@/client/dictionaries-api'
import { useToast } from '@/shared/ui/toast'
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/states'
import { ModalDialog } from '@/pages/dictionaries/shared-ui'
import { canDeleteProtocolUi } from '@/security'
import type {
  ProtocolListQuickFilter,
  ProtocolListResult,
} from '@/server/protocol/list-query'

type Lookups = {
  customers: { id: string; name: string }[]
  staff: { id: string; fullName: string; shortName: string }[]
  measurementKinds: { id: number; title: string }[]
}

const QUICK: { id: ProtocolListQuickFilter; label: string }[] = [
  { id: 'not_sent', label: 'Не передано во ФГИС' },
  { id: 'with_errors', label: 'С ошибками' },
  { id: 'no_scan', label: 'Без скана' },
  { id: 'no_application_date', label: 'Без даты заявки' },
]

const EMPTY_FILTERS = {
  number: '',
  customerId: '',
  object: '',
  serialNo: '',
  kindId: '',
  engineerStaffId: '',
  dateFrom: '',
  dateTo: '',
  status: '' as Status | '',
  quick: '' as ProtocolListQuickFilter | '',
}

export function RegistryPage() {
  const { capabilities } = useAuth()
  const { notify } = useToast()
  const navigate = useNavigate()
  const [data, setData] = useState<ProtocolListResult | null>(null)
  const [lookups, setLookups] = useState<Lookups | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [pendingDelete, setPendingDelete] = useState<{
    id: string
    number: string
    protocolDate: string
  } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const pageSize = 50
  const isHead = Boolean(capabilities?.isHead)

  const query = useMemo(
    () => ({
      number: filters.number || undefined,
      customerId: filters.customerId || undefined,
      object: filters.object || undefined,
      serialNo: filters.serialNo || undefined,
      kindId: filters.kindId ? Number(filters.kindId) : undefined,
      engineerStaffId: filters.engineerStaffId || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      status: filters.status || undefined,
      quick: filters.quick || undefined,
      page,
      pageSize,
    }),
    [filters, page],
  )

  const reload = useCallback(async () => {
    setError(null)
    try {
      const list = await fetchProtocols(query)
      setData(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки')
    }
  }, [query])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    let cancelled = false
    apiFetchJson<{
      customers: { id: string; name: string }[]
      staff: { id: string; fullName: string; shortName: string }[]
      measurementKinds: { id: number; title: string }[]
    }>('/dictionaries')
      .then((dict) => {
        if (!cancelled) {
          setLookups({
            customers: dict.customers,
            staff: dict.staff,
            measurementKinds: dict.measurementKinds,
          })
        }
      })
      .catch(() => {
        /* фильтры останутся без справочников */
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return <ErrorState message={error} onRetry={() => void reload()} />
  }
  if (!data) return <LoadingState label="Загрузка реестра…" />

  const { counters } = data
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))

  return (
    <div className="page page--wide">
      <div className="page__head">
        <div>
          <h1>Реестр</h1>
          <p className="muted">
            {capabilities?.canViewAllProtocols
              ? 'Все протоколы. Клик по строке — открыть карточку.'
              : 'Ваши протоколы. Клик по строке — открыть карточку.'}
          </p>
        </div>
        <Link to="/upload" className="btn btn--primary">
          Загрузить
        </Link>
      </div>

      <div className="counters">
        <Counter
          label="На проверке"
          value={counters.review}
          active={filters.status === ProtocolStatus.review}
          onClick={() => {
            setPage(1)
            setFilters((f) => ({
              ...f,
              status:
                f.status === ProtocolStatus.review
                  ? ''
                  : ProtocolStatus.review,
              quick: '',
            }))
          }}
        />
        <Counter
          label="Утверждено"
          value={counters.approved}
          active={filters.status === ProtocolStatus.approved}
          onClick={() => {
            setPage(1)
            setFilters((f) => ({
              ...f,
              status:
                f.status === ProtocolStatus.approved
                  ? ''
                  : ProtocolStatus.approved,
              quick: '',
            }))
          }}
        />
        <Counter
          label="Готово к передаче"
          value={counters.ready}
          active={filters.status === ProtocolStatus.ready}
          onClick={() => {
            setPage(1)
            setFilters((f) => ({
              ...f,
              status:
                f.status === ProtocolStatus.ready ? '' : ProtocolStatus.ready,
              quick: '',
            }))
          }}
        />
        <Counter
          label="Выгружено"
          value={counters.exported}
          active={filters.status === ProtocolStatus.exported}
          onClick={() => {
            setPage(1)
            setFilters((f) => ({
              ...f,
              status:
                f.status === ProtocolStatus.exported
                  ? ''
                  : ProtocolStatus.exported,
              quick: '',
            }))
          }}
        />
        <Counter
          label="Не передано"
          value={counters.notSent}
          active={filters.quick === 'not_sent'}
          onClick={() => {
            setPage(1)
            setFilters((f) => ({
              ...f,
              status: '',
              quick: f.quick === 'not_sent' ? '' : 'not_sent',
            }))
          }}
        />
      </div>

      <div className="quick-filters">
        {QUICK.map((q) => (
          <button
            key={q.id}
            type="button"
            className={
              filters.quick === q.id
                ? 'btn btn--chip btn--chip-active'
                : 'btn btn--chip'
            }
            onClick={() => {
              setPage(1)
              setFilters((f) => ({
                ...f,
                quick: f.quick === q.id ? '' : q.id,
                status: '',
              }))
            }}
          >
            {q.label}
          </button>
        ))}
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
          <span>Номер</span>
          <input
            value={filters.number}
            onChange={(e) =>
              setFilters((f) => ({ ...f, number: e.target.value }))
            }
          />
        </label>
        <label className="field">
          <span>Заказчик</span>
          <Select
            value={filters.customerId}
            onChange={(v) => setFilters((f) => ({ ...f, customerId: v }))}
            options={[
              { value: '', label: 'Все' },
              ...(lookups?.customers ?? []).map((c) => ({
                value: c.id,
                label: c.name,
              })),
            ]}
          />
        </label>
        <label className="field">
          <span>Объект</span>
          <input
            value={filters.object}
            onChange={(e) =>
              setFilters((f) => ({ ...f, object: e.target.value }))
            }
          />
        </label>
        <label className="field">
          <span>Заводской №</span>
          <input
            value={filters.serialNo}
            onChange={(e) =>
              setFilters((f) => ({ ...f, serialNo: e.target.value }))
            }
          />
        </label>
        <label className="field">
          <span>Вид измерений</span>
          <Select
            value={filters.kindId}
            onChange={(v) => setFilters((f) => ({ ...f, kindId: v }))}
            options={[
              { value: '', label: 'Все' },
              ...(lookups?.measurementKinds ?? []).map((k) => ({
                value: String(k.id),
                label: k.title,
              })),
            ]}
          />
        </label>
        <label className="field">
          <span>Исполнитель</span>
          <Select
            value={filters.engineerStaffId}
            onChange={(v) =>
              setFilters((f) => ({ ...f, engineerStaffId: v }))
            }
            options={[
              { value: '', label: 'Все' },
              ...(lookups?.staff ?? []).map((s) => ({
                value: s.id,
                label: s.shortName || s.fullName,
              })),
            ]}
          />
        </label>
        <label className="field">
          <span>Период с</span>
          <DatePicker
            value={filters.dateFrom}
            onChange={(v) => setFilters((f) => ({ ...f, dateFrom: v }))}
          />
        </label>
        <label className="field">
          <span>Период по</span>
          <DatePicker
            value={filters.dateTo}
            onChange={(v) => setFilters((f) => ({ ...f, dateTo: v }))}
          />
        </label>
        <label className="field">
          <span>Статус</span>
          <Select
            value={filters.status}
            onChange={(v) =>
              setFilters((f) => ({
                ...f,
                status: v as Status | '',
                quick: '',
              }))
            }
            options={[
              { value: '', label: 'Все' },
              ...Object.entries(PROTOCOL_STATUS_LABELS).map(([k, v]) => ({
                value: k,
                label: v,
              })),
            ]}
          />
        </label>
        <div className="filter-actions">
          <button type="submit" className="btn btn--primary">
            Применить
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setFilters(EMPTY_FILTERS)
              setPage(1)
            }}
          >
            Сбросить
          </button>
        </div>
      </form>

      {data.items.length === 0 ? (
        <EmptyState
          title="Нет протоколов по фильтру"
          description="Измените условия или загрузите Excel-протокол."
          action={
            <Link to="/upload" className="btn btn--primary">
              Перейти к загрузке
            </Link>
          }
        />
      ) : (
        <>
          <div className="table-wrap table-wrap--scroll">
            <table className="data-table data-table--compact">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Дата</th>
                  <th>Форма</th>
                  <th>Заказчик</th>
                  <th className="cell-start">Объект</th>
                  <th>Измерения</th>
                  <th>Исполнитель</th>
                  <th>Ош./зам.</th>
                  <th>Статус</th>
                  <th>Скан</th>
                  <th>Выгрузка</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => {
                  const allowDelete = canDeleteProtocolUi(p.status, isHead)
                  return (
                  <tr
                    key={p.id}
                    className="data-table__row--clickable"
                    tabIndex={0}
                    role="link"
                    aria-label={`Открыть протокол ${p.number}`}
                    onClick={() => navigate(`/protocols/${p.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        navigate(`/protocols/${p.id}`)
                      }
                    }}
                  >
                    <td>
                      <span className="row-link">{p.number}</span>
                    </td>
                    <td>{formatCalendarDate(p.protocolDate)}</td>
                    <td className="small">{p.formTitle ?? '—'}</td>
                    <td className="small">{p.customerName ?? '—'}</td>
                    <td className="cell-start small">
                      {p.objectFullName ?? '—'}
                    </td>
                    <td className="small mono">
                      {formatCalendarDate(p.measureStart)}
                      {p.measureEnd && p.measureEnd !== p.measureStart
                        ? `…${formatCalendarDate(p.measureEnd)}`
                        : ''}
                    </td>
                    <td className="small">{p.engineerName ?? '—'}</td>
                    <td className="small">
                      {p.errorCount > 0 || p.warningCount > 0 ? (
                        <span>
                          <span className="badge badge--danger">
                            {p.errorCount}
                          </span>{' '}
                          <span className="badge badge--warn">
                            {p.warningCount}
                          </span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span
                        className={`badge badge--status badge--status-${p.status}`}
                      >
                        {PROTOCOL_STATUS_LABELS[p.status]}
                      </span>
                    </td>
                    <td>{p.hasScan ? 'да' : 'нет'}</td>
                    <td className="small mono">
                      {formatMoscowDate(p.exportedAt)}
                    </td>
                    <td
                      className="col-actions"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {allowDelete ? (
                        <IconButton
                          label="Удалить"
                          danger
                          onClick={() =>
                            setPendingDelete({
                              id: p.id,
                              number: p.number,
                              protocolDate: p.protocolDate,
                            })
                          }
                        >
                          <IconTrash />
                        </IconButton>
                      ) : null}
                    </td>
                  </tr>
                  )
                })}
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

      <ModalDialog
        title="Удалить протокол?"
        open={pendingDelete != null}
        busy={deleteBusy}
        onClose={() => {
          if (!deleteBusy) setPendingDelete(null)
        }}
        footer={
          <>
            <button
              type="button"
              className="btn"
              disabled={deleteBusy}
              onClick={() => setPendingDelete(null)}
            >
              Отмена
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={deleteBusy || !pendingDelete}
              onClick={() => {
                if (!pendingDelete) return
                const target = pendingDelete
                void (async () => {
                  setDeleteBusy(true)
                  try {
                    await deleteProtocolCard(target.id)
                    notify(`Протокол ${target.number} удалён`, 'success')
                    setPendingDelete(null)
                    await reload()
                  } catch (err) {
                    notify(
                      err instanceof Error ? err.message : 'Ошибка удаления',
                      'error',
                    )
                  } finally {
                    setDeleteBusy(false)
                  }
                })()
              }}
            >
              Удалить
            </button>
          </>
        }
      >
        {pendingDelete ? (
          <>
            <p style={{ margin: 0 }}>
              Протокол <strong>{pendingDelete.number}</strong> от{' '}
              {formatCalendarDate(pendingDelete.protocolDate)} будет убран из
              реестра.
            </p>
            <p className="muted small" style={{ margin: '0.35rem 0 0' }}>
              После выгрузки во ФГИС удаление недоступно.
            </p>
          </>
        ) : null}
      </ModalDialog>
    </div>
  )
}

function Counter({
  label,
  value,
  active,
  onClick,
}: {
  label: string
  value: number
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      className={active ? 'counter counter--active' : 'counter'}
      onClick={onClick}
    >
      <span className="counter__value">{value}</span>
      <span className="counter__label">{label}</span>
    </button>
  )
}
