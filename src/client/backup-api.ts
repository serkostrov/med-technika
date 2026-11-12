import type { DatabaseSnapshot } from '@/server/db/backup'
import { apiFetchJson } from '@/client/dictionaries-api'
import {
  exportSharedDbSnapshot,
  importSharedDbSnapshot,
} from '@/client/shared-api'
import { isRemoteApi } from '@/client/transport'

/** Резервная копия: с сервера (Postgres) или из локального снимка браузера. */
export async function downloadDbSnapshot(): Promise<DatabaseSnapshot> {
  if (isRemoteApi) return apiFetchJson<DatabaseSnapshot>('/admin/snapshot')
  return exportSharedDbSnapshot()
}

/** Восстановление: на сервер (только начальник ИЛ) или в локальный снимок. */
export async function restoreDbSnapshot(snap: DatabaseSnapshot): Promise<void> {
  if (isRemoteApi) {
    await apiFetchJson<{ ok: boolean }>('/admin/snapshot', {
      method: 'POST',
      body: JSON.stringify(snap),
    })
    return
  }
  await importSharedDbSnapshot(snap)
}
