import { beforeEach, describe, expect, it } from 'vitest'
import { ProtocolStatus } from '@/domain'
import { SeedIds } from '@/data/ids'
import {
  bootstrapServer,
  handleApiRequest,
  SeedCredentials,
  type SecureApi,
} from '@/server'

const BASE = 'http://il.local'

async function login(
  api: SecureApi,
  creds: { email: string; password: string },
): Promise<string> {
  const res = await handleApiRequest(
    api,
    new Request(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(creds),
    }),
  )
  const body = (await res.json()) as { token: string }
  return body.token
}

function authed(
  api: SecureApi,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${token}`)
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  return handleApiRequest(api, new Request(`${BASE}${path}`, { ...init, headers }))
}

describe('Admin ops: registry / audit / settings (ТЗ §11–14)', () => {
  let api: SecureApi
  let headToken: string
  let protocolId: string

  beforeEach(async () => {
    ;({ api } = await bootstrapServer())
    headToken = await login(api, SeedCredentials.head)

    const save = await authed(api, headToken, '/rpc/protocol_save', {
      method: 'POST',
      body: JSON.stringify({
        number: '99-26-УВЧ',
        protocolDate: '2026-09-22',
        formId: SeedIds.formUhf,
        sourcePath: 'protocol-sources/admin.xlsx',
        sourceSha256: 'sha-admin',
      }),
    })
    expect(save.status).toBe(200)
    protocolId = ((await save.json()) as { id: string }).id
  })

  it('реестр: пагинация, счётчики, фильтр по номеру', async () => {
    const res = await authed(
      api,
      headToken,
      '/protocols?number=99-26&page=1&pageSize=10',
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      items: { id: string; number: string; hasScan: boolean }[]
      total: number
      page: number
      pageSize: number
      counters: { review: number; notSent: number }
    }
    expect(body.page).toBe(1)
    expect(body.pageSize).toBe(10)
    expect(body.total).toBeGreaterThanOrEqual(1)
    expect(body.items.some((p) => p.id === protocolId)).toBe(true)
    expect(body.counters.review).toBeGreaterThanOrEqual(1)
    expect(body.counters.notSent).toBeGreaterThanOrEqual(1)
  })

  it('быстрый фильтр no_scan', async () => {
    const res = await authed(api, headToken, '/protocols?quick=no_scan')
    const body = (await res.json()) as { items: { id: string; hasScan: boolean }[] }
    expect(body.items.every((p) => !p.hasScan)).toBe(true)
    expect(body.items.some((p) => p.id === protocolId)).toBe(true)
  })

  it('журнал: события загрузки с label', async () => {
    const res = await authed(api, headToken, `/audit?protocolId=${protocolId}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      items: { label: string; entity: string; action: string }[]
    }
    expect(body.items.length).toBeGreaterThan(0)
    expect(body.items.some((a) => a.label === 'Загрузил')).toBe(true)
  })

  it('настройки: writeSetting пишет before/after в аудит', async () => {
    const put = await authed(api, headToken, '/settings', {
      method: 'PUT',
      body: JSON.stringify({ key: 'lab_address_text', value: 'Тестовый адрес ИЛ' }),
    })
    expect(put.status).toBe(200)

    const audit = await authed(api, headToken, '/audit?entity=settings')
    const body = (await audit.json()) as {
      items: {
        label: string
        diff: { key: string; before: unknown; after: unknown } | null
      }[]
    }
    const hit = body.items.find(
      (a) => a.diff?.key === 'lab_address_text' && a.diff.after === 'Тестовый адрес ИЛ',
    )
    expect(hit).toBeTruthy()
    expect(hit!.label).toBe('Изменил настройку')
    expect(hit!.diff).toHaveProperty('before')
  })

  it('фильтр статуса ready', async () => {
    const res = await authed(
      api,
      headToken,
      `/protocols?status=${ProtocolStatus.ready}`,
    )
    const body = (await res.json()) as {
      items: { status: string }[]
    }
    expect(body.items.every((p) => p.status === ProtocolStatus.ready)).toBe(true)
  })
})
