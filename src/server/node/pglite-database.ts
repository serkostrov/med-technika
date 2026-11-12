import { PGlite } from '@electric-sql/pglite'
import type { SqlDatabase, SqlExecutor } from './state-store'

/**
 * Встроенный Postgres (WASM) — для тестов и локального запуска без Docker.
 * В production-образ не попадает (dev-зависимость).
 */
export async function createPgliteDatabase(dataDir?: string): Promise<SqlDatabase> {
  const db = dataDir ? new PGlite(dataDir) : new PGlite()
  await db.waitReady
  const exec = (q: Pick<PGlite, 'query'>): SqlExecutor => ({
    async query<T>(sql: string, params?: unknown[]) {
      const res = await q.query<T>(sql, params)
      return { rows: res.rows }
    },
  })
  return {
    ...exec(db),
    transaction: (fn) => db.transaction((tx) => fn(exec(tx))),
    end: () => db.close(),
  }
}
