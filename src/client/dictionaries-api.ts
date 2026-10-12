import { clearSession, getStoredToken } from '@/client/api'
import { getSharedApi, persistSharedDb } from '@/client/shared-api'
import { handleApiRequest } from '@/server'

const BASE = 'http://il.local'

async function apiFetchRaw(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const api = await getSharedApi()
  const headers = new Headers(init.headers)
  const token = getStoredToken()
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  const res = await handleApiRequest(
    api,
    new Request(`${BASE}${path}`, { ...init, headers }),
  )
  if (res.status === 401) clearSession()
  if (res.ok) persistSharedDb()
  return res
}

export async function apiFetchJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await apiFetchRaw(path, init)
  const body = (await res.json()) as T & { message?: string; error?: string }
  if (!res.ok) {
    throw new Error(body.message ?? body.error ?? 'Ошибка запроса')
  }
  return body
}

export async function apiFetchBlob(path: string): Promise<Blob> {
  const res = await apiFetchRaw(path)
  if (!res.ok) {
    let message = 'Ошибка загрузки файла'
    try {
      const body = (await res.json()) as { message?: string; error?: string }
      message = body.message ?? body.error ?? message
    } catch {
      /* binary error body */
    }
    throw new Error(message)
  }
  return res.blob()
}
