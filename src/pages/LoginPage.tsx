import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useToast } from '@/shared/ui/toast'
import { useAuth } from '@/client/auth-context'
import { SeedCredentials } from '@/server'

export function LoginPage() {
  const navigate = useNavigate()
  const { notify } = useToast()
  const { session, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) {
      notify('Укажите email и пароль', 'error')
      return
    }
    setBusy(true)
    try {
      await login(email.trim(), password)
      notify('Вход выполнен', 'success')
      navigate('/', { replace: true })
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка входа', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <div>
          <h1>Медтехника ИЛ</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Учёт протоколов измерений и выгрузка во ФГИС
          </p>
        </div>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Пароль
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Вход…' : 'Войти'}
        </button>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Учётные записи создаёт начальник ИЛ.
          <br />
          Демо: {SeedCredentials.head.email} / {SeedCredentials.engineer.email}
        </p>
      </form>
    </div>
  )
}
