import type { Database } from '@/server/db/database'

export type DatabaseSnapshot = {
  version: 1
  exportedAt: string
  tables: Record<string, unknown>
  blobs: {
    protocolSources: Array<{
      path: string
      sha256: string
      fileName: string
      uploadedAt: string
      bytesBase64: string
    }>
    protocolScans: Array<{
      path: string
      fileName: string
      uploadedAt: string
      uploadedBy: string
      bytesBase64: string
    }>
    fgisExportFiles: Array<{
      path: string
      fileName: string
      xml: string
      previewXml: string
      createdAt: string
      createdBy: string
    }>
  }
}

function abToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return btoa(s)
}

function b64ToAb(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

/** Сериализация in-memory БД для резервной копии (ТЗ §16). */
export function exportDatabaseSnapshot(db: Database): DatabaseSnapshot {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: {
      authAccounts: db.authAccounts,
      sessions: db.sessions,
      staff: db.staff,
      customers: db.customers,
      oaEditions: db.oaEditions,
      oaItems: db.oaItems,
      units: db.units,
      unitConversions: db.unitConversions,
      equipment: db.equipment,
      equipmentVerifications: db.equipmentVerifications,
      measurementKinds: db.measurementKinds,
      protocolForms: db.protocolForms,
      formIndicatorMaps: db.formIndicatorMaps,
      protocols: db.protocols,
      protocolObjects: db.protocolObjects,
      protocolResults: db.protocolResults,
      protocolEquipment: db.protocolEquipment,
      protocolIssues: db.protocolIssues,
      fgisExports: db.fgisExports,
      fgisExportItems: db.fgisExportItems,
      fsaEntries: db.fsaEntries,
      auditLog: db.auditLog,
      settings: db.settings,
      auditSeq: db.auditSeq,
    },
    blobs: {
      protocolSources: [...db.protocolSources.values()].map((s) => ({
        path: s.path,
        sha256: s.sha256,
        fileName: s.fileName,
        uploadedAt: s.uploadedAt,
        bytesBase64: abToB64(s.bytes),
      })),
      protocolScans: [...db.protocolScans.values()].map((s) => ({
        path: s.path,
        fileName: s.fileName,
        uploadedAt: s.uploadedAt,
        uploadedBy: s.uploadedBy,
        bytesBase64: abToB64(s.bytes),
      })),
      fgisExportFiles: [...db.fgisExportFiles.values()].map((f) => ({
        path: f.path,
        fileName: f.fileName,
        xml: f.xml,
        previewXml: f.previewXml,
        createdAt: f.createdAt,
        createdBy: f.createdBy,
      })),
    },
  }
}

/** Восстановление in-memory БД из снимка. */
export function importDatabaseSnapshot(
  db: Database,
  snap: DatabaseSnapshot,
): void {
  if (snap.version !== 1) {
    throw new Error(`Неподдерживаемая версия бэкапа: ${snap.version}`)
  }
  const t = snap.tables
  db.authAccounts = structuredClone(t.authAccounts as Database['authAccounts'])
  db.sessions = structuredClone(t.sessions as Database['sessions'])
  db.staff = structuredClone(t.staff as Database['staff'])
  db.customers = structuredClone(t.customers as Database['customers'])
  db.oaEditions = structuredClone(t.oaEditions as Database['oaEditions'])
  db.oaItems = structuredClone(t.oaItems as Database['oaItems'])
  db.units = structuredClone(t.units as Database['units'])
  db.unitConversions = structuredClone(
    t.unitConversions as Database['unitConversions'],
  )
  db.equipment = structuredClone(t.equipment as Database['equipment'])
  db.equipmentVerifications = structuredClone(
    t.equipmentVerifications as Database['equipmentVerifications'],
  )
  db.measurementKinds = structuredClone(
    t.measurementKinds as Database['measurementKinds'],
  )
  db.protocolForms = structuredClone(
    t.protocolForms as Database['protocolForms'],
  )
  db.formIndicatorMaps = structuredClone(
    t.formIndicatorMaps as Database['formIndicatorMaps'],
  )
  db.protocols = structuredClone(t.protocols as Database['protocols'])
  db.protocolObjects = structuredClone(
    t.protocolObjects as Database['protocolObjects'],
  )
  db.protocolResults = structuredClone(
    t.protocolResults as Database['protocolResults'],
  )
  db.protocolEquipment = structuredClone(
    t.protocolEquipment as Database['protocolEquipment'],
  )
  db.protocolIssues = structuredClone(
    t.protocolIssues as Database['protocolIssues'],
  )
  db.fgisExports = structuredClone(t.fgisExports as Database['fgisExports'])
  db.fgisExportItems = structuredClone(
    t.fgisExportItems as Database['fgisExportItems'],
  )
  db.fsaEntries = structuredClone(t.fsaEntries as Database['fsaEntries'])
  db.auditLog = structuredClone(t.auditLog as Database['auditLog'])
  db.settings = structuredClone(t.settings as Database['settings'])
  db.auditSeq = Number(t.auditSeq ?? 1)

  db.protocolSources.clear()
  for (const s of snap.blobs.protocolSources) {
    db.protocolSources.set(s.path, {
      path: s.path,
      sha256: s.sha256,
      fileName: s.fileName,
      uploadedAt: s.uploadedAt,
      bytes: b64ToAb(s.bytesBase64),
    })
  }
  db.protocolScans.clear()
  for (const s of snap.blobs.protocolScans) {
    db.protocolScans.set(s.path, {
      path: s.path,
      fileName: s.fileName,
      uploadedAt: s.uploadedAt,
      uploadedBy: s.uploadedBy,
      bytes: b64ToAb(s.bytesBase64),
    })
  }
  db.fgisExportFiles.clear()
  for (const f of snap.blobs.fgisExportFiles) {
    db.fgisExportFiles.set(f.path, { ...f })
  }
}
