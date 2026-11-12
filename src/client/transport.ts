import { handleApiRequest } from '@/server/http/handle-request'
import {
  flushPersistSharedDb,
  getSharedApi,
  persistSharedDb,
} from '@/client/shared-api'

/**
 * Куда ходит клиент:
 *  - VITE_API_BASE задан (например `/api`) → настоящий сервер (Node + Postgres Supabase);
 *  - не задан → portable-режим: SecureApi в вкладке, снимок в IndexedDB.
 */
const API_BASE = String(import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

export const isRemoteApi = API_BASE !== ''

const LOCAL_BASE = 'http://il.local'

function withAuth(init: RequestInit, token: string | null): RequestInit {
  const headers = new Headers(init.headers)
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  return { ...init, headers }
}

/** Один запрос к API (без разбора ответа). */
export async function sendApiRequest(
  path: string,
  init: RequestInit,
  token: string | null,
): Promise<Response> {
  const req = withAuth(init, token)
  if (isRemoteApi) {
    try {
      return await fetch(`${API_BASE}${path}`, req)
    } catch {
      return new Response(
        JSON.stringify({
          error: 'NETWORK',
          message: 'Сервер недоступен. Проверьте подключение к сети.',
        }),
        { status: 503, headers: { 'content-type': 'application/json' } },
      )
    }
  }

  const api = await getSharedApi()
  const res = await handleApiRequest(api, new Request(`${LOCAL_BASE}${path}`, req))
  if (res.status !== 401) {
    const method = (init.method ?? 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') {
      try {
        await flushPersistSharedDb()
      } catch {
        /* onPersistFailure → toast; мутация в памяти уже применена */
      }
    } else {
      persistSharedDb()
    }
  }
  return res
}
