import { describe, expect, it } from 'vitest'
import { ProtocolStatus } from '@/domain'
import { createEmptyDatabase } from '@/server/db/database'
import { SeedIds } from '@/data/ids'
import {
  buildFgisXmlPackage,
  canonicalizeFgisXml,
  firstCanonicalDiff,
  validateAgainstFgisXsd,
  xmlEqualCanonically,
} from '@/fgis-xml'
import { seedReferenceProtocol } from '@/fgis-xml/fixtures/reference-protocols'
import { REFERENCE_XML } from '@/fgis-xml/fixtures/reference-xml'

describe('FGIS XML (§10.2)', () => {
  it('для трёх эталонов совпадает с эталоном по всем значимым элементам', () => {
    const db = createEmptyDatabase()
    const kinds = ['uhf', 'mt', 'df'] as const
    for (const kind of kinds) {
      const id = seedReferenceProtocol(db, kind, SeedIds.staffSudnitsyn)
      // снять возможные E-ошибки от повторных проверок (даты/условия ок)
      for (const i of db.protocolIssues) {
        if (i.protocolId === id) i.isActive = false
      }

      const built = buildFgisXmlPackage(db, {
        protocolIds: [id],
        actorStaffId: SeedIds.staffSadakov,
        dryRun: true,
      })

      const xsd = validateAgainstFgisXsd(built.xml)
      expect(xsd.ok, xsd.ok ? '' : xsd.errors.join('\n')).toBe(true)

      const expected = REFERENCE_XML[kind]
      const diff = firstCanonicalDiff(built.previewXml, expected)
      expect(diff, diff ?? undefined).toBeNull()
      expect(xmlEqualCanonically(built.previewXml, expected)).toBe(true)

      // FactValue порядок App. A
      const facts = [
        ...built.previewXml.matchAll(/<FactValue>(.*?)<\/FactValue>/g),
      ].map((m) => m[1])
      expect(facts).toEqual(EXPECTED_FACTS[kind])

      // Content отсутствует в preview
      expect(built.previewXml).toContain('<Content></Content>')
      expect(built.xml).toMatch(/<Content>[A-Za-z0-9+/=]+<\/Content>/)

      // дубли Equipment схлопнуты
      const eqIds = [
        ...built.previewXml.matchAll(/<EquipmentId>(.*?)<\/EquipmentId>/g),
      ].map((m) => m[1])
      expect(eqIds).toEqual(['100001'])
    }
  })

  it('XSD-ошибка не создаёт выгрузку; ready→exported только для успешных', () => {
    const db = createEmptyDatabase()
    const id = seedReferenceProtocol(db, 'uhf', SeedIds.staffSudnitsyn)
    for (const i of db.protocolIssues) {
      if (i.protocolId === id) i.isActive = false
    }

    const ok = buildFgisXmlPackage(db, {
      protocolIds: [id],
      actorStaffId: SeedIds.staffSadakov,
    })
    expect(db.fgisExports).toHaveLength(1)
    expect(db.fgisExportFiles.has(ok.filePath)).toBe(true)
    expect(db.protocols.find((p) => p.id === id)?.status).toBe(
      ProtocolStatus.exported,
    )

    // повторная выгрузка exported допускается
    const again = buildFgisXmlPackage(db, {
      protocolIds: [id],
      actorStaffId: SeedIds.staffSadakov,
    })
    expect(again.includedProtocolIds).toEqual([id])
    expect(db.fgisExports).toHaveLength(2)
  })

  it('протокол с ошибкой пропускается с причиной; лимит 100', () => {
    const db = createEmptyDatabase()
    const id = seedReferenceProtocol(db, 'mt', SeedIds.staffSudnitsyn)
    // форсируем ошибку: убрать OA
    for (const r of db.protocolResults.filter((x) => x.protocolId === id)) {
      r.oaItemId = null
    }

    expect(() =>
      buildFgisXmlPackage(db, {
        protocolIds: [id],
        actorStaffId: SeedIds.staffSadakov,
      }),
    ).toThrow(/Ни один протокол/)

    expect(() =>
      buildFgisXmlPackage(db, {
        protocolIds: Array.from({ length: 101 }, () => crypto.randomUUID()),
        actorStaffId: SeedIds.staffSadakov,
        dryRun: true,
      }),
    ).toThrow(/100/)
  })

  it('канонизация игнорирует Content и порядок Equipment', () => {
    const a = `<root><protocol><Equipment><EquipmentDetails><EquipmentId>2</EquipmentId></EquipmentDetails><EquipmentDetails><EquipmentId>1</EquipmentId></EquipmentDetails></Equipment><ProtocolScan><Content>AAA</Content></ProtocolScan></protocol></root>`
    const b = `<root><protocol><Equipment><EquipmentDetails><EquipmentId>1</EquipmentId></EquipmentDetails><EquipmentDetails><EquipmentId>2</EquipmentId></EquipmentDetails></Equipment><ProtocolScan><Content>BBB</Content></ProtocolScan></protocol></root>`
    expect(canonicalizeFgisXml(a)).toBe(canonicalizeFgisXml(b))
  })
})

const EXPECTED_FACTS: Record<'uhf' | 'mt' | 'df', string[]> = {
  uhf: ['63,3', '87,4', '21,1', '7,0', '14,5', '27,130', '27,220', '27,687', '40,563'],
  mt: ['5,09', '10,34', '25,13', '48,83', '92,47'],
  df: ['7', '21', '39', '70', '119', '163', '197', '222', '280', '9,4'],
}
