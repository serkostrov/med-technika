import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  PROTOCOL_STATUS_LABELS,
  ProtocolStatus,
  type ProtocolEditablePatch,
} from '@/domain'
import { useAuth } from '@/client/auth-context'
import {
  acknowledgeIssueCard,
  approveProtocolCard,
  attachScanPdf,
  deleteProtocolCard,
  detachScanPdf,
  fetchProtocolDetail,
  fetchScanPdfBlob,
  returnProtocolCard,
  setProtocolEquipment,
  setResultInclude,
  setResultOa,
  updateProtocolCard,
  type ProtocolCardDetail,
} from '@/client/protocol-api'
import {
  BackLink,
  IconButton,
  IconEye,
  IconFilePdf,
  IconTrash,
  MetaSep,
} from '@/shared/ui/icons'
import { ModalDialog } from '@/pages/dictionaries/shared-ui'
import { canDeleteProtocolUi } from '@/security'
import { uploadFileInChunks } from '@/client/chunked-upload'
import { useToast } from '@/shared/ui/toast'
import { ErrorState, LoadingState } from '@/shared/ui/states'
import {
  checkCodeLabel,
  formatAuditDiffLines,
  formatNum,
} from '@/shared/ui/labels'
import { Select } from '@/shared/ui/Select'
import { DatePicker } from '@/shared/ui/DatePicker'
import {
  formatCalendarDate,
  formatMoscowDateTime,
} from '@/shared/time/moscow'
import {
  flashFocusTargets,
  resolveIssueNavigation,
} from '@/pages/protocol-issue-nav'

type TabId =
  | 'summary'
  | 'results'
  | 'equipment'
  | 'checks'
  | 'scan'
  | 'xml'
  | 'journal'

const TABS: { id: TabId; label: string; ghost?: boolean }[] = [
  { id: 'summary', label: 'Сводка' },
  { id: 'results', label: 'Результаты' },
  { id: 'equipment', label: 'Оборудование' },
  { id: 'scan', label: 'Скан' },
  { id: 'checks', label: 'Проверка' },
  { id: 'journal', label: 'Журнал', ghost: true },
]

