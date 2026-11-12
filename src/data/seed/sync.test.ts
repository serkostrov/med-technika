import { describe, expect, it } from 'vitest'
import { FormStatus } from '@/domain'
import { SeedIds } from '@/data/ids'
import { createEmptyDatabase } from '@/server/db/database'
import {
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
} from '@/server/db/backup'
import { syncSeedReferenceData } from './sync'

/** БД, сохранённая до появления готовой формы 26-Ш. */
function legacyDb() {
  const db = createEmptyDatabase()
  const form = db.protocolForms.find((f) => f.id === SeedIds.formNoise)!
  form.status = FormStatus.no_materials
  form.parserProfile = 'noise'
  form.typeObjectId = null
  form.settings = {}
  db.oaItems = db.oaItems.filter((i) => i.id !== SeedIds.oaItemNoiseLeq)
  db.units = db.units.filter((u) => u.symbol !== 'дБА')
  db.formIndicatorMaps = db.formIndicatorMaps.filter(
    (m) => m.formId !== SeedIds.formNoise,
  )
  return db
}

describe('syncSeedReferenceData', () => {
  it('старая БД при загрузке получает готовую форму 26-Ш, ОА, единицу и сопоставления', () => {
    const snap = exportDatabaseSnapshot(legacyDb())
    const db = createEmptyDatabase()
    importDatabaseSnapshot(db, snap)

    const form = db.protocolForms.find((f) => f.id === SeedIds.formNoise)!
    expect(form.status).toBe(FormStatus.ready)
    expect(form.typeObjectId).toBe(10)
    expect(form.settings.numberSuffix).toBe('Ш')
    expect(db.oaItems.some((i) => i.id === SeedIds.oaItemNoiseLeq)).toBe(true)
    expect(db.units.find((u) => u.symbol === 'дБА')?.fgisId).toBe('429')
    expect(
      db.formIndicatorMaps.filter((m) => m.formId === SeedIds.formNoise).map((m) => m.sourceKey),
    ).toEqual(['laeq_8h', 'laeq_shift'])
  })

  it('не трогает форму, которую уже настроили руками, и идемпотентна', () => {
    const db = legacyDb()
    const form = db.protocolForms.find((f) => f.id === SeedIds.formNoise)!
    form.status = FormStatus.in_progress
    form.typeObjectId = 7

    expect(syncSeedReferenceData(db)).toBe(true) // ОА/единица/сопоставления
    expect(form.status).toBe(FormStatus.in_progress)
    expect(form.typeObjectId).toBe(7)
    expect(syncSeedReferenceData(db)).toBe(false)
  })

  it('26-МК: старая составная запись «МИ / ГОСТ / БВЕК» становится листом МИ, ГОСТ и БВЕК добавляются', () => {
    const db = createEmptyDatabase()
    db.protocolForms = db.protocolForms.filter((f) => f.kindId !== 9)
    db.protocolForms.push({
      id: SeedIds.formMicroMi,
      kindId: 9,
      templateFile: 'шаблон-26-МК',
      sheetName: 'Протокол Микроклимат МИ / ГОСТ / БВЕК',
      title: 'Протокол Микроклимат МИ / ГОСТ / БВЕК',
      parserProfile: 'micro',
      status: FormStatus.no_materials,
      typeObjectId: null,
      fgisDirectory: 'DM-55254',
      conditionsLimits: null,
      settings: {},
    })
    syncSeedReferenceData(db)
    const micro = db.protocolForms.filter((f) => f.kindId === 9)
    expect(micro.map((f) => [f.sheetName, f.status])).toEqual([
      ['Протокол Микроклимат МИ', FormStatus.ready],
      ['Протокол Микроклимат ГОСТ', FormStatus.no_materials],
      ['Протокол Микроклимат БВЕК', FormStatus.no_materials],
    ])
  })

  it('свежая БД уже синхронна', () => {
    expect(syncSeedReferenceData(createEmptyDatabase())).toBe(false)
  })
})
