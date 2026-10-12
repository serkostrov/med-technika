import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CustomerKindId,
  FORM_STATUS_LABELS,
  OaEditionKind,
  type OaEditionKind as OaKind,
} from '@/domain'
import { useAuth } from '@/client/auth-context'
import { useToast } from '@/shared/ui/toast'
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/states'
import { readExcelSheetRows, type ImportIssue } from '@/dictionaries'
import { apiFetchJson } from '@/client/dictionaries-api'
import {
  equipmentKindLabel,
  oaEditionKindLabel,
  parserProfileLabel,
} from '@/shared/ui/labels'
import {
  ImportPreviewBlock,
  ModalDialog,
  RowActions,
  SectionHead,
} from '@/pages/dictionaries/shared-ui'
import { Select } from '@/shared/ui/Select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { MetaSep } from '@/shared/ui/icons'
import { formatCalendarDate } from '@/shared/time/moscow'

type TabId =
  | 'oa'
  | 'equipment'
  | 'units'
  | 'customers'
  | 'forms'
  | 'fsa'

type Snapshot = {
  oaEditions: { id: string; title: string; kind: string; isActive: boolean }[]
  oaItems: {
    id: string
    editionId: string
    itemNo: string
    methodikText: string
    indicatorText: string
    unitText: string | null
    rangeText: string | null
    objectType: string | null
  }[]
  staff: {
    id: string
    fullName: string
    shortName: string
    surname: string
    fgisIdFullName: number | null
    postName: string | null
    appRole: string
    isActive: boolean
    authUserId: string | null
  }[]
  equipment: {
    id: string
    name: string
    serialNo: string | null
    serialNorm: string | null
    invNo: string | null
    kind: string
    fgisEquipmentId: number | null
    isActive: boolean
  }[]
  equipmentVerifications: {
    id: string
    equipmentId: string
    certNo: string
    validUntil: string
    verifiedOn: string | null
  }[]
  units: { fgisId: string; symbol: string; name: string | null }[]
  unitConversions: { fromSymbol: string; toSymbol: string; factor: number }[]
  customers: {
    id: string
    name: string
    nameAliases: string[]
    kindId: number
    inn: string | null
    ogrn: string | null
    phone: string | null
    email: string | null
    legalAddress: string | null
    actualAddress: string | null
  }[]
  measurementKinds: { id: number; code: string; title: string }[]
  protocolForms: {
    id: string
    title: string
    status: keyof typeof FORM_STATUS_LABELS
    parserProfile: string
    typeObjectId: number | null
    fgisDirectory: string
  }[]
  formIndicatorMaps: { id: string; formId: string; sourceKey: string }[]
  fsaEntries: { id: string; catalog: string; name: string }[]
  settings: { key: string; value: unknown }[]
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'oa', label: 'Область аккредитации' },
  { id: 'equipment', label: 'Оборудование и СИ' },
  { id: 'units', label: 'Единицы' },
  { id: 'customers', label: 'Заказчики' },
  { id: 'forms', label: 'Виды и формы' },
  { id: 'fsa', label: 'ФСА' },
]

type Notify = (m: string, k?: 'info' | 'success' | 'error') => void

