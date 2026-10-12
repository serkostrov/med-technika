import { describe, expect, it } from 'vitest'
import { bootstrapServer } from '@/server'
import {
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
} from '@/server/db/backup'

describe('Database backup/restore', () => {
  it('round-trip сохраняет settings и auditSeq', async () => {
    const { api, db } = await bootstrapServer()
    db.settings.find((s) => s.key === 'lab_address_text')!.value = 'Backup addr'
    db.auditSeq = 42
    const snap = exportDatabaseSnapshot(db)

    const { db: db2 } = await bootstrapServer()
    importDatabaseSnapshot(db2, snap)
    expect(
      db2.settings.find((s) => s.key === 'lab_address_text')?.value,
    ).toBe('Backup addr')
    expect(db2.auditSeq).toBe(42)
    expect(api).toBeTruthy()
  })
})
