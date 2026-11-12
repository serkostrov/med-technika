/**
 * Node-сервис: SPA + API (/api) + хранение в Postgres (Supabase).
 *
 * Env:
 *   DATABASE_URL            postgres://postgres:<пароль>@<хост>:5432/postgres  (обязательно)
 *   DATABASE_SSL            true — TLS до Postgres (внешний хост)
 *   PORT                    порт HTTP (по умолчанию 80)
 *   STATIC_DIR              каталог SPA (по умолчанию ./dist)
 *   INITIAL_ADMIN_EMAIL     первая учётка начальника ИЛ (только для пустой базы)
 *   INITIAL_ADMIN_PASSWORD
 *   MAX_BODY_MB             лимит тела запроса (по умолчанию 300 — восстановление бэкапа)
 *   PGLITE_DIR              локальная разработка без Postgres (нужен dev-пакет PGlite)
 *   ALLOW_DEMO_ACCOUNTS     true — демо-учётки на пустой базе (только локально)
 */
import http from 'node:http'
import { Readable } from 'node:stream'
import { createAppServer } from './app'
import { createPgDatabase } from './pg-database'
import { PgStateStore, type SqlDatabase } from './state-store'

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

async function openSql(): Promise<SqlDatabase> {
  const url = process.env.DATABASE_URL
  if (url) {
    return createPgDatabase(url, process.env.DATABASE_SSL === 'true')
  }
  const pgliteDir = process.env.PGLITE_DIR
  if (pgliteDir) {
    const { createPgliteDatabase } = await import('./pglite-database')
    log(`PGlite: ${pgliteDir} (только для разработки)`)
    return createPgliteDatabase(pgliteDir)
  }
  throw new Error('Не задан DATABASE_URL (строка подключения к Postgres Supabase)')
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 80)
  const maxBody = Number(process.env.MAX_BODY_MB ?? 300) * 1024 * 1024
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL?.trim()
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD

  const sql = await openSql()
  const store = new PgStateStore(sql)
  const app = await createAppServer({
    store,
    staticDir: process.env.STATIC_DIR ?? 'dist',
    initialAdmin:
      adminEmail && adminPassword
        ? { email: adminEmail, password: adminPassword }
        : null,
    allowDemoAccounts: process.env.ALLOW_DEMO_ACCOUNTS === 'true',
    log,
  })

  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        const chunks: Buffer[] = []
        let size = 0
        for await (const chunk of req) {
          size += (chunk as Buffer).length
          if (size > maxBody) {
            res.writeHead(413, { 'content-type': 'application/json; charset=utf-8' })
            res.end(
              JSON.stringify({ error: 'TOO_LARGE', message: 'Слишком большой запрос' }),
            )
            req.destroy()
            return
          }
          chunks.push(chunk as Buffer)
        }
        const headers = new Headers()
        for (const [k, v] of Object.entries(req.headers)) {
          if (v === undefined) continue
          headers.set(k, Array.isArray(v) ? v.join(', ') : v)
        }
        const host = req.headers.host ?? 'localhost'
        const method = req.method ?? 'GET'
        const request = new Request(`http://${host}${req.url ?? '/'}`, {
          method,
          headers,
          body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks),
        })
        const response = await app.handle(request)
        const outHeaders: Record<string, string> = {}
        response.headers.forEach((value, k) => {
          outHeaders[k] = value
        })
        res.writeHead(response.status, outHeaders)
        if (method === 'HEAD' || !response.body) {
          res.end()
          return
        }
        Readable.fromWeb(response.body as never).pipe(res)
      } catch (err) {
        log(`Ошибка запроса: ${err instanceof Error ? err.stack : String(err)}`)
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        }
        res.end(JSON.stringify({ error: 'INTERNAL', message: 'Внутренняя ошибка сервера' }))
      }
    })()
  })

  server.listen(port, () => log(`med-technika слушает :${port}`))

  const shutdown = (signal: string) => {
    log(`${signal}: сохраняю состояние и выхожу`)
    server.close()
    void app.persister
      .save()
      .catch((err) => log(`Не удалось сохранить при выходе: ${String(err)}`))
      .finally(() => {
        void store.close().finally(() => process.exit(0))
      })
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
