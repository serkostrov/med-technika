import {
  handleApiRequest,
  type SecureApi,
} from '@/server'
import { getSharedApi, persistSharedDb } from '@/client/shared-api'

const BASE = 'http://il.local'
const TOKEN_KEY = 'mt.access_token'

async function getApi(): Promise<SecureApi> {
  return getSharedApi()
}

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function clearSession(): void {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem('mt.session')
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const api = await getApi()
  const headers = new Headers(init.headers)
  const token = getStoredToken()
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  const res = await handleApiRequest(api, new Request(`${BASE}${path}`, { ...init, headers }))
  if (res.status !== 401) persistSharedDb()
  return res
}

export async function loginRequest(
  email: string,
  password: string,
): Promise<{ token: string; role: string; staffId: string; email: string }> {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  const body = (await res.json()) as {
    token?: string
    account?: { role: string; staffId: string; email: string }
    message?: string
  }
  if (!res.ok || !body.token || !body.account) {
    throw new Error(body.message ?? 'Ошибка входа')
  }
  sessionStorage.setItem(TOKEN_KEY, body.token)
  sessionStorage.setItem(
    'mt.session',
    JSON.stringify({
      email: body.account.email,
      role: body.account.role,
      staffId: body.account.staffId,
    }),
  )
  persistSharedDb()
  return {
    token: body.token,
    role: body.account.role,
    staffId: body.account.staffId,
    email: body.account.email,
  }
}

export async function fetchProtocols(query: Record<string, string | number | undefined> = {}) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === '') continue
    params.set(k, String(v))
  }
  const qs = params.toString()
  const res = await apiFetch(`/protocols${qs ? `?${qs}` : ''}`)
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(body.message ?? 'Не удалось загрузить протоколы')
  }
  return res.json() as Promise<import('@/server/protocol/list-query').ProtocolListResult>
}

export async function fetchAudit(query: Record<string, string | number | undefined> = {}) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === '') continue
    params.set(k, String(v))
  }
  const qs = params.toString()
  const res = await apiFetch(`/audit${qs ? `?${qs}` : ''}`)
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(body.message ?? 'Не удалось загрузить журнал')
  }
  return res.json() as Promise<import('@/server/protocol/audit-query').AuditListResult>
}

export async function fetchSettings() {
  const res = await apiFetch('/settings')
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(body.message ?? 'Не удалось загрузить настройки')
  }
  return res.json() as Promise<{ key: string; value: unknown }[]>
}

export async function writeSetting(key: string, value: unknown) {
  const res = await apiFetch('/settings', {
    method: 'PUT',
    body: JSON.stringify({ key, value }),
  })
  if (!res.ok) {
    const body = (await res.json()) as { message?: string }
    throw new Error(body.message ?? 'Не удалось сохранить настройку')
  }
  return res.json() as Promise<{ key: string; value: unknown }>
}

export async function fetchMe() {
  const res = await apiFetch('/auth/me')
  if (!res.ok) return null
  return res.json() as Promise<{ staffId: string; role: string; email: string }>
}