export function DictionariesPage() {
  const { capabilities } = useAuth()
  const { notify } = useToast()
  const canWrite = Boolean(capabilities?.canManageDictionaries)
  const [tab, setTab] = useState<TabId>('oa')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    setError(null)
    try {
      const data = await apiFetchJson<Snapshot>('/dictionaries')
      setSnapshot(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  if (error) {
    return <ErrorState message={error} onRetry={() => void reload()} />
  }
  if (!snapshot) return <LoadingState label="Загрузка справочников…" />

  return (
    <div className="page page--wide">
      <h1>Справочники</h1>
      <p className="muted">
        ОА, оборудование, единицы и заказчики.
        {!canWrite ? ' Только просмотр.' : ' Правки вручную или через Excel.'}
      </p>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={tab === t.id ? 'tabs__btn tabs__btn--active' : 'tabs__btn'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'oa' && (
        <OaPanel
          snapshot={snapshot}
          canWrite={canWrite}
          busy={busy}
          setBusy={setBusy}
          notify={notify}
          onDone={reload}
        />
      )}
      {tab === 'equipment' && (
        <EquipmentPanel
          snapshot={snapshot}
          canWrite={canWrite}
          notify={notify}
          onDone={reload}
        />
      )}
      {tab === 'units' && (
        <UnitsPanel
          snapshot={snapshot}
          canWrite={canWrite}
          notify={notify}
          onDone={reload}
        />
      )}
      {tab === 'customers' && (
        <CustomersPanel
          snapshot={snapshot}
          canWrite={canWrite}
          notify={notify}
          onDone={reload}
        />
      )}
      {tab === 'forms' && (
        <FormsPanel
          snapshot={snapshot}
          canWrite={canWrite}
          notify={notify}
          onDone={reload}
        />
      )}
      {tab === 'fsa' && (
        <LegacyImportPanel
          title="Справочники ФСА (опционально)"
          canWrite={canWrite}
          sheetHint=""
          previewPath="/rpc/fsa_import_preview"
          commitPath="/rpc/fsa_import"
          extraPreviewBody={{ catalog: 'indicators' }}
          summary={`${snapshot.fsaEntries.length} записей ФСА`}
          list={snapshot.fsaEntries
            .slice(0, 20)
            .map((e) => `${e.catalog}: ${e.id} — ${e.name}`)}
          notify={notify}
          onDone={reload}
        />
      )}
    </div>
  )
}

/* ── ОА ───────────────────────────────────────────────── */

function OaPanel({
  snapshot,
  canWrite,
  busy,
  setBusy,
  notify,
  onDone,
}: {
  snapshot: Snapshot
  canWrite: boolean
  busy: boolean
  setBusy: (v: boolean) => void
  notify: Notify
  onDone: () => Promise<void>
}) {
  const [preview, setPreview] = useState<{
    canCommit: boolean
    issues: ImportIssue[]
    rowCount: number
    segments: {
      index: number
      itemCount: number
      firstItemNo: string
      lastItemNo: string
      suggestedKind: OaKind | null
    }[]
    needsKindAssignment: boolean
    sourceFile: string | null
  } | null>(null)
  const [kinds, setKinds] = useState<OaKind[]>([])
  const [editionDialog, setEditionDialog] = useState<
    null | 'create' | Snapshot['oaEditions'][number]
  >(null)
  const [itemDialog, setItemDialog] = useState<
    null | 'create' | Snapshot['oaItems'][number]
  >(null)
  const [edForm, setEdForm] = useState({
    title: '',
    kind: OaEditionKind.current as OaKind,
    isActive: true,
  })
  const [itemForm, setItemForm] = useState({
    editionId: '',
    itemNo: '',
    methodikText: '',
    indicatorText: '',
    unitText: '',
    rangeText: '',
    objectType: '',
  })

  async function onExcel(file: File) {
    setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const { rows, sheetName } = await readExcelSheetRows(buf, 'Лист3')
      const data = await apiFetchJson<typeof preview & object>(
        '/rpc/oa_import_preview',
        {
          method: 'POST',
          body: JSON.stringify({
            rows,
            sourceFile: `${file.name} / ${sheetName}`,
          }),
        },
      )
      setPreview(data)
      setKinds(
        data.segments.map((s) => s.suggestedKind ?? OaEditionKind.current),
      )
      notify('Предпросмотр ОА готов. Запись ещё не выполнена.', 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка импорта', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function commitExcel() {
    if (!preview || !preview.canCommit) return
    setBusy(true)
    try {
      const result = await apiFetchJson<{ itemCount: number }>('/rpc/oa_import', {
        method: 'POST',
        body: JSON.stringify({ preview, segmentKinds: kinds }),
      })
      notify(`Импортировано позиций ОА: ${result.itemCount}`, 'success')
      setPreview(null)
      await onDone()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка записи', 'error')
    } finally {
      setBusy(false)
    }
  }

  function openCreateEdition() {
    setEdForm({ title: '', kind: OaEditionKind.current, isActive: true })
    setEditionDialog('create')
  }

  function openEditEdition(e: Snapshot['oaEditions'][number]) {
    setEdForm({
      title: e.title,
      kind: e.kind as OaKind,
      isActive: e.isActive,
    })
    setEditionDialog(e)
  }

  async function saveEdition() {
    setBusy(true)
    try {
      if (editionDialog === 'create') {
        await apiFetchJson('/oa-editions', {
          method: 'POST',
          body: JSON.stringify(edForm),
        })
        notify('Редакция добавлена', 'success')
      } else if (editionDialog) {
        await apiFetchJson(`/oa-editions/${editionDialog.id}`, {
          method: 'PUT',
          body: JSON.stringify(edForm),
        })
        notify('Редакция обновлена', 'success')
      }
      setEditionDialog(null)
      await onDone()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function deleteEdition(id: string) {
    if (!confirm('Деактивировать редакцию ОА? Ссылки в протоколах сохранятся.')) {
      return
    }
    setBusy(true)
    try {
      await apiFetchJson(`/oa-editions/${id}`, { method: 'DELETE' })
      notify('Редакция деактивирована', 'success')
      await onDone()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  function openCreateItem() {
    setItemForm({
      editionId: snapshot.oaEditions.find((e) => e.isActive)?.id ?? snapshot.oaEditions[0]?.id ?? '',
      itemNo: '',
      methodikText: '',
      indicatorText: '',
      unitText: '',
      rangeText: '',
      objectType: '',
    })
    setItemDialog('create')
  }

  function openEditItem(item: Snapshot['oaItems'][number]) {
    setItemForm({
      editionId: item.editionId,
      itemNo: item.itemNo,
      methodikText: item.methodikText,
      indicatorText: item.indicatorText,
      unitText: item.unitText ?? '',
      rangeText: item.rangeText ?? '',
      objectType: item.objectType ?? '',
    })
    setItemDialog(item)
  }

  async function saveItem() {
    setBusy(true)
    try {
      const body = {
        editionId: itemForm.editionId,
        itemNo: itemForm.itemNo,
        methodikText: itemForm.methodikText,
        indicatorText: itemForm.indicatorText,
        unitText: itemForm.unitText || null,
        rangeText: itemForm.rangeText || null,
        objectType: itemForm.objectType || null,
      }
      if (itemDialog === 'create') {
        await apiFetchJson('/oa-items', { method: 'POST', body: JSON.stringify(body) })
        notify('Позиция ОА добавлена', 'success')
      } else if (itemDialog) {
        await apiFetchJson(`/oa-items/${itemDialog.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        notify('Позиция ОА обновлена', 'success')
      }
      setItemDialog(null)
      await onDone()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function deleteItem(id: string) {
    if (!confirm('Удалить позицию ОА?')) return
    setBusy(true)
    try {
      await apiFetchJson(`/oa-items/${id}`, { method: 'DELETE' })
      notify('Позиция удалена', 'success')
      await onDone()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="section">
        <SectionHead
          title="Область аккредитации"
          summary={`Что лаборатория имеет право измерять. Редакций: ${snapshot.oaEditions.length}, позиций: ${snapshot.oaItems.length}.`}
          canWrite={canWrite}
          busy={busy}
          onExcel={(f) => void onExcel(f)}
          onAdd={openCreateEdition}
          addLabel="Добавить"
        />
        {snapshot.oaEditions.length === 0 ? (
          <EmptyState title="Редакций нет" description="Добавьте вручную или загрузите Excel." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="cell-start">Редакция</th>
                  <th>Тип</th>
                  <th>Статус</th>
                  {canWrite ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {snapshot.oaEditions.map((e) => (
                  <tr key={e.id}>
                    <td className="cell-start">{e.title}</td>
                    <td>{oaEditionKindLabel(e.kind)}</td>
                    <td>{e.isActive ? 'активна' : 'архив'}</td>
                    <RowActions
                      canWrite={canWrite}
                      onEdit={() => openEditEdition(e)}
                      onDelete={() => void deleteEdition(e.id)}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {preview && (
          <ImportPreviewBlock
            issues={preview.issues}
            rowCount={preview.rowCount}
            canCommit={preview.canCommit}
            onCommit={() => void commitExcel()}
            busy={busy}
          >
            {preview.segments.map((s, i) => (
              <div key={s.index} className="segment-row">
                <span>
                  Часть {s.index + 1}: стр. пунктов {s.firstItemNo}…{s.lastItemNo} (
                  {s.itemCount})
                </span>
                <Select
                  value={kinds[i] ?? OaEditionKind.current}
                  onChange={(v) => {
                    const next = [...kinds]
                    next[i] = v as OaKind
                    setKinds(next)
                  }}
                  options={[
                    { value: OaEditionKind.current, label: 'Действующая' },
                    { value: OaEditionKind.extension, label: 'Расширяемая' },
                  ]}
                />
              </div>
            ))}
          </ImportPreviewBlock>
        )}
      </section>

      <section className="section">
        <SectionHead
          title="Позиции ОА"
          summary={`Активных позиций: ${snapshot.oaItems.length}`}
          canWrite={canWrite}
          busy={busy}
          onAdd={openCreateItem}
        />
        {snapshot.oaItems.length === 0 ? (
          <EmptyState title="Позиций нет" />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Пункт</th>
                  <th>Методика</th>
                  <th>Показатель</th>
                  <th>Ед.</th>
                  {canWrite ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {snapshot.oaItems.slice(0, 80).map((item) => (
                  <tr key={item.id}>
                    <td>{item.itemNo}</td>
                    <td>{item.methodikText}</td>
                    <td>{item.indicatorText}</td>
                    <td>{item.unitText ?? '—'}</td>
                    <RowActions
                      canWrite={canWrite}
                      onEdit={() => openEditItem(item)}
                      onDelete={() => void deleteItem(item.id)}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ModalDialog
        title={editionDialog === 'create' ? 'Новая редакция ОА' : 'Редакция ОА'}
        open={editionDialog != null}
        onClose={() => setEditionDialog(null)}
        busy={busy}
        footer={
          <>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !edForm.title.trim()}
              onClick={() => void saveEdition()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setEditionDialog(null)}
            >
              Отмена
            </button>
          </>
        }
      >
        <label className="field">
          <span>Название</span>
          <input
            value={edForm.title}
            onChange={(e) => setEdForm((f) => ({ ...f, title: e.target.value }))}
          />
        </label>
        <label className="field">
          <span>Тип</span>
          <Select
            value={edForm.kind}
            onChange={(v) =>
              setEdForm((f) => ({ ...f, kind: v as OaKind }))
            }
            options={[
              { value: OaEditionKind.current, label: 'Действующая' },
              { value: OaEditionKind.extension, label: 'Расширяемая' },
            ]}
          />
        </label>
        <label className="field field--check">
          <input
            type="checkbox"
            checked={edForm.isActive}
            onChange={(e) =>
              setEdForm((f) => ({ ...f, isActive: e.target.checked }))
            }
          />
          <span>Активна</span>
        </label>
      </ModalDialog>

      <ModalDialog
        title={itemDialog === 'create' ? 'Новая позиция ОА' : 'Позиция ОА'}
        open={itemDialog != null}
        onClose={() => setItemDialog(null)}
        busy={busy}
        footer={
          <>
            <button
              type="button"
              className="btn btn--primary"
              disabled={
                busy ||
                !itemForm.editionId ||
                !itemForm.itemNo.trim() ||
                !itemForm.methodikText.trim() ||
                !itemForm.indicatorText.trim()
              }
              onClick={() => void saveItem()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setItemDialog(null)}
            >
              Отмена
            </button>
          </>
        }
      >
        <label className="field">
          <span>Редакция</span>
          <Select
            value={itemForm.editionId}
            onChange={(v) => setItemForm((f) => ({ ...f, editionId: v }))}
            options={[
              { value: '', label: '—' },
              ...snapshot.oaEditions.map((e) => ({
                value: e.id,
                label: e.title,
              })),
            ]}
          />
        </label>
        <label className="field">
          <span>Пункт</span>
          <input
            value={itemForm.itemNo}
            onChange={(e) =>
              setItemForm((f) => ({ ...f, itemNo: e.target.value }))
            }
          />
        </label>
        <label className="field">
          <span>Методика</span>
          <input
            value={itemForm.methodikText}
            onChange={(e) =>
              setItemForm((f) => ({ ...f, methodikText: e.target.value }))
            }
          />
        </label>
        <label className="field">
          <span>Показатель</span>
          <input
            value={itemForm.indicatorText}
            onChange={(e) =>
              setItemForm((f) => ({ ...f, indicatorText: e.target.value }))
            }
          />
        </label>
        <label className="field">
          <span>Единица</span>
          <input
            value={itemForm.unitText}
            onChange={(e) =>
              setItemForm((f) => ({ ...f, unitText: e.target.value }))
            }
          />
        </label>
        <label className="field">
          <span>Диапазон</span>
          <input
            value={itemForm.rangeText}
            onChange={(e) =>
              setItemForm((f) => ({ ...f, rangeText: e.target.value }))
            }
          />
        </label>
        <label className="field">
          <span>Тип объекта</span>
          <input
            value={itemForm.objectType}
            onChange={(e) =>
              setItemForm((f) => ({ ...f, objectType: e.target.value }))
            }
          />
        </label>
      </ModalDialog>
    </>
  )
}

/* ── Оборудование ─────────────────────────────────────── */

function EquipmentPanel({
  snapshot,
  canWrite,
  notify,
  onDone,
}: {
  snapshot: Snapshot
  canWrite: boolean
  notify: Notify
  onDone: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{
    canCommit: boolean
    issues: ImportIssue[]
    rowCount: number
  } | null>(null)
  const [fullPreview, setFullPreview] = useState<unknown>(null)
  const [dialog, setDialog] = useState<
    null | 'create' | Snapshot['equipment'][number]
  >(null)
  const [verDialog, setVerDialog] = useState<
    null | 'create' | Snapshot['equipmentVerifications'][number]
  >(null)
  const [form, setForm] = useState({
    name: '',
    kind: 'si',
    serialNo: '',
    invNo: '',
    fgisEquipmentId: '',
    isActive: true,
  })
  const [verForm, setVerForm] = useState({
    equipmentId: '',
    certNo: '',
    validUntil: '',
    verifiedOn: '',
  })

  const equipById = useMemo(() => {
    const m = new Map<string, Snapshot['equipment'][number]>()
    for (const e of snapshot.equipment) m.set(e.id, e)
    return m
  }, [snapshot.equipment])

  async function onExcel(file: File) {
    setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const { rows } = await readExcelSheetRows(buf, 'Оборудование')
      const data = await apiFetchJson<{
        canCommit: boolean
        issues: ImportIssue[]
        rowCount: number
      }>('/rpc/equipment_import_preview', {
        method: 'POST',
        body: JSON.stringify({ rows, sourceFile: file.name }),
      })
      setPreview(data)
      setFullPreview(data)
      notify('Предпросмотр готов', 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function commitExcel() {
    if (!fullPreview || !preview?.canCommit) return
    setBusy(true)
    try {
      await apiFetchJson('/rpc/equipment_import', {
        method: 'POST',
        body: JSON.stringify({ preview: fullPreview }),
      })
      notify('Импорт записан', 'success')
      setPreview(null)
      setFullPreview(null)
      await onDone()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка записи', 'error')
    } finally {
      setBusy(false)
    }
  }

  function openCreate() {
    setForm({
      name: '',
      kind: 'si',
      serialNo: '',
      invNo: '',
      fgisEquipmentId: '',
      isActive: true,
    })
    setDialog('create')
  }

  function openEdit(e: Snapshot['equipment'][number]) {
    setForm({
      name: e.name,
      kind: e.kind,
      serialNo: e.serialNo ?? '',
      invNo: e.invNo ?? '',
      fgisEquipmentId:
        e.fgisEquipmentId != null ? String(e.fgisEquipmentId) : '',
      isActive: e.isActive,
    })
    setDialog(e)
  }

  async function save() {
    setBusy(true)
    try {
      const body = {
        name: form.name,
        kind: form.kind,
        serialNo: form.serialNo || null,
        invNo: form.invNo || null,
        fgisEquipmentId: form.fgisEquipmentId
          ? Number(form.fgisEquipmentId)
          : null,
        isActive: form.isActive,
      }
      if (dialog === 'create') {
        await apiFetchJson('/equipment', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        notify('Оборудование добавлено', 'success')
      } else if (dialog) {
        await apiFetchJson(`/equipment/${dialog.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        notify('Оборудование обновлено', 'success')
      }
      setDialog(null)
      await onDone()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Удалить оборудование?')) return
    setBusy(true)
    try {
      await apiFetchJson(`/equipment/${id}`, { method: 'DELETE' })
      notify('Оборудование удалено', 'success')
      await onDone()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  function openCreateVerification() {
    setVerForm({
      equipmentId: snapshot.equipment[0]?.id ?? '',
      certNo: '',
      validUntil: '',
      verifiedOn: '',
    })
    setVerDialog('create')
  }

  function openEditVerification(
    v: Snapshot['equipmentVerifications'][number],
  ) {
    setVerForm({
      equipmentId: v.equipmentId,
      certNo: v.certNo,
      validUntil: v.validUntil,
      verifiedOn: v.verifiedOn ?? '',
    })
    setVerDialog(v)
  }

  async function saveVerification() {
    setBusy(true)
    try {
      const body = {
        equipmentId: verForm.equipmentId,
        certNo: verForm.certNo,
        validUntil: verForm.validUntil,
        verifiedOn: verForm.verifiedOn || null,
      }
      if (verDialog === 'create') {
        await apiFetchJson('/rpc/equipment_verification', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        notify('Поверка добавлена', 'success')
      } else if (verDialog) {
        await apiFetchJson(`/equipment-verifications/${verDialog.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        notify('Поверка обновлена', 'success')
      }
      setVerDialog(null)
      await onDone()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function removeVerification(id: string) {
    if (!confirm('Удалить запись о поверке?')) return
    setBusy(true)
    try {
      await apiFetchJson(`/equipment-verifications/${id}`, { method: 'DELETE' })
      notify('Поверка удалена', 'success')
      await onDone()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="section">
        <SectionHead
          title="Оборудование и СИ"
          summary={
            <>
              {snapshot.equipment.length} позиций
              <MetaSep />
              поверок: {snapshot.equipmentVerifications.length}
            </>
          }
          canWrite={canWrite}
          busy={busy}
          onExcel={(f) => void onExcel(f)}
          onAdd={openCreate}
        />
        {snapshot.equipment.length === 0 ? (
          <EmptyState title="Пока пусто" description="Добавьте вручную или загрузите Excel." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="cell-start">Наименование</th>
                  <th>Тип</th>
                  <th>Зав. №</th>
                  <th>Код СИ</th>
                  {canWrite ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {snapshot.equipment.map((e) => (
                  <tr key={e.id}>
                    <td className="cell-start">{e.name}</td>
                    <td>{equipmentKindLabel(e.kind)}</td>
                    <td>{e.serialNorm ?? '—'}</td>
                    <td>{e.fgisEquipmentId ?? '—'}</td>
                    <RowActions
                      canWrite={canWrite}
                      onEdit={() => openEdit(e)}
                      onDelete={() => void remove(e.id)}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {preview && (
          <ImportPreviewBlock
            issues={preview.issues}
            rowCount={preview.rowCount}
            canCommit={preview.canCommit}
            onCommit={() => void commitExcel()}
            busy={busy}
          />
        )}
      </section>

      <section className="section">
        <SectionHead
          title="История поверок"
          canWrite={canWrite}
          busy={busy}
          onAdd={openCreateVerification}
        />
        {snapshot.equipmentVerifications.length === 0 ? (
          <p className="muted">Поверок пока нет.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="cell-start">Свидетельство</th>
                  <th>Действительна до</th>
                  <th className="cell-start">Оборудование</th>
                  {canWrite ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {snapshot.equipmentVerifications.map((v) => (
                  <tr key={v.id}>
                    <td className="cell-start">{v.certNo}</td>
                    <td>{formatCalendarDate(v.validUntil)}</td>
                    <td className="cell-start">
                      {equipById.get(v.equipmentId)?.name ?? '—'}
                    </td>
                    <RowActions
                      canWrite={canWrite}
                      onEdit={() => openEditVerification(v)}
                      onDelete={() => void removeVerification(v.id)}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ModalDialog
        title={dialog === 'create' ? 'Новое оборудование' : 'Оборудование'}
        open={dialog != null}
        onClose={() => setDialog(null)}
        busy={busy}
        footer={
          <>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !form.name.trim()}
              onClick={() => void save()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setDialog(null)}
            >
              Отмена
            </button>
          </>
        }
      >
        <label className="field">
          <span>Наименование</span>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>
        <label className="field">
          <span>Тип</span>
          <Select
            value={form.kind}
            onChange={(v) => setForm((f) => ({ ...f, kind: v }))}
            options={[
              { value: 'si', label: 'СИ' },
              { value: 'aux', label: 'вспомогательное' },
              { value: 'test', label: 'испытательное' },
            ]}
          />
        </label>
        <label className="field">
          <span>Заводской номер</span>
          <input
            value={form.serialNo}
            onChange={(e) => setForm((f) => ({ ...f, serialNo: e.target.value }))}
          />
        </label>
        <label className="field">
          <span>Инв. номер</span>
          <input
            value={form.invNo}
            onChange={(e) => setForm((f) => ({ ...f, invNo: e.target.value }))}
          />
        </label>
        <label className="field">
          <span>Код СИ во ФГИС</span>
          <input
            value={form.fgisEquipmentId}
            onChange={(e) =>
              setForm((f) => ({ ...f, fgisEquipmentId: e.target.value }))
            }
          />
        </label>
        <label className="field field--check">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) =>
              setForm((f) => ({ ...f, isActive: e.target.checked }))
            }
          />
          <span>Активно</span>
        </label>
      </ModalDialog>

      <ModalDialog
        title={verDialog === 'create' ? 'Новая поверка' : 'Поверка'}
        open={verDialog != null}
        onClose={() => setVerDialog(null)}
        busy={busy}
        footer={
          <>
            <button
              type="button"
              className="btn btn--primary"
              disabled={
                busy ||
                !verForm.equipmentId ||
                !verForm.certNo.trim() ||
                !verForm.validUntil
              }
              onClick={() => void saveVerification()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setVerDialog(null)}
            >
              Отмена
            </button>
          </>
        }
      >
        <label className="field">
          <span>Оборудование</span>
          <Select
            value={verForm.equipmentId}
            onChange={(v) => setVerForm((f) => ({ ...f, equipmentId: v }))}
            options={[
              { value: '', label: '—' },
              ...snapshot.equipment.map((e) => ({
                value: e.id,
                label: e.name,
              })),
            ]}
          />
        </label>
        <label className="field">
          <span>Номер свидетельства</span>
          <input
            value={verForm.certNo}
            onChange={(e) =>
              setVerForm((f) => ({ ...f, certNo: e.target.value }))
            }
          />
        </label>
        <label className="field">
          <span>Дата поверки</span>
          <DatePicker
            value={verForm.verifiedOn}
            onChange={(v) => setVerForm((f) => ({ ...f, verifiedOn: v }))}
          />
        </label>
        <label className="field">
          <span>Действительна до</span>
          <DatePicker
            value={verForm.validUntil}
            onChange={(v) => setVerForm((f) => ({ ...f, validUntil: v }))}
            allowClear={false}
          />
        </label>
      </ModalDialog>
    </>
  )
}

/* ── Единицы ──────────────────────────────────────────── */

function UnitsPanel({
  snapshot,
  canWrite,
  notify,
  onDone,
}: {
  snapshot: Snapshot
  canWrite: boolean
  notify: Notify
  onDone: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{
    canCommit: boolean
    issues: ImportIssue[]
    rowCount: number
  } | null>(null)
  const [fullPreview, setFullPreview] = useState<unknown>(null)
  const [unitDialog, setUnitDialog] = useState<
    null | 'create' | Snapshot['units'][number]
  >(null)
  const [convDialog, setConvDialog] = useState<
    null | 'create' | Snapshot['unitConversions'][number]
  >(null)
  const [unitForm, setUnitForm] = useState({
    fgisId: '',
    symbol: '',
    name: '',
  })
  const [convForm, setConvForm] = useState({
    fromSymbol: '',
    toSymbol: '',
    factor: '',
  })
  const [editKey, setEditKey] = useState<{ from: string; to: string } | null>(
    null,
  )

  async function onExcel(file: File) {
    setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const { rows } = await readExcelSheetRows(buf)
      const data = await apiFetchJson<{
        canCommit: boolean
        issues: ImportIssue[]
        rowCount: number
      }>('/rpc/units_import_preview', {
        method: 'POST',
        body: JSON.stringify({ rows, sourceFile: file.name }),
      })
      setPreview(data)
      setFullPreview(data)
      notify('Предпросмотр готов', 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function commitExcel() {
    if (!fullPreview || !preview?.canCommit) return
    setBusy(true)
    try {
      await apiFetchJson('/rpc/units_import', {
        method: 'POST',
        body: JSON.stringify({ preview: fullPreview }),
      })
      notify('Импорт записан', 'success')
      setPreview(null)
      setFullPreview(null)
      await onDone()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка записи', 'error')
    } finally {
      setBusy(false)
    }
  }

  function openCreateUnit() {
    setUnitForm({ fgisId: '', symbol: '', name: '' })
    setUnitDialog('create')
  }

  function openEditUnit(u: Snapshot['units'][number]) {
    setUnitForm({
      fgisId: u.fgisId,
      symbol: u.symbol,
      name: u.name ?? '',
    })
    setUnitDialog(u)
  }

  async function saveUnit() {
    setBusy(true)
    try {
      await apiFetchJson('/units', {
        method: 'PUT',
        body: JSON.stringify({
          fgisId: unitForm.fgisId,
          symbol: unitForm.symbol,
          name: unitForm.name || null,
        }),
      })
      notify(
        unitDialog === 'create' ? 'Единица добавлена' : 'Единица обновлена',
        'success',
      )
      setUnitDialog(null)
      await onDone()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function removeUnit(fgisId: string) {
    if (!confirm('Удалить единицу?')) return
    setBusy(true)
    try {
      await apiFetchJson(`/units/${encodeURIComponent(fgisId)}`, {
        method: 'DELETE',
      })
      notify('Единица удалена', 'success')
      await onDone()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  function openCreateConv() {
    setConvForm({ fromSymbol: '', toSymbol: '', factor: '' })
    setEditKey(null)
    setConvDialog('create')
  }

  function openEditConv(c: Snapshot['unitConversions'][number]) {
    setConvForm({
      fromSymbol: c.fromSymbol,
      toSymbol: c.toSymbol,
      factor: String(c.factor),
    })
    setEditKey({ from: c.fromSymbol, to: c.toSymbol })
    setConvDialog(c)
  }

  async function saveConv() {
    setBusy(true)
    try {
      if (
        editKey &&
        (editKey.from !== convForm.fromSymbol || editKey.to !== convForm.toSymbol)
      ) {
        await apiFetchJson('/unit-conversions', {
          method: 'DELETE',
          body: JSON.stringify({
            fromSymbol: editKey.from,
            toSymbol: editKey.to,
          }),
        })
      }
      await apiFetchJson('/unit-conversions', {
        method: 'PUT',
        body: JSON.stringify({
          fromSymbol: convForm.fromSymbol,
          toSymbol: convForm.toSymbol,
          factor: Number(convForm.factor),
        }),
      })
      notify(
        convDialog === 'create' ? 'Пересчёт добавлен' : 'Пересчёт обновлён',
        'success',
      )
      setConvDialog(null)
      await onDone()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function removeConv(fromSymbol: string, toSymbol: string) {
    if (!confirm('Удалить пересчёт?')) return
    setBusy(true)
    try {
      await apiFetchJson('/unit-conversions', {
        method: 'DELETE',
        body: JSON.stringify({ fromSymbol, toSymbol }),
      })
      notify('Пересчёт удалён', 'success')
      await onDone()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="section">
        <SectionHead
          title="Единицы измерения"
          summary={
            <>
              {snapshot.units.length} единиц
              <MetaSep />
              пересчётов: {snapshot.unitConversions.length}
            </>
          }
          canWrite={canWrite}
          busy={busy}
          onExcel={(f) => void onExcel(f)}
          onAdd={openCreateUnit}
        />
        {snapshot.units.length === 0 ? (
          <EmptyState title="Пока пусто" description="Добавьте вручную или загрузите Excel." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Обозначение</th>
                  <th>ID ФГИС</th>
                  <th>Название</th>
                  {canWrite ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {snapshot.units.map((u) => (
                  <tr key={u.fgisId}>
                    <td>{u.symbol}</td>
                    <td>{u.fgisId}</td>
                    <td>{u.name ?? '—'}</td>
                    <RowActions
                      canWrite={canWrite}
                      onEdit={() => openEditUnit(u)}
                      onDelete={() => void removeUnit(u.fgisId)}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {preview && (
          <ImportPreviewBlock
            issues={preview.issues}
            rowCount={preview.rowCount}
            canCommit={preview.canCommit}
            onCommit={() => void commitExcel()}
            busy={busy}
          />
        )}
      </section>

      <section className="section">
        <SectionHead
          title="Пересчёты единиц"
          canWrite={canWrite}
          busy={busy}
          onAdd={openCreateConv}
        />
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Из</th>
                <th>В</th>
                <th>Коэффициент</th>
                {canWrite ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {snapshot.unitConversions.map((c) => (
                <tr key={`${c.fromSymbol}-${c.toSymbol}`}>
                  <td>{c.fromSymbol}</td>
                  <td>{c.toSymbol}</td>
                  <td>{c.factor}</td>
                  <RowActions
                    canWrite={canWrite}
                    onEdit={() => openEditConv(c)}
                    onDelete={() => void removeConv(c.fromSymbol, c.toSymbol)}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ModalDialog
        title={unitDialog === 'create' ? 'Новая единица' : 'Единица'}
        open={unitDialog != null}
        onClose={() => setUnitDialog(null)}
        busy={busy}
        footer={
          <>
            <button
              type="button"
              className="btn btn--primary"
              disabled={
                busy || !unitForm.fgisId.trim() || !unitForm.symbol.trim()
              }
              onClick={() => void saveUnit()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setUnitDialog(null)}
            >
              Отмена
            </button>
          </>
        }
      >
        <label className="field">
          <span>ID ФГИС</span>
          <input
            value={unitForm.fgisId}
            disabled={unitDialog !== 'create'}
            onChange={(e) =>
              setUnitForm((f) => ({ ...f, fgisId: e.target.value }))
            }
          />
        </label>
        <label className="field">
          <span>Обозначение</span>
          <input
            value={unitForm.symbol}
            onChange={(e) =>
              setUnitForm((f) => ({ ...f, symbol: e.target.value }))
            }
          />
        </label>
        <label className="field">
          <span>Название</span>
          <input
            value={unitForm.name}
            onChange={(e) =>
              setUnitForm((f) => ({ ...f, name: e.target.value }))
            }
          />
        </label>
      </ModalDialog>

      <ModalDialog
        title={convDialog === 'create' ? 'Новый пересчёт' : 'Пересчёт'}
        open={convDialog != null}
        onClose={() => setConvDialog(null)}
        busy={busy}
        footer={
          <>
            <button
              type="button"
              className="btn btn--primary"
              disabled={
                busy ||
                !convForm.fromSymbol.trim() ||
                !convForm.toSymbol.trim() ||
                !(Number(convForm.factor) > 0)
              }
              onClick={() => void saveConv()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setConvDialog(null)}
            >
              Отмена
            </button>
          </>
        }
      >
        <label className="field">
          <span>Из</span>
          <input
            value={convForm.fromSymbol}
            onChange={(e) =>
              setConvForm((f) => ({ ...f, fromSymbol: e.target.value }))
            }
          />
        </label>
        <label className="field">
          <span>В</span>
          <input
            value={convForm.toSymbol}
            onChange={(e) =>
              setConvForm((f) => ({ ...f, toSymbol: e.target.value }))
            }
          />
        </label>
        <label className="field">
          <span>Коэффициент</span>
          <input
            type="number"
            step="any"
            value={convForm.factor}
            onChange={(e) =>
              setConvForm((f) => ({ ...f, factor: e.target.value }))
            }
          />
        </label>
      </ModalDialog>
    </>
  )
}

/* ── Прочие вкладки (без изменений по плану) ──────────── */

function LegacyImportPanel({
  title,
  canWrite,
  sheetHint,
  previewPath,
  commitPath,
  summary,
  list,
  notify,
  onDone,
  extraPreviewBody,
}: {
  title: string
  canWrite: boolean
  sheetHint: string
  previewPath: string
  commitPath: string
  summary: string
  list: string[]
  notify: Notify
  onDone: () => Promise<void>
  extraPreviewBody?: Record<string, unknown>
}) {
  const [preview, setPreview] = useState<{
    canCommit: boolean
    issues: ImportIssue[]
    rowCount: number
  } | null>(null)
  const [fullPreview, setFullPreview] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  async function onExcel(file: File) {
    setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const { rows } = await readExcelSheetRows(buf, sheetHint || undefined)
      const data = await apiFetchJson<{
        canCommit: boolean
        issues: ImportIssue[]
        rowCount: number
      }>(previewPath, {
        method: 'POST',
        body: JSON.stringify({
          rows,
          sourceFile: file.name,
          ...extraPreviewBody,
        }),
      })
      setPreview(data)
      setFullPreview(data)
      notify('Предпросмотр готов', 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function commit() {
    if (!fullPreview || !preview?.canCommit) return
    setBusy(true)
    try {
      await apiFetchJson(commitPath, {
        method: 'POST',
        body: JSON.stringify({ preview: fullPreview }),
      })
      notify('Импорт записан', 'success')
      setPreview(null)
      setFullPreview(null)
      await onDone()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка записи', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="section">
      <SectionHead
        title={title}
        summary={summary}
        canWrite={canWrite}
        busy={busy}
        onExcel={(f) => void onExcel(f)}
      />
      {list.length === 0 ? (
        <EmptyState title="Пока пусто" description="Импортируйте файл клиента." />
      ) : (
        <ul>
          {list.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {preview && (
        <ImportPreviewBlock
          issues={preview.issues}
          rowCount={preview.rowCount}
          canCommit={preview.canCommit}
          onCommit={() => void commit()}
          busy={busy}
        />
      )}
    </section>
  )
}

const CUSTOMER_KIND_OPTIONS = [
  { value: String(CustomerKindId.legalEntity), label: 'Юридическое лицо' },
  { value: String(CustomerKindId.soleProprietor), label: 'ИП' },
  { value: String(CustomerKindId.foreign), label: 'Иностранная организация' },
  { value: String(CustomerKindId.individual), label: 'Физическое лицо' },
]

function customerKindLabel(kindId: number): string {
  return (
    CUSTOMER_KIND_OPTIONS.find((o) => o.value === String(kindId))?.label ??
    String(kindId)
  )
}

function CustomersPanel({
  snapshot,
  canWrite,
  notify,
  onDone,
}: {
  snapshot: Snapshot
  canWrite: boolean
  notify: Notify
  onDone: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<
    null | 'create' | Snapshot['customers'][number]
  >(null)
  const [form, setForm] = useState({
    name: '',
    nameAliases: '',
    kindId: String(CustomerKindId.legalEntity),
    inn: '',
    ogrn: '',
    phone: '',
    email: '',
    legalAddress: '',
    actualAddress: '',
  })

  function openCreate() {
    setForm({
      name: '',
      nameAliases: '',
      kindId: String(CustomerKindId.legalEntity),
      inn: '',
      ogrn: '',
      phone: '',
      email: '',
      legalAddress: '',
      actualAddress: '',
    })
    setDialog('create')
  }

  function openEdit(c: Snapshot['customers'][number]) {
    setForm({
      name: c.name,
      nameAliases: c.nameAliases.join('; '),
      kindId: String(c.kindId ?? CustomerKindId.legalEntity),
      inn: c.inn ?? '',
      ogrn: c.ogrn ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      legalAddress: c.legalAddress ?? '',
      actualAddress: c.actualAddress ?? '',
    })
    setDialog(c)
  }

  function parseAliases(raw: string): string[] {
    return raw
      .split(/[;\n,]/)
      .map((a) => a.trim())
      .filter(Boolean)
  }

  async function save() {
    setBusy(true)
    try {
      const body = {
        name: form.name.trim(),
        nameAliases: parseAliases(form.nameAliases),
        kindId: Number(form.kindId),
        inn: form.inn.trim() || null,
        ogrn: form.ogrn.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        legalAddress: form.legalAddress.trim() || null,
        actualAddress: form.actualAddress.trim() || null,
      }
      if (dialog === 'create') {
        await apiFetchJson('/customers', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        notify('Заказчик добавлен', 'success')
      } else if (dialog) {
        await apiFetchJson(`/customers/${dialog.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        notify('Заказчик обновлён', 'success')
      }
      setDialog(null)
      await onDone()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Удалить заказчика «${name}»?`)) return
    setBusy(true)
    try {
      await apiFetchJson(`/customers/${id}`, { method: 'DELETE' })
      notify('Заказчик удалён', 'success')
      await onDone()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="section">
      <SectionHead
        title="Заказчики"
        summary={
          <>
            {snapshot.customers.length} организаций
            <MetaSep />
            названия, ИНН и контакты
          </>
        }
        canWrite={canWrite}
        busy={busy}
        onAdd={openCreate}
      />
      {snapshot.customers.length === 0 ? (
        <EmptyState
          title="Заказчиков нет"
          description={
            canWrite
              ? 'Добавьте организацию — наименование, ИНН и контакты.'
              : 'Организации-заказчики появятся после добавления.'
          }
          action={
            canWrite ? (
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={openCreate}
              >
                Добавить заказчика
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="cell-start">Наименование</th>
                <th>Тип</th>
                <th>ИНН</th>
                <th>Контакты</th>
                {canWrite ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {snapshot.customers.map((c) => (
                <tr key={c.id}>
                  <td className="cell-start">
                    <div>{c.name}</div>
                    {c.nameAliases.length > 0 ? (
                      <div className="muted small">
                        также: {c.nameAliases.join('; ')}
                      </div>
                    ) : null}
                  </td>
                  <td>{customerKindLabel(c.kindId)}</td>
                  <td>{c.inn ?? '—'}</td>
                  <td className="small">
                    {c.phone || c.email ? (
                      <span className="page__meta">
                        {c.phone}
                        {c.phone && c.email ? <MetaSep /> : null}
                        {c.email}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <RowActions
                    canWrite={canWrite}
                    onEdit={() => openEdit(c)}
                    onDelete={() => void remove(c.id, c.name)}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalDialog
        title={dialog === 'create' ? 'Новый заказчик' : 'Заказчик'}
        open={dialog != null}
        onClose={() => setDialog(null)}
        busy={busy}
        footer={
          <>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !form.name.trim()}
              onClick={() => void save()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setDialog(null)}
            >
              Отмена
            </button>
          </>
        }
      >
        <label className="field">
          <span>Наименование</span>
          <input
            autoFocus
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>
        <label className="field">
          <span>Другие наименования</span>
          <input
            value={form.nameAliases}
            onChange={(e) =>
              setForm((f) => ({ ...f, nameAliases: e.target.value }))
            }
            placeholder="через точку с запятой"
          />
        </label>
        <label className="field">
          <span>Тип</span>
          <Select
            value={form.kindId}
            onChange={(v) => setForm((f) => ({ ...f, kindId: v }))}
            options={CUSTOMER_KIND_OPTIONS}
          />
        </label>
        <div className="form-grid form-grid--2">
          <label className="field">
            <span>ИНН</span>
            <input
              value={form.inn}
              onChange={(e) => setForm((f) => ({ ...f, inn: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>ОГРН</span>
            <input
              value={form.ogrn}
              onChange={(e) => setForm((f) => ({ ...f, ogrn: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Телефон</span>
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </label>
        </div>
        <label className="field">
          <span>Юридический адрес</span>
          <input
            value={form.legalAddress}
            onChange={(e) =>
              setForm((f) => ({ ...f, legalAddress: e.target.value }))
            }
          />
        </label>
        <label className="field">
          <span>Фактический адрес</span>
          <input
            value={form.actualAddress}
            onChange={(e) =>
              setForm((f) => ({ ...f, actualAddress: e.target.value }))
            }
          />
        </label>
      </ModalDialog>
    </section>
  )
}

function FormsPanel({
  snapshot,
  canWrite,
  notify,
  onDone,
}: {
  snapshot: Snapshot
  canWrite: boolean
  notify: Notify
  onDone: () => Promise<void>
}) {
  const ready = useMemo(
    () => snapshot.protocolForms.filter((f) => f.status === 'ready'),
    [snapshot.protocolForms],
  )

  async function setStatus(formId: string, status: string) {
    if (!canWrite) return
    try {
      await apiFetchJson(`/protocol-forms/${formId}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      })
      notify('Статус формы обновлён', 'success')
      await onDone()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    }
  }

  return (
    <section className="section">
      <h2>Виды и формы</h2>
      <p className="muted small">
        Шаблоны протоколов по видам измерений. Готовы к разбору: {ready.length}{' '}
        из {snapshot.protocolForms.length}.
      </p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Форма</th>
              <th>Тип разбора</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.protocolForms.map((f) => (
              <tr key={f.id}>
                <td>{f.title}</td>
                <td>{parserProfileLabel(f.parserProfile)}</td>
                <td>
                  {canWrite ? (
                    <Select
                      value={f.status}
                      onChange={(v) => void setStatus(f.id, v)}
                      options={[
                        { value: 'no_materials', label: 'Нет материалов' },
                        { value: 'in_progress', label: 'В работе' },
                        { value: 'ready', label: 'Готова' },
                      ]}
                    />
                  ) : (
                    (FORM_STATUS_LABELS[f.status] ?? f.status)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