/** Pretty-print XML для предпросмотра (без внешних библиотек). */
function formatXmlPreview(raw: string): string {
  const xml = raw.replace(/>\s+</g, '><').trim()
  if (!xml) return ''
  const pad = '  '
  let depth = 0
  return xml
    .replace(/(>)(<)(\/*)/g, '$1\n$2$3')
    .split('\n')
    .map((line) => {
      let indentDelta = 0
      if (/^<\/\w/.test(line)) {
        depth = Math.max(0, depth - 1)
      } else if (
        /^<\w[^>]*[^/]>.*$/.test(line) &&
        !/^<\?/.test(line) &&
        !/^<!/.test(line) &&
        !/.+<\/\w[^>]*>$/.test(line)
      ) {
        indentDelta = 1
      }
      const out = `${pad.repeat(depth)}${line}`
      depth += indentDelta
      return out
    })
    .join('\n')
}

export function ProtocolCardPage() {
  const { protocolId = '' } = useParams()
  const navigate = useNavigate()
  const { capabilities } = useAuth()
  const { notify } = useToast()
  const [detail, setDetail] = useState<ProtocolCardDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('summary')
  const [busy, setBusy] = useState(false)
  const [focusResultId, setFocusResultId] = useState<string | null>(null)
  const [focusNonce, setFocusNonce] = useState(0)
  const pendingFocusKeys = useRef<string[]>([])
  const [returnReason, setReturnReason] = useState('')
  const [showReturn, setShowReturn] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  /** Общий комментарий «к сведению» — на уровне страницы. */
  const [ackComment, setAckComment] = useState('')

  const reload = useCallback(async () => {
    setError(null)
    try {
      const data = await fetchProtocolDetail(protocolId)
      setDetail(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки')
    }
  }, [protocolId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (focusNonce === 0) return
    const keys = pendingFocusKeys.current
    if (keys.length === 0) return
    const t = window.setTimeout(() => {
      flashFocusTargets(keys)
      pendingFocusKeys.current = []
      setFocusResultId(null)
    }, 60)
    return () => window.clearTimeout(t)
  }, [focusNonce])

  const status = detail?.protocol.status
  const canEdit =
    status === ProtocolStatus.review ||
    status === ProtocolStatus.approved ||
    status === ProtocolStatus.ready

  async function run(action: () => Promise<unknown>, okMsg: string) {
    setBusy(true)
    try {
      await action()
      await reload()
      notify(okMsg, 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  const saveSummaryPatch = useCallback(
    async (patch: ProtocolEditablePatch) => {
      await updateProtocolCard(protocolId, patch)
      await reload()
      if (
        status === ProtocolStatus.approved ||
        status === ProtocolStatus.ready
      ) {
        notify('Сохранено. Протокол возвращён на проверку.', 'success')
      }
    },
    [protocolId, reload, status, notify],
  )

  const onSummarySaveError = useCallback(
    (msg: string) => notify(msg, 'error'),
    [notify],
  )

  if (error) {
    return <ErrorState message={error} onRetry={() => void reload()} />
  }
  if (!detail) return <LoadingState label="Загрузка карточки…" />

  const { protocol, approval } = detail
  const approveDisabled =
    !capabilities?.canApprove ||
    !approval.canApprove ||
    protocol.status !== ProtocolStatus.review ||
    busy
  const canDelete = canDeleteProtocolUi(
    protocol.status,
    Boolean(capabilities?.isHead),
  )

  return (
    <div className="page page--wide protocol-card">
      <div className="page__head">
        <div>
          <p className="muted small">
            <BackLink to="/">Реестр</BackLink>
          </p>
          <h1>
            Протокол {protocol.number}{' '}
            <span
              className={`badge badge--status badge--status-${protocol.status}`}
            >
              {PROTOCOL_STATUS_LABELS[protocol.status]}
            </span>
          </h1>
          <p className="muted page__meta">
            Дата {formatCalendarDate(protocol.protocolDate)}
            {detail.form ? (
              <>
                <MetaSep />
                {detail.form.title}
              </>
            ) : null}
          </p>
        </div>
        <div className="protocol-card__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setTab('xml')}
          >
            Предпросмотр
          </button>
          {canDelete ? (
            <button
              type="button"
              className="btn btn--icon btn--icon-subtle"
              disabled={busy}
              title="Удалить"
              aria-label="Удалить"
              onClick={() => setShowDelete(true)}
            >
              <IconTrash />
            </button>
          ) : null}
          {capabilities?.canApprove && protocol.status === ProtocolStatus.review && (
            <button
              type="button"
              className="btn btn--primary"
              disabled={approveDisabled}
              title={approval.blockReason ?? undefined}
              onClick={() =>
                void run(
                  () => approveProtocolCard(protocolId),
                  'Протокол утверждён',
                )
              }
            >
              Утвердить
            </button>
          )}
          {capabilities?.canReturn &&
            (protocol.status === ProtocolStatus.approved ||
              protocol.status === ProtocolStatus.ready) && (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setShowReturn(true)}
              >
                Вернуть на проверку
              </button>
            )}
        </div>
      </div>

      <ModalDialog
        title="Удалить протокол?"
        open={showDelete}
        busy={busy}
        onClose={() => setShowDelete(false)}
        footer={
          <>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setShowDelete(false)}
            >
              Отмена
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true)
                  try {
                    await deleteProtocolCard(protocolId)
                    notify(`Протокол ${protocol.number} удалён`, 'success')
                    navigate('/')
                  } catch (err) {
                    notify(
                      err instanceof Error ? err.message : 'Ошибка удаления',
                      'error',
                    )
                  } finally {
                    setBusy(false)
                    setShowDelete(false)
                  }
                })()
              }}
            >
              Удалить
            </button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          Протокол <strong>{protocol.number}</strong> от{' '}
          {formatCalendarDate(protocol.protocolDate)} будет убран из реестра.
        </p>
        <p className="muted small" style={{ margin: '0.35rem 0 0' }}>
          После выгрузки во ФГИС удаление недоступно. Действие нельзя отменить
          из интерфейса.
        </p>
      </ModalDialog>

      {approval.blockReason && protocol.status === ProtocolStatus.review && (
        <p className="callout callout--warn">
          Утверждение недоступно: {approval.blockReason}
          {approval.errorCount > 0
            ? ` (ошибок: ${approval.errorCount})`
            : ''}
          {approval.unackedWarningCount > 0
            ? ` (непринятых замечаний: ${approval.unackedWarningCount})`
            : ''}
        </p>
      )}

      {showReturn && (
        <div className="card-panel">
          <label className="field">
            <span>Причина возврата (обязательно)</span>
            <textarea
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              rows={3}
            />
          </label>
          <div className="upload-actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !returnReason.trim()}
              onClick={() =>
                void run(async () => {
                  await returnProtocolCard(protocolId, returnReason.trim())
                  setShowReturn(false)
                  setReturnReason('')
                }, 'Возвращён на проверку')
              }
            >
              Подтвердить возврат
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setShowReturn(false)
                setReturnReason('')
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      <div className="tabs" role="tablist">
        {TABS.map((t) => {
          const classes = [
            'tabs__btn',
            t.ghost ? 'tabs__btn--ghost' : '',
            tab === t.id ? 'tabs__btn--active' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              className={classes}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === 'checks' && approval.errorCount + approval.warningCount > 0
                ? ` (${approval.errorCount + approval.warningCount})`
                : ''}
            </button>
          )
        })}
      </div>

      {tab === 'summary' && (
        <SummaryTab
          detail={detail}
          canEdit={canEdit && !busy}
          onSave={saveSummaryPatch}
          onSaveError={onSummarySaveError}
        />
      )}
      {tab === 'results' && (
        <ResultsTab
          detail={detail}
          canEdit={canEdit && !busy}
          focusResultId={focusResultId}
          onChanged={async (next) => {
            setDetail(next)
            notify('Сохранено', 'success')
          }}
          onError={(msg) => notify(msg, 'error')}
        />
      )}
      {tab === 'equipment' && (
        <EquipmentTab
          detail={detail}
          canEdit={canEdit && !busy}
          onChanged={async (next) => {
            setDetail(next)
            notify('СИ обновлено', 'success')
          }}
          onError={(msg) => notify(msg, 'error')}
        />
      )}
      {tab === 'checks' && (
        <ChecksTab
          detail={detail}
          busy={busy}
          ackComment={ackComment}
          onAckCommentChange={setAckComment}
          onAckAll={async (comment) => {
            const pending = detail.issues.filter(
              (i) => i.severity === 'warning' && !i.acknowledgedAt,
            )
            if (pending.length === 0) return
            await run(async () => {
              for (const i of pending) {
                await acknowledgeIssueCard(i.id, comment)
              }
            }, `К сведению: ${pending.length}`)
            setAckComment('')
          }}
          onNavigate={(issue) => {
            const nav = resolveIssueNavigation(issue)
            const resultId =
              typeof issue.ref?.resultId === 'string' ? issue.ref.resultId : null
            pendingFocusKeys.current = nav.focuses
            setFocusResultId(resultId)
            setFocusNonce((n) => n + 1)
            setTab(nav.tab)
          }}
        />
      )}
      {tab === 'scan' && (
        <ScanTab
          detail={detail}
          busy={busy}
          onUpload={async (file, onProgress) => {
            await run(async () => {
              const { uploadId } = await uploadFileInChunks(
                file,
                'protocol_scan',
                onProgress,
              )
              await attachScanPdf(protocolId, {
                fileName: file.name,
                uploadId,
              })
            }, 'Скан прикреплён')
          }}
          onDetach={async () => {
            await run(
              () => detachScanPdf(protocolId),
              'Скан удалён',
            )
          }}
        />
      )}
      {tab === 'xml' && (
        <div className="card-panel">
          <p className="muted small">
            Предпросмотр XML без вложенного PDF. Полный пакет — в разделе
            «Выгрузка».
          </p>
          <pre className="xml-preview">
            {formatXmlPreview(detail.xmlPreview)}
          </pre>
        </div>
      )}
      {tab === 'journal' && <JournalTab detail={detail} />}
    </div>
  )
}

function SummaryTab({
  detail,
  canEdit,
  onSave,
  onSaveError,
}: {
  detail: ProtocolCardDetail
  canEdit: boolean
  onSave: (patch: ProtocolEditablePatch) => Promise<void>
  onSaveError: (msg: string) => void
}) {
  const p = detail.protocol
  const [applicationDate, setApplicationDate] = useState(p.applicationDate ?? '')
  const [accred, setAccred] = useState(p.accredScope353)
  const [customerId, setCustomerId] = useState(p.customerId ?? '')
  const [engineerStaffId, setEngineerStaffId] = useState(p.engineerStaffId ?? '')
  const [measurePlace, setMeasurePlace] = useState(p.measurePlace ?? '')
  const [measureAddress, setMeasureAddress] = useState(p.measureAddress ?? '')
  const [measureStart, setMeasureStart] = useState(p.measureStart ?? '')
  const [measureEnd, setMeasureEnd] = useState(p.measureEnd ?? '')
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const skipAutosave = useRef(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveGen = useRef(0)

  useEffect(() => {
    skipAutosave.current = true
    setApplicationDate(p.applicationDate ?? '')
    setAccred(p.accredScope353)
    setCustomerId(p.customerId ?? '')
    setEngineerStaffId(p.engineerStaffId ?? '')
    setMeasurePlace(p.measurePlace ?? '')
    setMeasureAddress(p.measureAddress ?? '')
    setMeasureStart(p.measureStart ?? '')
    setMeasureEnd(p.measureEnd ?? '')
  }, [p])

  useEffect(() => {
    if (!canEdit) return
    if (skipAutosave.current) {
      skipAutosave.current = false
      return
    }

    const dirty =
      (applicationDate || '') !== (p.applicationDate ?? '') ||
      accred !== p.accredScope353 ||
      (customerId || '') !== (p.customerId ?? '') ||
      (engineerStaffId || '') !== (p.engineerStaffId ?? '') ||
      (measurePlace || '') !== (p.measurePlace ?? '') ||
      (measureAddress || '') !== (p.measureAddress ?? '') ||
      (detail.canEditMeasureDates &&
        ((measureStart || '') !== (p.measureStart ?? '') ||
          (measureEnd || '') !== (p.measureEnd ?? '')))

    if (!dirty) return

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const gen = ++saveGen.current
      const patch: ProtocolEditablePatch = {
        applicationDate: applicationDate || null,
        accredScope353: accred,
        customerId: customerId || null,
        engineerStaffId: engineerStaffId || null,
        measurePlace: measurePlace || null,
        measureAddress: measureAddress || null,
        ...(detail.canEditMeasureDates
          ? {
              measureStart: measureStart || null,
              measureEnd: measureEnd || null,
            }
          : {}),
      }
      setSaveState('saving')
      void onSave(patch)
        .then(() => {
          if (gen !== saveGen.current) return
          setSaveState('saved')
        })
        .catch((err: unknown) => {
          if (gen !== saveGen.current) return
          setSaveState('error')
          onSaveError(err instanceof Error ? err.message : 'Ошибка сохранения')
        })
    }, 450)

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [
    applicationDate,
    accred,
    customerId,
    engineerStaffId,
    measurePlace,
    measureAddress,
    measureStart,
    measureEnd,
    canEdit,
    detail.canEditMeasureDates,
    p.applicationDate,
    p.accredScope353,
    p.customerId,
    p.engineerStaffId,
    p.measurePlace,
    p.measureAddress,
    p.measureStart,
    p.measureEnd,
    onSave,
    onSaveError,
  ])

  return (
    <div className="card-panel">
      <div className="form-grid">
        <Field label="Номер" focusId="summary:number">
          <input value={p.number} readOnly />
        </Field>
        <Field label="Дата протокола" focusId="summary:protocolDate">
          <DatePicker value={p.protocolDate} readOnly allowClear={false} />
        </Field>
        <Field label="Дата заявки" focusId="summary:applicationDate">
          <DatePicker
            value={applicationDate}
            disabled={!canEdit}
            onChange={setApplicationDate}
          />
        </Field>
        <Field label="Признак расширяемой ОА" focusId="summary:accredScope353">
          <label className="check-inline">
            <input
              type="checkbox"
              checked={accred}
              disabled={!canEdit}
              onChange={(e) => setAccred(e.target.checked)}
            />
            Признак расширяемой ОА
          </label>
        </Field>
        <Field label="Заказчик" focusId="summary:customerId">
          <Select
            value={customerId}
            disabled={!canEdit}
            onChange={setCustomerId}
            options={[
              { value: '', label: '— не выбран —' },
              ...detail.lookups.customers.map((c) => ({
                value: c.id,
                label: c.inn ? `${c.name} (ИНН ${c.inn})` : c.name,
              })),
            ]}
          />
        </Field>
        <Field label="Исполнитель" focusId="summary:engineerStaffId">
          <Select
            value={engineerStaffId}
            disabled={!canEdit}
            onChange={setEngineerStaffId}
            options={[
              { value: '', label: '— не указан —' },
              ...detail.lookups.staff.map((s) => ({
                value: s.id,
                label:
                  s.fgisIdFullName == null
                    ? `${s.fullName} (нет кода ФИО во ФГИС)`
                    : s.fullName,
              })),
            ]}
          />
        </Field>
        <Field label="Объект" focusId="summary:objectFullName">
          <input value={p.objectFullName ?? ''} readOnly />
        </Field>
        <Field label="Место измерений" focusId="summary:measurePlace">
          <input
            value={measurePlace}
            disabled={!canEdit}
            onChange={(e) => setMeasurePlace(e.target.value)}
          />
        </Field>
        <Field label="Адрес измерений" focusId="summary:measureAddress">
          <input
            value={measureAddress}
            disabled={!canEdit}
            onChange={(e) => setMeasureAddress(e.target.value)}
            placeholder="Адрес места измерений"
          />
        </Field>
        <Field label="Начало измерений" focusId="summary:measureStart">
          <DatePicker
            value={measureStart}
            disabled={!canEdit || !detail.canEditMeasureDates}
            onChange={setMeasureStart}
          />
        </Field>
        <Field label="Окончание измерений" focusId="summary:measureEnd">
          <DatePicker
            value={measureEnd}
            disabled={!canEdit || !detail.canEditMeasureDates}
            onChange={setMeasureEnd}
          />
        </Field>
      </div>
      {!detail.canEditMeasureDates && (
        <p className="muted small">
          Даты измерений правятся только для формы 26-ИДК. Для остальных —
          повторная загрузка Excel.
        </p>
      )}
      {canEdit ? (
        <p className="muted small autosave-hint" aria-live="polite">
          {saveState === 'saving'
            ? 'Сохранение…'
            : saveState === 'saved'
              ? 'Сохранено'
              : saveState === 'error'
                && 'Не удалось сохранить'
          }
        </p>
      ) : null}
    </div>
  )
}

function ResultsTab({
  detail,
  canEdit,
  focusResultId,
  onChanged,
  onError,
}: {
  detail: ProtocolCardDetail
  canEdit: boolean
  focusResultId: string | null
  onChanged: (d: ProtocolCardDetail) => void | Promise<void>
  onError: (msg: string) => void
}) {
  return (
    <div className="card-panel">
      <p className="muted small">
        Значения измерений не редактируются. Для исправления числа — повторная
        загрузка исправленного Excel. Разрешены: позиция ОА и признак «включить в выгрузку»
        (с комментарием).
      </p>
      <div className="table-wrap table-wrap--scroll">
        <table className="data-table data-table--compact">
          <thead>
            <tr>
              <th className="cell-start">Объект</th>
              <th>Показатель</th>
              <th>Уст.</th>
              <th>Замеры</th>
              <th>Ср. Excel</th>
              <th>Ср. расчётное</th>
              <th>U</th>
              <th>Значение для ФГИС</th>
              <th>Ед.</th>
              <th>ОА</th>
              <th>Диапазон</th>
              <th>В выгрузке</th>
            </tr>
          </thead>
          <tbody>
            {detail.results.map((r) => (
              <tr
                key={r.id}
                id={`result-${r.id}`}
                data-focus={`results:row:${r.id}`}
                className={
                  focusResultId === r.id ? 'row--focus' : undefined
                }
              >
                <td className="cell-start">{r.objectName ?? '—'}</td>
                <td>{r.indicatorRaw ?? '—'}</td>
                <td>{r.setValue ?? '—'}</td>
                <td className="mono">
                  {r.rawValues?.map((v) => formatNum(v)).join('; ') ?? '—'}
                </td>
                <td className="mono">{formatNum(r.avgExcel)}</td>
                <td className="mono">{formatNum(r.avgCalc)}</td>
                <td className="mono">
                  {formatNum(r.uExcel)}
                  {r.uCalc != null ? ` / ${formatNum(r.uCalc)}` : ''}
                </td>
                <td
                  className="mono fact-value"
                  data-focus={`results:fact:${r.id}`}
                >
                  {r.factValue || '—'}
                </td>
                <td data-focus={`results:unit:${r.id}`}>
                  {r.unitSymbol ?? '—'}
                </td>
                <td data-focus={`results:oa:${r.id}`}>
                  {canEdit ? (
                    <Select
                      value={r.oaItemId ?? ''}
                      onChange={(oaItemId) => {
                        if (!oaItemId) return
                        void setResultOa(r.id, oaItemId)
                          .then(onChanged)
                          .catch((err: unknown) =>
                            onError(
                              err instanceof Error ? err.message : 'Ошибка',
                            ),
                          )
                      }}
                      options={[
                        { value: '', label: '— не сопоставлено —' },
                        ...detail.lookups.oaItems.map((o) => ({
                          value: o.id,
                          label: `${o.itemNo} ${o.indicatorText}`,
                        })),
                      ]}
                    />
                  ) : (
                    <span>
                      {r.oaItemNo
                        ? `${r.oaItemNo} ${r.oaIndicatorText ?? ''}`
                        : '—'}
                    </span>
                  )}
                </td>
                <td className="small">
                  {r.oaRangeText ??
                    (r.oaRangeMin != null && r.oaRangeMax != null
                      ? `${r.oaRangeMin} – ${r.oaRangeMax}`
                      : '—')}
                </td>
                <td>
                  <label className="check-inline">
                    <input
                      type="checkbox"
                      checked={r.includeInXml}
                      disabled={!canEdit}
                      onChange={(e) => {
                        const include = e.target.checked
                        const comment = window.prompt(
                          'Комментарий к изменению «включить в выгрузку» (обязательно):',
                        )
                        if (!comment?.trim()) {
                          onError('Нужен комментарий')
                          return
                        }
                        void setResultInclude(r.id, include, comment.trim())
                          .then(onChanged)
                          .catch((err: unknown) =>
                            onError(
                              err instanceof Error ? err.message : 'Ошибка',
                            ),
                          )
                      }}
                    />
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EquipmentTab({
  detail,
  canEdit,
  onChanged,
  onError,
}: {
  detail: ProtocolCardDetail
  canEdit: boolean
  onChanged: (d: ProtocolCardDetail) => void | Promise<void>
  onError: (msg: string) => void
}) {
  return (
    <div className="card-panel">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th className="cell-start">Текст из Excel</th>
              <th>СИ в справочнике</th>
              <th>Код СИ во ФГИС</th>
              <th>Поверки</th>
            </tr>
          </thead>
          <tbody>
            {detail.equipment.map((e) => (
              <tr
                key={`${e.protocolId}-${e.seq}`}
                data-focus={`equipment:row:${e.seq}`}
              >
                <td>{e.seq}</td>
                <td className="cell-start">{e.rawText ?? '—'}</td>
                <td data-focus={`equipment:match:${e.seq}`}>
                  {canEdit ? (
                    <Select
                      value={e.equipmentId ?? ''}
                      onChange={(v) => {
                        const id = v || null
                        void setProtocolEquipment(
                          detail.protocol.id,
                          e.seq,
                          id,
                        )
                          .then(onChanged)
                          .catch((err: unknown) =>
                            onError(
                              err instanceof Error ? err.message : 'Ошибка',
                            ),
                          )
                      }}
                      options={[
                        { value: '', label: '— не найдено —' },
                        ...detail.lookups.equipment.map((eq) => ({
                          value: eq.id,
                          label: eq.serialNo
                            ? `${eq.name} / ${eq.serialNo}`
                            : eq.name,
                        })),
                      ]}
                    />
                  ) : (
                    e.equipmentName ?? '—'
                  )}
                </td>
                <td>{e.fgisEquipmentId ?? '—'}</td>
                <td className="small">
                  {e.verifications.length === 0
                    ? '—'
                    : e.verifications
                        .map(
                          (v) =>
                            `${v.certNo} до ${formatCalendarDate(v.validUntil)}`,
                        )
                        .join('; ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ChecksTab({
  detail,
  busy,
  ackComment,
  onAckCommentChange,
  onAckAll,
  onNavigate,
}: {
  detail: ProtocolCardDetail
  busy: boolean
  ackComment: string
  onAckCommentChange: (value: string) => void
  onAckAll: (comment: string) => Promise<void>
  onNavigate: (issue: ProtocolCardDetail['issues'][number]) => void
}) {
  const errors = useMemo(
    () => detail.issues.filter((i) => i.severity === 'error'),
    [detail.issues],
  )
  const warnings = useMemo(
    () => detail.issues.filter((i) => i.severity === 'warning'),
    [detail.issues],
  )
  const pendingWarnings = useMemo(
    () => warnings.filter((i) => !i.acknowledgedAt),
    [warnings],
  )

  return (
    <div className="checks-layout">
      <section className="card-panel">
        <h2>Ошибки ({errors.length})</h2>
        {errors.length === 0 ? (
          <p className="muted">Активных ошибок нет.</p>
        ) : (
          <ul className="issue-list">
            {errors.map((i) => (
              <li key={i.id} className="issue-item">
                <button
                  type="button"
                  className="issue-link issue-link--error"
                  onClick={() => onNavigate(i)}
                >
                  <strong>{checkCodeLabel(i.code)}</strong> — {i.message}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card-panel">
        <div className="checks-section-head">
          <h2>Замечания ({warnings.length})</h2>
          {pendingWarnings.length > 0 ? (
            <button
              type="button"
              className="btn btn--small"
              disabled={busy}
              title="Принять все незакрытые замечания к сведению"
              onClick={() => void onAckAll(ackComment.trim())}
            >
              К сведению
              {pendingWarnings.length > 1
                ? ` · ${pendingWarnings.length}`
                : ''}
            </button>
          ) : null}
        </div>
        {pendingWarnings.length > 0 ? (
          <div className="ack-bar">
            <input
              placeholder="Комментарий ко всем (необязательно)"
              value={ackComment}
              disabled={busy}
              onChange={(e) => onAckCommentChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (!busy) void onAckAll(ackComment.trim())
                }
              }}
            />
          </div>
        ) : null}
        {warnings.length === 0 ? (
          <p className="muted">Активных замечаний нет.</p>
        ) : (
          <ul className="issue-list">
            {warnings.map((i) => (
              <li key={i.id} className="issue-item">
                <button
                  type="button"
                  className="issue-link issue-link--warn"
                  onClick={() => onNavigate(i)}
                >
                  <strong>{checkCodeLabel(i.code)}</strong> — {i.message}
                </button>
                {i.acknowledgedAt ? (
                  <p className="issue-meta page__meta">
                    Принято {i.acknowledgedByName ?? i.acknowledgedBy}
                    {i.ackComment ? (
                      <>
                        <MetaSep />
                        «{i.ackComment}»
                      </>
                    ) : null}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ScanTab({
  detail,
  busy,
  onUpload,
  onDetach,
}: {
  detail: ProtocolCardDetail
  busy: boolean
  onUpload: (
    file: File,
    onProgress: (ratio: number) => void,
  ) => Promise<void>
  onDetach: () => Promise<void>
}) {
  const { notify } = useToast()
  const [uploadPercent, setUploadPercent] = useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)

  const canDetach =
    detail.scan.path != null &&
    detail.protocol.status !== ProtocolStatus.exported &&
    detail.protocol.status !== ProtocolStatus.sent
  const fileName = detail.scan.fileName ?? 'scan.pdf'

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function openPreview() {
    setPreviewBusy(true)
    try {
      const blob = await fetchScanPdfBlob(detail.protocol.id)
      const url = URL.createObjectURL(blob)
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Не удалось открыть PDF', 'error')
    } finally {
      setPreviewBusy(false)
    }
  }

  function closePreview() {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  return (
    <div className="card-panel">
      <p className="muted small">
        Прикрепите скан протокола в PDF. Размер не ограничен.
      </p>

      {detail.scan.path ? (
        <div className="file-card">
          <div className="file-card__icon" aria-hidden="true">
            <IconFilePdf />
          </div>
          <div className="file-card__body">
            <div className="file-card__name" title={fileName}>
              {fileName}
            </div>
            <div className="file-card__meta page__meta">
              PDF
              {detail.scan.sizeBytes != null ? (
                <>
                  <MetaSep />
                  {formatBytes(detail.scan.sizeBytes)}
                </>
              ) : null}
            </div>
          </div>
          <div className="file-card__actions">
            <IconButton
              label="Просмотр"
              disabled={busy || previewBusy}
              onClick={() => void openPreview()}
            >
              <IconEye />
            </IconButton>
            <IconButton
              label="Удалить"
              danger
              disabled={busy || !canDetach}
              onClick={() => {
                if (!confirm(`Удалить файл «${fileName}»?`)) return
                void onDetach()
              }}
            >
              <IconTrash />
            </IconButton>
          </div>
        </div>
      ) : (
        <div className="file-drop muted">
          Скан ещё не прикреплён — выберите PDF ниже.
        </div>
      )}

      {uploadPercent != null && (
        <div
          className="upload-progress"
          role="progressbar"
          aria-valuenow={uploadPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="upload-progress__bar"
            style={{ width: `${uploadPercent}%` }}
          />
          <span className="upload-progress__label">{uploadPercent}%</span>
        </div>
      )}

      <div className="form-actions">
        <label className="btn btn--primary">
          Добавить PDF
          <input
            type="file"
            accept="application/pdf,.pdf"
            hidden
            disabled={busy || uploadPercent != null}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setUploadPercent(0)
              void onUpload(file, (ratio) => {
                setUploadPercent(Math.round(ratio * 100))
              })
                .catch(() => undefined)
                .finally(() => setUploadPercent(null))
              e.target.value = ''
            }}
          />
        </label>
      </div>

      {detail.protocol.status === ProtocolStatus.approved &&
        detail.protocol.applicationDate &&
        detail.scan.path && (
          <p className="callout callout--ok">
            Условия «Готов к передаче» выполнены: утверждён + PDF + дата заявки.
          </p>
        )}

      {previewUrl && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePreview()
          }}
        >
          <div
            className="modal modal--wide modal--preview"
            role="dialog"
            aria-modal="true"
            aria-label={`Просмотр ${fileName}`}
          >
            <div className="preview-head">
              <h2>{fileName}</h2>
              <button type="button" className="btn" onClick={closePreview}>
                Закрыть
              </button>
            </div>
            <iframe
              className="preview-frame"
              title={fileName}
              src={previewUrl}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`
}

function JournalTab({ detail }: { detail: ProtocolCardDetail }) {
  return (
    <div className="card-panel">
      {detail.audit.length === 0 ? (
        <p className="muted">Записей журнала пока нет.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Когда</th>
                <th>Кто</th>
                <th>Действие</th>
                <th className="cell-start">Детали</th>
              </tr>
            </thead>
            <tbody>
              {detail.audit.map((a) => (
                <tr key={a.id}>
                  <td className="mono small">
                    {formatMoscowDateTime(a.at)}
                  </td>
                  <td>{a.actorName ?? a.actor ?? '—'}</td>
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
                            <div key={`${i}-${line}`} className="audit-detail__line">
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
      )}
    </div>
  )
}

function Field({
  label,
  children,
  focusId,
}: {
  label: string
  children: ReactNode
  focusId?: string
}) {
  return (
    <label className="field" data-focus={focusId}>
      <span>{label}</span>
      {children}
    </label>
  )
}
