import { clearSession, getStoredToken } from '@/client/api'
import { sendApiRequest } from '@/client/transport'

async function apiFetchRaw(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const res = await sendApiRequest(path, init, getStoredToken())
  if (res.status === 401) clearSession()
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
