import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { bootstrapServer, SeedIdsExt } from '@/server/bootstrap'
import { hashPassword } from '@/server/auth/password'
import { handleApiRequest } from '@/server/http/handle-request'
import type { Database } from '@/server/db/database'
import type { SecureApi } from '@/server/rpc/secure-api'
import { DbPersister } from './db-persister'
import type { StateStore } from './state-store'

export type AppServerOptions = {
  store: StateStore
  /** Каталог собранного SPA (dist). null — только API. */
  staticDir?: string | null
  apiPrefix?: string
  /**
   * Учётка начальника ИЛ при первом запуске на пустой базе.
   * Демо-учётки с известными паролями на сервер не попадают.
   */
  initialAdmin?: { email: string; password: string } | null
  /** Разрешить демо-учётки на пустой базе (только локально/тесты). */
  allowDemoAccounts?: boolean
  log?: (msg: string) => void
}

export type AppServer = {
  handle(request: Request): Promise<Response>
  api: SecureApi
  db: Database
  persister: DbPersister
  /** true — база была пустой и заполнена при старте */
  initialized: boolean
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.xsd': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer-when-downgrade',
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

async function applyInitialAccounts(
  db: Database,
  admin: { email: string; password: string },
): Promise<void> {
  const head = db.authAccounts.find((a) => a.id === SeedIdsExt.authHead)
  if (!head) throw new Error('Seed: нет учётки начальника ИЛ')
  head.email = admin.email.trim().toLowerCase()
  head.passwordHash = await hashPassword(admin.password)
  // Демо-инженер с тестовым паролем — удаляем, учётки создаёт начальник ИЛ.
  db.authAccounts = db.authAccounts.filter(
    (a) => a.id !== SeedIdsExt.authEngineer,
  )
  for (const s of db.staff) {
    if (s.authUserId === SeedIdsExt.authEngineer) s.authUserId = null
  }
}

export async function createAppServer(
  options: AppServerOptions,
): Promise<AppServer> {
  const apiPrefix = (options.apiPrefix ?? '/api').replace(/\/+$/, '')
  const log = options.log ?? (() => undefined)
  await options.store.init()

  const { db, api } = await bootstrapServer()
  const persister = new DbPersister(db, options.store)
  const loaded = await persister.load()
  if (!loaded) {
    if (options.initialAdmin) {
      await applyInitialAccounts(db, options.initialAdmin)
      log(`База пустая — создан начальник ИЛ ${options.initialAdmin.email}`)
    } else if (!options.allowDemoAccounts) {
      throw new Error(
        'База пустая: задайте INITIAL_ADMIN_EMAIL и INITIAL_ADMIN_PASSWORD ' +
          'для первой учётной записи начальника ИЛ',
      )
    } else {
      log('База пустая — используются ДЕМО-учётки (только для разработки)')
    }
    await persister.save()
  } else {
    log(
      `Состояние загружено: протоколов ${db.protocols.length}, ` +
        `оборудования ${db.equipment.length}`,
    )
  }

  const staticDir = options.staticDir ? path.resolve(options.staticDir) : null

  async function serveStatic(pathname: string): Promise<Response> {
    if (!staticDir) return json(404, { error: 'NOT_FOUND', message: 'Не найдено' })
    let rel: string
    try {
      rel = decodeURIComponent(pathname)
    } catch {
      return new Response('Bad request', { status: 400 })
    }
    const file = path.resolve(staticDir, '.' + rel)
    const inside =
      file === staticDir || file.startsWith(staticDir + path.sep)
    if (inside) {
      try {
        const st = await stat(file)
        if (st.isFile()) {
          const ext = path.extname(file).toLowerCase()
          const isAsset = rel.startsWith('/assets/')
          return new Response(await readFile(file), {
            status: 200,
            headers: {
              ...SECURITY_HEADERS,
              'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
              'cache-control': isAsset
                ? 'public, max-age=31536000, immutable'
                : ext === '.html'
                  ? 'no-cache'
                  : 'public, max-age=3600',
            },
          })
        }
      } catch {
        /* нет файла → SPA fallback */
      }
    }
    if (rel.startsWith('/assets/')) {
      return new Response('Not found', { status: 404 })
    }
    // SPA: клиентский роутинг
    try {
      return new Response(await readFile(path.join(staticDir, 'index.html')), {
        status: 200,
        headers: {
          ...SECURITY_HEADERS,
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-cache',
        },
      })
    } catch {
      return new Response('index.html не найден', { status: 404 })
    }
  }

  async function handleApi(request: Request, url: URL): Promise<Response> {
    const inner = new URL(url)
    inner.pathname = url.pathname.slice(apiPrefix.length) || '/'
    const method = request.method.toUpperCase()
    const res = await handleApiRequest(
      api,
      new Request(inner, {
        method,
        headers: request.headers,
        body:
          method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer(),
      }),
    )
    if (method !== 'GET' && method !== 'HEAD') {
      try {
        await persister.save()
      } catch (err) {
        log(`Ошибка записи в базу: ${err instanceof Error ? err.message : String(err)}`)
        return json(503, {
          error: 'PERSIST_FAILED',
          message:
            'Изменение не сохранено в базе данных. Повторите действие позже или сообщите администратору.',
        })
      }
    }
    return res
  }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/healthz') {
      return new Response('ok\n', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    }
    if (url.pathname === apiPrefix || url.pathname.startsWith(apiPrefix + '/')) {
      return handleApi(request, url)
    }
    const method = request.method.toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 })
    }
    return serveStatic(url.pathname)
  }

  return { handle, api, db, persister, initialized: !loaded }
}
