import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SeedCredentials, SeedIdsExt } from '@/server/bootstrap'
import { exportDatabaseSnapshot } from '@/server/db/backup'
import { createAppServer, type AppServer } from './app'
import { createPgliteDatabase } from './pglite-database'
import { PgStateStore, type SqlDatabase, type StateChange } from './state-store'

const ADMIN = { email: 'Boss@Lab.ru', password: 'strong-pass-123' }

let sqls: SqlDatabase[] = []

async function freshSql(): Promise<SqlDatabase> {
  const sql = await createPgliteDatabase()
  sqls.push(sql)
  return sql
}

afterEach(async () => {
  for (const s of sqls) await s.end().catch(() => undefined)
  sqls = []
})

async function call(
  app: AppServer,
  method: string,
  url: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: Record<string, unknown> & unknown[] }> {
  const headers = new Headers()
  if (opts.token) headers.set('authorization', `Bearer ${opts.token}`)
  if (opts.body !== undefined) headers.set('content-type', 'application/json')
  const res = await app.handle(
    new Request(`http://il.test${url}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    }),
  )
  const text = await res.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    /* text */
  }
  return { status: res.status, body: body as never }
}

async function login(app: AppServer, email: string, password: string) {
  const r = await call(app, 'POST', '/api/auth/login', {
    body: { email, password },
  })
  expect(r.status).toBe(200)
  return String(r.body.token)
}

describe('Node-сервер + Postgres (PGlite)', { timeout: 120_000 }, () => {
  it('пустая база без INITIAL_ADMIN_* — отказ старта', async () => {
    const sql = await freshSql()
    await expect(
      createAppServer({ store: new PgStateStore(sql) }),
    ).rejects.toThrow(/INITIAL_ADMIN/)
  })

  it('первый запуск: начальник ИЛ из env, демо-учёток нет', async () => {
    const sql = await freshSql()
    const app = await createAppServer({
      store: new PgStateStore(sql),
      initialAdmin: ADMIN,
    })
    expect(app.initialized).toBe(true)

    const demoHead = await call(app, 'POST', '/api/auth/login', {
      body: SeedCredentials.head,
    })
    expect(demoHead.status).toBe(401)
    const demoEng = await call(app, 'POST', '/api/auth/login', {
      body: SeedCredentials.engineer,
    })
    expect(demoEng.status).toBe(401)

    const token = await login(app, 'boss@lab.ru', ADMIN.password)
    const me = await call(app, 'GET', '/api/auth/me', { token })
    expect(me.body.role).toBe('head')
  })

  it('данные и сессии переживают перезапуск сервера', async () => {
    const sql = await freshSql()
    const app1 = await createAppServer({
      store: new PgStateStore(sql),
      initialAdmin: ADMIN,
    })
    const token = await login(app1, ADMIN.email, ADMIN.password)
    const created = await call(app1, 'POST', '/api/equipment', {
      token,
      body: { name: 'Метеоскоп-М', kind: 'si', serialNo: '73213' },
    })
    expect(created.status).toBe(200)

    // «Перезапуск»: новый процесс на той же базе
    const app2 = await createAppServer({
      store: new PgStateStore(sql),
      initialAdmin: { email: 'other@lab.ru', password: 'x' },
    })
    expect(app2.initialized).toBe(false)
    const dict = await call(app2, 'GET', '/api/dictionaries', { token })
    expect(dict.status).toBe(200)
    const eq = (dict.body.equipment as Array<{ name: string; serialNo: string }>)
    expect(eq.map((e) => e.name)).toContain('Метеоскоп-М')
    // INITIAL_ADMIN_* на непустой базе игнорируется
    const other = await call(app2, 'POST', '/api/auth/login', {
      body: { email: 'other@lab.ru', password: 'x' },
    })
    expect(other.status).toBe(401)
  })

  it('файлы пишутся инкрементально и удаляются', async () => {
    const sql = await freshSql()
    const saves: StateChange[] = []
    const store = new PgStateStore(sql)
    const origSave = store.save.bind(store)
    store.save = async (c) => {
      saves.push(c)
      return origSave(c)
    }
    const app = await createAppServer({ store, initialAdmin: ADMIN })
    saves.length = 0

    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 255, 7]).buffer
    app.db.protocolScans.set('protocol-scans/p1/a.pdf', {
      path: 'protocol-scans/p1/a.pdf',
      fileName: 'a.pdf',
      bytes,
      uploadedAt: '2026-11-01T00:00:00.000Z',
      uploadedBy: SeedIdsExt.staffSadakov,
    })
    await app.persister.save()
    expect(saves).toHaveLength(1)
    expect(saves[0]!.upsertBlobs.map((b) => b.path)).toEqual([
      'protocol-scans/p1/a.pdf',
    ])

    // Без изменений — запись не идёт
    await app.persister.save()
    expect(saves).toHaveLength(1)

    // Новая таблица-запись: файл повторно не отправляется
    app.db.settings.push({ key: 'x_test', value: 1 } as never)
    await app.persister.save()
    expect(saves).toHaveLength(2)
    expect(saves[1]!.upsertBlobs).toHaveLength(0)
    expect(saves[1]!.tablesJson).not.toBeNull()

    const reloaded = await createAppServer({ store: new PgStateStore(sql) })
    const scan = reloaded.db.protocolScans.get('protocol-scans/p1/a.pdf')
    expect(scan).toBeTruthy()
    expect([...new Uint8Array(scan!.bytes)]).toEqual([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0, 255, 7,
    ])

    app.db.protocolScans.delete('protocol-scans/p1/a.pdf')
    await app.persister.save()
    expect(saves[2]!.deleteBlobs).toEqual([
      { kind: 'protocol_scan', path: 'protocol-scans/p1/a.pdf' },
    ])
    const rows = await sql.query<{ n: number }>(
      'select count(*)::int as n from medtech.app_blobs',
    )
    expect(rows.rows[0]!.n).toBe(0)
  })

  it('восстановление бэкапа из браузера через API, сессия админа сохраняется', async () => {
    const sql = await freshSql()
    const app = await createAppServer({
      store: new PgStateStore(sql),
      initialAdmin: ADMIN,
    })
    const token = await login(app, ADMIN.email, ADMIN.password)

    // Бэкап «из браузера»: демо-учётки + оборудование + файл
    const browser = await createAppServer({
      store: new PgStateStore(await freshSql()),
      allowDemoAccounts: true,
    })
    const bt = await login(browser, SeedCredentials.head.email, SeedCredentials.head.password)
    await call(browser, 'POST', '/api/equipment', {
      token: bt,
      body: { name: 'APPA 80', kind: 'si', serialNo: '75350271' },
    })
    browser.db.protocolSources.set('protocol-sources/x/a.xlsx', {
      path: 'protocol-sources/x/a.xlsx',
      sha256: 'abc',
      fileName: 'a.xlsx',
      bytes: new Uint8Array([1, 2, 3]).buffer,
      uploadedAt: '2026-11-01T00:00:00.000Z',
    })
    const snap = exportDatabaseSnapshot(browser.db)

    // Инженер восстановить не может
    const forbiddenEng = await call(browser, 'GET', '/api/admin/snapshot', {
      token: await login(
        browser,
        SeedCredentials.engineer.email,
        SeedCredentials.engineer.password,
      ),
    })
    expect(forbiddenEng.status).toBe(403)

    const restored = await call(app, 'POST', '/api/admin/snapshot', {
      token,
      body: snap,
    })
    expect(restored.status).toBe(200)

    // Текущий админ остался в системе (его учётка — та же seed-учётка head)
    const me = await call(app, 'GET', '/api/auth/me', { token })
    expect(me.status).toBe(200)

    const after = await createAppServer({ store: new PgStateStore(sql) })
    expect(after.db.equipment.map((e) => e.name)).toContain('APPA 80')
    expect(after.db.protocolSources.get('protocol-sources/x/a.xlsx')?.fileName).toBe(
      'a.xlsx',
    )
    // В бэкапе — пароли из браузера
    const demo = await call(after, 'POST', '/api/auth/login', {
      body: SeedCredentials.head,
    })
    expect(demo.status).toBe(200)

    const exported = await call(after, 'GET', '/api/admin/snapshot', { token })
    expect(exported.status).toBe(200)
    expect(
      (exported.body.blobs as { protocolSources: unknown[] }).protocolSources,
    ).toHaveLength(1)
  })

  it('раздаёт SPA и healthz, не выпускает за пределы каталога', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mt-static-'))
    writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>MT</title>')
    mkdirSync(path.join(dir, 'assets'))
    writeFileSync(path.join(dir, 'assets', 'app.js'), 'console.log(1)')
    const app = await createAppServer({
      store: new PgStateStore(await freshSql()),
      initialAdmin: ADMIN,
      staticDir: dir,
    })
    const health = await app.handle(new Request('http://x/healthz'))
    expect(await health.text()).toBe('ok\n')

    const js = await app.handle(new Request('http://x/assets/app.js'))
    expect(js.headers.get('content-type')).toContain('javascript')
    expect(js.headers.get('cache-control')).toContain('immutable')

    const route = await app.handle(new Request('http://x/registry/123'))
    expect(await route.text()).toContain('<title>MT</title>')

    const missingAsset = await app.handle(new Request('http://x/assets/nope.js'))
    expect(missingAsset.status).toBe(404)

    const traversal = await app.handle(
      new Request('http://x/%2e%2e/%2e%2e/etc/passwd'),
    )
    expect(await traversal.text()).not.toContain('root:')

    const api404 = await call(app, 'GET', '/api/nope')
    expect(api404.status).toBe(401)
  })

  it('ошибка записи в базу → 503, следующее сохранение повторяет', async () => {
    const sql = await freshSql()
    const store = new PgStateStore(sql)
    const app = await createAppServer({ store, initialAdmin: ADMIN })
    const token = await login(app, ADMIN.email, ADMIN.password)
    const orig = store.save.bind(store)
    store.save = async () => {
      throw new Error('connection lost')
    }
    const r = await call(app, 'POST', '/api/equipment', {
      token,
      body: { name: 'Секундомер', kind: 'si', serialNo: '3069' },
    })
    expect(r.status).toBe(503)
    store.save = orig
    await app.persister.save()
    const after = await createAppServer({ store: new PgStateStore(sql) })
    expect(after.db.equipment.map((e) => e.name)).toContain('Секундомер')
  })
})
