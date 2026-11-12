import pg from 'pg'
import type { SqlDatabase, SqlExecutor } from './state-store'

function normalizeParams(params?: unknown[]): unknown[] | undefined {
  // pg ожидает Buffer для bytea
  return params?.map((p) =>
    p instanceof Uint8Array && !Buffer.isBuffer(p)
      ? Buffer.from(p.buffer, p.byteOffset, p.byteLength)
      : p,
  )
}

/** Postgres (Supabase) через пул `pg`. */
export function createPgDatabase(connectionString: string, ssl: boolean): SqlDatabase {
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  })
  pool.on('error', (err) => {
    console.error('Postgres pool error:', err.message)
  })

  const exec = (client: pg.Pool | pg.PoolClient): SqlExecutor => ({
    async query<T>(sql: string, params?: unknown[]) {
      const res = await client.query(sql, normalizeParams(params))
      return { rows: res.rows as T[] }
    },
  })

  return {
    ...exec(pool),
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      const client = await pool.connect()
      try {
        await client.query('begin')
        const result = await fn(exec(client))
        await client.query('commit')
        return result
      } catch (err) {
        await client.query('rollback').catch(() => undefined)
        throw err
      } finally {
        client.release()
      }
    },
    end: () => pool.end(),
  }
}
