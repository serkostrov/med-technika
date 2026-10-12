import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/client/auth-context'
import { fetchSettings, writeSetting } from '@/client/api'
import { apiFetchJson } from '@/client/dictionaries-api'
import { useToast } from '@/shared/ui/toast'
import { ErrorState, LoadingState } from '@/shared/ui/states'
import { checkCodeLabel } from '@/shared/ui/labels'
import { Select } from '@/shared/ui/Select'
import {
  IconButton,
  IconKey,
  IconPencil,
  IconTrash,
} from '@/shared/ui/icons'

type StaffRow = {
  id: string
  fullName: string
  shortName: string
  surname: string
  appRole: string
  fgisIdFullName: number | null
  postName: string | null
  isActive: boolean
  authUserId: string | null
}

type UserAccount = {
  id: string
  email: string
  staffId: string
}

type CheckCode =
  | 'E01'
  | 'E02'
  | 'E03'
  | 'E04'
  | 'E05'
  | 'E06'
  | 'E07'
  | 'E08'
  | 'E09'
  | 'E10'
  | 'E11'
  | 'E12'
  | 'E13'
  | 'E14'
  | 'E15'
  | 'W01'
  | 'W02'
  | 'W03'
  | 'W05'
  | 'W06'
  | 'W07'

type TabId = 'general' | 'checks' | 'users'

type StaffForm = {
  fullName: string
  surname: string
  fgisIdFullName: string
  postName: string
  appRole: string
  isActive: boolean
  email: string
  password: string
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'Основные' },
  { id: 'checks', label: 'Уровни проверок' },
  { id: 'users', label: 'Пользователи' },
]

const CHECK_CODES: CheckCode[] = [
  'E01',
  'E02',
  'E03',
  'E04',
  'E05',
  'E06',
  'E07',
  'E08',
  'E09',
  'E10',
  'E11',
  'E12',
  'E13',
  'E14',
  'E15',
  'W01',
  'W02',
  'W03',
  'W05',
  'W06',
  'W07',
]

const emptyStaffForm = (): StaffForm => ({
  fullName: '',
  surname: '',
  fgisIdFullName: '',
  postName: '',
  appRole: 'engineer',
  isActive: true,
  email: '',
  password: '',
})

