import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AppRole, CustomerKindId, EquipmentKind } from '@/domain'
import { createSeedBundle } from '@/data/seed'
import { normalizeSerial } from '@/dictionaries/normalize/text'
import { canonicalizeFgisXml } from '@/fgis-xml'
import { parseProtocol } from '@/parser'
import { bootstrapServer, SeedCredentials } from '@/server'

const HERE = dirname(fileURLToPath(import.meta.url))
const XLSX_PATH = join(HERE, '../fixtures/real/29-26-Ш.xlsx')
const XML_PATH = join(HERE, '../../fgis-xml/fixtures/real/29-26-Ш.xml')

function readAb(path: string): ArrayBuffer {
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

const FACTS = ['50,0', '51,2', '44,8', '46,0', '46,0', '47,2', '51,2', '52,5', '54,5', '55,7']

describe('26-Ш шум (ГОСТ ISO 9612) — боевой 29-26-Ш', () => {
  it('разбор: 5 рабочих мест × (LEX,8h + фактическая смена), шапка, 5 СИ', () => {
    const seed = createSeedBundle()
    const parsed = parseProtocol({
      data: readAb(XLSX_PATH),
      forms: seed.protocolForms,
      indicatorMaps: seed.formIndicatorMaps,
    })
    expect(parsed.parserProfile).toBe('noise')
    expect(parsed.metadata.number).toBe('29-26-Ш')
    expect(parsed.metadata.protocolDate).toBe('2026-09-25')
    expect(parsed.metadata.measureStart).toBe('2026-09-08')
    expect(parsed.metadata.measureEnd).toBe('2026-09-08')
    expect(parsed.metadata.objectFullName).toBe('Рабочие места')
    expect(parsed.metadata.engineerShortName).toBe('Коршунов Е.В.')
    expect(parsed.metadata.conditions).toMatchObject({ t: 23, rh: 46, p: 98.81 })
    expect(parsed.objects.map((o) => o.name)).toEqual([
      'Стоматологический кабинет №1, рабочее место врача',
      'Гинекологический кабинет №2, рабочее место врача',
      'Рентген кабинет, рабочее место рентгенолаборанта',
      'Помещение № 114, рабочее место стоматолога-терапевта',
      'Зуботехнический кабинет. Рабочее место техника.',
    ])
    expect(parsed.results.map((r) => r.factValue)).toEqual(FACTS)
    expect(parsed.results.map((r) => r.sourceKey)).toEqual(
      Array.from({ length: 5 }, () => ['laeq_8h', 'laeq_shift']).flat(),
    )
    expect(parsed.results.every((r) => r.unitSymbol === 'дБА')).toBe(true)
    expect(parsed.equipment.map((e) => e.serialRaw)).toEqual([
      '145013',
      '118316',
      '431019',
      '26-14-00176',
      '3069',
    ])
  })

  it('XML совпадает с эталонной выгрузкой клиента', async () => {
    const { api } = await bootstrapServer()
    const db = api.getDbForTests()

    // справочники клиента, которых нет в seed
    db.customers.push({
      id: crypto.randomUUID(),
      name: 'ООО "Радуга-Мед"',
      nameAliases: [],
      kindId: CustomerKindId.legalEntity,
      inn: '4345096710',
      ogrn: '1054316522677',
      phone: null,
      email: null,
      legalAddress:
        '610010, Кировская область, город Киров, пр-кт Строителей (Радужный Мкр.), д.11а',
      actualAddress: null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    })
    db.staff.push({
      id: crypto.randomUUID(),
      authUserId: null,
      fullName: 'Коршунов Евгений Владимирович',
      shortName: 'Коршунов Е.В.',
      surname: 'Коршунов',
      fgisIdFullName: 175412,
      postName: 'Испытатель',
      fgisRoleIds: [1],
      appRole: AppRole.engineer,
      isActive: true,
      deletedAt: null,
    })
    const fgisBySerial: Record<string, number | null> = {
      '145013': 566956,
      '118316': 566934,
      '431019': 1142241,
      '26-14-00176': 3897355,
      '3069': null,
    }
    for (const [serial, fgisId] of Object.entries(fgisBySerial)) {
      const id = crypto.randomUUID()
      db.equipment.push({
        id,
        name: `СИ ${serial}`,
        serialNo: serial,
        serialNorm: normalizeSerial(serial),
        invNo: null,
        fgisEquipmentId: fgisId,
        kind: EquipmentKind.si,
        isActive: true,
        deletedAt: null,
      })
      db.equipmentVerifications.push({
        id: crypto.randomUUID(),
        equipmentId: id,
        certNo: `C-${serial}`,
        verifiedOn: '2026-01-01',
        validUntil: '2027-12-31',
        createdAt: new Date().toISOString(),
        deletedAt: null,
      })
    }

    const login = await api.login(SeedCredentials.head.email, SeedCredentials.head.password)
    const head = api.auth.resolveToken(login.token)
    const up = await api.uploads.parseUpload(head, '29-26-Ш.xlsx', readAb(XLSX_PATH))
    expect(up.error).toBeNull()
    const saved = api.uploads.saveParsed(head, {
      sourcePath: up.sourcePath,
      sha256: up.sha256,
      parsed: up.parsed!,
    })
    api.updateProtocol(head, saved.id, { applicationDate: '2026-08-31' })

    const detail = api.getProtocolDetail(head, saved.id)
    expect(detail.results.filter((r) => r.oaItemId)).toHaveLength(10)
    const actual = detail.xmlPreview
    const expected = readFileSync(XML_PATH, 'utf8')

    // В эталоне клиента в ФГИС ушли только первые 3 рабочих места (6 значений),
    // в Excel их 5 — сравниваем ResearchObjectInfo поштучно, остальное целиком.
    const infos = (xml: string) =>
      [...canonicalizeFgisXml(xml).matchAll(/<ResearchObjectInfo>.*?<\/ResearchObjectInfo>/g)].map(
        (m) => m[0],
      )
    const actualInfos = infos(actual)
    const expectedInfos = infos(expected)
    expect(actualInfos).toHaveLength(10)
    expect(expectedInfos).toHaveLength(6)
    expect(actualInfos.slice(0, 6)).toEqual(expectedInfos)

    const shell = (xml: string) =>
      canonicalizeFgisXml(xml)
        .replace(/<ResearchObject>.*?<\/ResearchObject>/, '<ResearchObject/>')
        // в эталоне хвостовой пробел из ячейки Excel
        .replace(/<FullNameObject>(.*?)<\/FullNameObject>/, (_m, t: string) =>
          `<FullNameObject>${t.trim()}</FullNameObject>`,
        )
    expect(shell(actual)).toBe(shell(expected))
  })
})