export function UsersSettingsPage() {
  const { capabilities } = useAuth()
  const { notify } = useToast()
  const [tab, setTab] = useState<TabId>('general')
  const [staff, setStaff] = useState<StaffRow[] | null>(null)
  const [accounts, setAccounts] = useState<UserAccount[]>([])
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [labAddressId, setLabAddressId] = useState('')
  const [labAddressText, setLabAddressText] = useState('')
  const [approverStaffId, setApproverStaffId] = useState('')
  const [recalcTolerance, setRecalcTolerance] = useState('1e-6')
  const [severityOverrides, setSeverityOverrides] = useState<
    Partial<Record<CheckCode, 'error' | 'warning'>>
  >({})

  const [staffDialog, setStaffDialog] = useState<null | 'create' | StaffRow>(
    null,
  )
  const [staffForm, setStaffForm] = useState<StaffForm>(emptyStaffForm)

  const [passwordTarget, setPasswordTarget] = useState<StaffRow | null>(null)
  const [passwordEmail, setPasswordEmail] = useState('')
  const [passwordValue, setPasswordValue] = useState('')

  const reload = useCallback(async () => {
    setError(null)
    try {
      const [dict, settingsList, users] = await Promise.all([
        apiFetchJson<{ staff: StaffRow[] }>('/dictionaries'),
        fetchSettings(),
        apiFetchJson<UserAccount[]>('/users'),
      ])
      setStaff(dict.staff)
      setAccounts(users)
      const map: Record<string, unknown> = {}
      for (const s of settingsList) map[s.key] = s.value
      setSettings(map)

      setLabAddressId(String(map.lab_address_id ?? ''))
      setLabAddressText(String(map.lab_address_text ?? ''))
      setApproverStaffId(String(map.approver_staff_id ?? ''))
      setRecalcTolerance(String(map.recalc_tolerance ?? '1e-6'))
      setSeverityOverrides(
        (map.severity_overrides as Partial<
          Record<CheckCode, 'error' | 'warning'>
        >) ?? {},
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const dialogOpen = staffDialog != null || passwordTarget != null

  useEffect(() => {
    if (!dialogOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || busy) return
      setStaffDialog(null)
      closePasswordDialog()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialogOpen, busy])

  if (!capabilities?.canManageUsers) {
    return <Navigate to="/" replace />
  }
  if (error) {
    return <ErrorState message={error} onRetry={() => void reload()} />
  }
  if (!staff || !settings) {
    return <LoadingState label="Загрузка настроек…" />
  }

  async function saveGeneral() {
    setBusy(true)
    try {
      await Promise.all([
        writeSetting('lab_address_id', Number(labAddressId) || labAddressId),
        writeSetting('lab_address_text', labAddressText),
        writeSetting('approver_staff_id', approverStaffId),
        writeSetting('recalc_tolerance', Number(recalcTolerance)),
      ])
      notify('Основные настройки сохранены', 'success')
      await reload()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка сохранения', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function saveChecks() {
    setBusy(true)
    try {
      await writeSetting('severity_overrides', severityOverrides)
      notify('Уровни проверок сохранены', 'success')
      await reload()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка сохранения', 'error')
    } finally {
      setBusy(false)
    }
  }

  function closePasswordDialog() {
    setPasswordTarget(null)
    setPasswordEmail('')
    setPasswordValue('')
  }

  function openCreateStaff() {
    setStaffForm(emptyStaffForm())
    setStaffDialog('create')
  }

  function openEdit(s: StaffRow) {
    const acc = accounts.find((a) => a.staffId === s.id)
    setStaffForm({
      fullName: s.fullName,
      surname: s.surname,
      fgisIdFullName: s.fgisIdFullName != null ? String(s.fgisIdFullName) : '',
      postName: s.postName ?? '',
      appRole: s.appRole,
      isActive: s.isActive,
      email: acc?.email ?? '',
      password: '',
    })
    setStaffDialog(s)
  }

  function openPassword(s: StaffRow) {
    const acc = accounts.find((a) => a.staffId === s.id)
    setPasswordEmail(acc?.email ?? '')
    setPasswordValue('')
    setPasswordTarget(s)
  }

  async function saveStaff() {
    if (!staffDialog) return
    setBusy(true)
    try {
      const body = {
        fullName: staffForm.fullName,
        surname: staffForm.surname || undefined,
        fgisIdFullName: staffForm.fgisIdFullName
          ? Number(staffForm.fgisIdFullName)
          : null,
        postName: staffForm.postName || null,
        appRole: staffForm.appRole,
        isActive: staffForm.isActive,
      }
      if (staffDialog === 'create') {
        const created = await apiFetchJson<{ id: string }>('/staff', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        if (staffForm.email.trim() && staffForm.password) {
          await apiFetchJson('/users', {
            method: 'POST',
            body: JSON.stringify({
              email: staffForm.email.trim(),
              password: staffForm.password,
              staffId: created.id,
            }),
          })
          notify('Сотрудник и учётка созданы', 'success')
        } else {
          notify('Сотрудник добавлен', 'success')
        }
      } else {
        await apiFetchJson(`/staff/${staffDialog.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        if (
          !staffDialog.authUserId &&
          staffForm.email.trim() &&
          staffForm.password
        ) {
          await apiFetchJson('/users', {
            method: 'POST',
            body: JSON.stringify({
              email: staffForm.email.trim(),
              password: staffForm.password,
              staffId: staffDialog.id,
            }),
          })
          notify('Сотрудник обновлён, учётка создана', 'success')
        } else if (staffDialog.authUserId && staffForm.password) {
          await apiFetchJson('/users/password', {
            method: 'PUT',
            body: JSON.stringify({
              staffId: staffDialog.id,
              password: staffForm.password,
            }),
          })
          notify('Сотрудник и пароль обновлены', 'success')
        } else {
          notify('Сотрудник обновлён', 'success')
        }
      }
      setStaffDialog(null)
      await reload()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function removeStaff(s: StaffRow) {
    if (!confirm(`Удалить сотрудника «${s.fullName}»?`)) return
    setBusy(true)
    try {
      await apiFetchJson(`/staff/${s.id}`, { method: 'DELETE' })
      notify('Сотрудник удалён', 'success')
      await reload()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function submitPassword() {
    if (!passwordTarget) return
    setBusy(true)
    try {
      if (passwordTarget.authUserId) {
        await apiFetchJson('/users/password', {
          method: 'PUT',
          body: JSON.stringify({
            staffId: passwordTarget.id,
            password: passwordValue,
          }),
        })
        notify('Пароль обновлён', 'success')
      } else {
        await apiFetchJson('/users', {
          method: 'POST',
          body: JSON.stringify({
            email: passwordEmail,
            password: passwordValue,
            staffId: passwordTarget.id,
          }),
        })
        notify('Учётка создана', 'success')
      }
      closePasswordDialog()
      await reload()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error')
    } finally {
      setBusy(false)
    }
  }

  const emailByStaff = new Map(accounts.map((a) => [a.staffId, a.email]))

  return (
    <div className="page page--wide">
      <h1>Настройки</h1>
      <p className="muted">Лаборатория, строгости проверок и учётные записи.</p>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'tabs__btn tabs__btn--active' : 'tabs__btn'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <section className="card-panel" role="tabpanel">
          <h2>Основные настройки</h2>
          <p className="muted small">
            Адрес лаборатории, руководитель для выгрузки и допуск пересчёта.
          </p>
          <div className="form-grid form-grid--3">
            <label className="field">
              <span>Адрес ИЛ</span>
              <input
                value={labAddressText}
                onChange={(e) => setLabAddressText(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Код адреса во ФГИС</span>
              <input
                value={labAddressId}
                onChange={(e) => setLabAddressId(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Руководитель для выгрузки</span>
              <Select
                value={approverStaffId}
                onChange={setApproverStaffId}
                options={staff.map((s) => ({
                  value: s.id,
                  label: s.shortName || s.fullName,
                }))}
              />
            </label>
            <label className="field">
              <span>Допуск пересчёта</span>
              <input
                value={recalcTolerance}
                onChange={(e) => setRecalcTolerance(e.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => void saveGeneral()}
            >
              Сохранить
            </button>
          </div>
        </section>
      )}

      {tab === 'checks' && (
        <section className="card-panel" role="tabpanel">
          <h2>Уровни строгости проверок</h2>
          <p className="muted small">
            Что считать ошибкой, а что — замечанием при проверке протокола.
          </p>
          <div className="severity-grid">
            {CHECK_CODES.map((code) => (
              <label key={code} className="field">
                <span title={checkCodeLabel(code)}>{checkCodeLabel(code)}</span>
                <Select
                  value={severityOverrides[code] ?? ''}
                  onChange={(v) => {
                    const nextVal = v as '' | 'error' | 'warning'
                    setSeverityOverrides((prev) => {
                      const next = { ...prev }
                      if (!nextVal) delete next[code]
                      else next[code] = nextVal
                      return next
                    })
                  }}
                  options={[
                    { value: '', label: 'по умолчанию' },
                    { value: 'error', label: 'ошибка' },
                    { value: 'warning', label: 'замечание' },
                  ]}
                />
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => void saveChecks()}
            >
              Сохранить
            </button>
          </div>
        </section>
      )}

      {tab === 'users' && (
        <div className="settings-users" role="tabpanel">
          <section className="card-panel">
            <div className="section-head">
              <h2>Персонал</h2>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={openCreateStaff}
              >
                Создать
              </button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="cell-start">ФИО</th>
                    <th>Роль</th>
                    <th>Код ФИО во ФГИС</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.id}>
                      <td className="cell-start">
                        {s.fullName}
                        {emailByStaff.get(s.id) ? (
                          <div className="muted small">{emailByStaff.get(s.id)}</div>
                        ) : null}
                      </td>
                      <td>
                        {s.appRole === 'head' ? 'Начальник ИЛ' : 'Инженер'}
                      </td>
                      <td>{s.fgisIdFullName ?? '—'}</td>
                      <td className="row-actions">
                        <span className="row-actions__group">
                          <IconButton
                            label="Изменить"
                            disabled={busy}
                            onClick={() => openEdit(s)}
                          >
                            <IconPencil />
                          </IconButton>
                          <IconButton
                            label={
                              s.authUserId ? 'Задать пароль' : 'Создать учётку'
                            }
                            disabled={busy}
                            onClick={() => openPassword(s)}
                          >
                            <IconKey />
                          </IconButton>
                          <IconButton
                            label="Удалить"
                            disabled={busy}
                            danger
                            onClick={() => void removeStaff(s)}
                          >
                            <IconTrash />
                          </IconButton>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {staffDialog != null && (
            <div
              className="modal-backdrop"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget && !busy) setStaffDialog(null)
              }}
            >
              <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="staff-dialog-title"
              >
                <h2 id="staff-dialog-title">
                  {staffDialog === 'create' ? 'Новый сотрудник' : 'Сотрудник'}
                </h2>
                <div className="form-stack">
                  <label className="field">
                    <span>ФИО</span>
                    <input
                      autoFocus
                      value={staffForm.fullName}
                      onChange={(e) =>
                        setStaffForm((f) => ({ ...f, fullName: e.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Фамилия</span>
                    <input
                      value={staffForm.surname}
                      onChange={(e) =>
                        setStaffForm((f) => ({ ...f, surname: e.target.value }))
                      }
                      placeholder="из ФИО, если пусто"
                    />
                  </label>
                  <label className="field">
                    <span>Код ФИО во ФГИС</span>
                    <input
                      value={staffForm.fgisIdFullName}
                      onChange={(e) =>
                        setStaffForm((f) => ({
                          ...f,
                          fgisIdFullName: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Должность</span>
                    <input
                      value={staffForm.postName}
                      onChange={(e) =>
                        setStaffForm((f) => ({
                          ...f,
                          postName: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Роль в системе</span>
                    <Select
                      value={staffForm.appRole}
                      onChange={(v) =>
                        setStaffForm((f) => ({ ...f, appRole: v }))
                      }
                      options={[
                        { value: 'engineer', label: 'Инженер' },
                        { value: 'head', label: 'Начальник ИЛ' },
                      ]}
                    />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={staffForm.email}
                      disabled={
                        staffDialog !== 'create' &&
                        Boolean(staffDialog.authUserId)
                      }
                      onChange={(e) =>
                        setStaffForm((f) => ({ ...f, email: e.target.value }))
                      }
                      placeholder="для входа в систему"
                    />
                  </label>
                  <label className="field">
                    <span>
                      {staffDialog !== 'create' && staffDialog.authUserId
                        ? 'Новый пароль'
                        : 'Пароль'}
                    </span>
                    <input
                      type="password"
                      value={staffForm.password}
                      onChange={(e) =>
                        setStaffForm((f) => ({
                          ...f,
                          password: e.target.value,
                        }))
                      }
                      placeholder={
                        staffDialog !== 'create' && staffDialog.authUserId
                          ? 'оставьте пустым, чтобы не менять'
                          : 'для входа в систему'
                      }
                    />
                  </label>
                  <label className="field field--check">
                    <input
                      type="checkbox"
                      checked={staffForm.isActive}
                      onChange={(e) =>
                        setStaffForm((f) => ({
                          ...f,
                          isActive: e.target.checked,
                        }))
                      }
                    />
                    <span>Активен</span>
                  </label>
                </div>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy || !staffForm.fullName.trim()}
                    onClick={() => void saveStaff()}
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => setStaffDialog(null)}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          )}

          {passwordTarget && (
            <div
              className="modal-backdrop"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget && !busy) closePasswordDialog()
              }}
            >
              <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="password-title"
              >
                <h2 id="password-title">
                  {passwordTarget.authUserId
                    ? 'Задать пароль'
                    : 'Создать учётку'}
                </h2>
                <p className="muted small">
                  {passwordTarget.fullName}
                  {passwordTarget.authUserId
                    ? ' — новый пароль для входа.'
                    : ' — email и пароль для входа.'}
                </p>
                <div className="form-stack">
                  {!passwordTarget.authUserId ? (
                    <label className="field">
                      <span>Email</span>
                      <input
                        autoFocus
                        value={passwordEmail}
                        onChange={(e) => setPasswordEmail(e.target.value)}
                      />
                    </label>
                  ) : (
                    <label className="field">
                      <span>Email</span>
                      <input value={passwordEmail} readOnly />
                    </label>
                  )}
                  <label className="field">
                    <span>Пароль</span>
                    <input
                      type="password"
                      autoFocus={Boolean(passwordTarget.authUserId)}
                      value={passwordValue}
                      onChange={(e) => setPasswordValue(e.target.value)}
                    />
                  </label>
                </div>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={
                      busy ||
                      !passwordValue ||
                      (!passwordTarget.authUserId && !passwordEmail)
                    }
                    onClick={() => void submitPassword()}
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={closePasswordDialog}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
