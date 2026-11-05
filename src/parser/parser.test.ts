import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createSeedBundle } from '@/data/seed'
import {
  FACT_VALUE_CASES,
  formatFactValue,
  parseProtocol,
  ParseError,
} from '@/parser'
import {
  buildReferenceDfXlsx,
  buildReferenceMtXlsx,
  buildReferenceUhfXlsx,
} from '@/parser/fixtures/reference-xlsx'
import { sha256Hex } from '@/parser/hash'
import { bootstrapServer, SeedCredentials } from '@/server'

const FIXTURES_REAL = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/real',
)
const REAL_DF_22 = join(FIXTURES_REAL, '22-26-ДФ.xlsx')
const REAL_DF =
  '/Users/talininigor/Downloads/29-26-ДФ КОГБУЗ Омутнинская ЦРБ.xlsx'
const REAL_UHF =
  '/Users/talininigor/Downloads/26-26-УВЧ КОГБУЗ КОКБ Областная.xlsx'

describe('FactValue (§6.6)', () => {
  it.each(FACT_VALUE_CASES)(
    '$value / $format → $expected',
    ({ value, format, expected }) => {
      expect(formatFactValue(value, format)).toBe(expected)
    },
  )
})

describe('Эталонные протоколы (App. A)', () => {
  const seed = createSeedBundle()

  it('20-26-УВЧ: форма, 9 результатов, порядок FactValue', () => {
    const data = buildReferenceUhfXlsx()
    const parsed = parseProtocol({
      data,
      forms: seed.protocolForms,
      indicatorMaps: seed.formIndicatorMaps,
    })
    expect(parsed.formTitle).toBe('УВЧ-терапия')
    expect(parsed.parserProfile).toBe('physio-bb')
    expect(parsed.metadata.number).toBe('20-26-УВЧ')
    expect(parsed.metadata.protocolDate).toBe('2026-09-22')
    expect(parsed.metadata.customerName).toMatch(/Эталон/i)
    expect(parsed.metadata.engineerShortName).toMatch(/Судницын/)
    expect(parsed.results).toHaveLength(9)
    expect(parsed.results.map((r) => r.factValue)).toEqual([
      '63,3',
      '87,4',
      '21,1',
      '7,0',
      '14,5',
      '27,130',
      '27,220',
      '27,687',
      '40,563',
    ])
    expect(parsed.equipment.filter((e) => e.kind === 'si').length).toBeGreaterThanOrEqual(4)
  })

  it('44-26-МТ: 5 результатов силы тока', () => {
    const parsed = parseProtocol({
      data: buildReferenceMtXlsx(),
      forms: seed.protocolForms,
      indicatorMaps: seed.formIndicatorMaps,
    })
    expect(parsed.formTitle).toBe('НЧ-терапия')
    expect(parsed.metadata.number).toBe('44-26-МТ')
    expect(parsed.results).toHaveLength(5)
    expect(parsed.results.map((r) => r.factValue)).toEqual([
      '5,09',
      '10,34',
      '25,13',
      '48,83',
      '92,47',
    ])
  })

  it('26-26-ДФ: 10 результатов, physio-df', () => {
    const parsed = parseProtocol({
      data: buildReferenceDfXlsx(),
      forms: seed.protocolForms,
      indicatorMaps: seed.formIndicatorMaps,
    })
    expect(parsed.parserProfile).toBe('physio-df')
    expect(parsed.metadata.number).toBe('26-26-ДФ')
    expect(parsed.objects).toHaveLength(1)
    expect(parsed.objects[0]).toMatchObject({
      name: 'PRIMEDIC Defi-B',
      serialNo: 'D1',
      year: '2014',
    })
    expect(parsed.results).toHaveLength(10)
    expect(parsed.results.map((r) => r.factValue)).toEqual([
      '7',
      '21',
      '39',
      '70',
      '119',
      '163',
      '197',
      '222',
      '280',
      '9,4',
    ])
    expect(parsed.results.map((r) => r.sourceKey)).toEqual([
      'energy_le2kv',
      'energy_le2kv',
      'energy_le2kv',
      'energy_2_8kv',
      'energy_2_8kv',
      'energy_2_8kv',
      'energy_2_8kv',
      'energy_2_8kv',
      'energy_2_8kv',
      'interval',
    ])
  })

  it('боевой 22-26-ДФ: 4 объекта без нумерации, 43 результата', () => {
    const buf = readFileSync(REAL_DF_22)
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    const parsed = parseProtocol({
      data,
      forms: seed.protocolForms,
      indicatorMaps: seed.formIndicatorMaps,
    })
    expect(parsed.metadata.number).toBe('22-26-ДФ')
    expect(parsed.parserProfile).toBe('physio-df')
    expect(parsed.metadata.engineerShortName).toMatch(/Судницын/)
    expect(parsed.objects).toHaveLength(4)
    expect(parsed.objects.map((o) => o.serialNo)).toEqual([
      '81933',
      'Д081481369',
      '82075',
      '71144025527',
    ])
    expect(parsed.objects.map((o) => o.year)).toEqual([
      '2008',
      '2014',
      '2010',
      null,
    ])
    expect(parsed.objects.map((o) => o.department)).toEqual([
      'Отделение анестезиологии и реанимации №2',
      'Отделение анестезиологии и реанимации №2',
      'Отделение анестезиологии и реанимации №1',
      'Родильное отделение',
    ])
    expect(parsed.results).toHaveLength(43)
    // первый объект: 5 + 6 + 2
    expect(
      parsed.results.filter((r) => r.objectSeq === 1).map((r) => r.sourceKey),
    ).toEqual([
      'energy_le2kv',
      'energy_le2kv',
      'energy_le2kv',
      'energy_le2kv',
      'energy_le2kv',
      'energy_2_8kv',
      'energy_2_8kv',
      'energy_2_8kv',
      'energy_2_8kv',
      'energy_2_8kv',
      'energy_2_8kv',
      'interval',
      'interval',
    ])
    expect(
      parsed.results.filter((r) => r.objectSeq === 1).map((r) => r.factValue),
    ).toEqual([
      '7',
      '10',
      '19',
      '30',
      '48',
      '69',
      '97',
      '147',
      '195',
      '293',
      '353',
      '1,8',
      '3,2',
    ])
    // последний объект: 1 + 5 + 1
    expect(
      parsed.results.filter((r) => r.objectSeq === 4).map((r) => r.sourceKey),
    ).toEqual([
      'energy_le2kv',
      'energy_2_8kv',
      'energy_2_8kv',
      'energy_2_8kv',
      'energy_2_8kv',
      'energy_2_8kv',
      'interval',
    ])
    expect(
      parsed.results.filter((r) => r.objectSeq === 4).map((r) => r.factValue),
    ).toEqual(['20', '55', '106', '166', '251', '356', '4,0'])
    // СИ: 4 пункта после склейки многострочных абзацев
    const si = parsed.equipment.filter((e) => e.kind === 'si')
    expect(si).toHaveLength(4)
    expect(si.map((e) => e.serialRaw)).toEqual([
      '190006',
      'NHS08DAD3R0670',
      '73213',
      '3069',
    ])
  })

  it.skipIf(!existsSync(REAL_DF))(
    'боевой 29-26-ДФ: заголовки блоков в Y, 7 результатов',
    () => {
      const buf = readFileSync(REAL_DF)
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      const parsed = parseProtocol({
        data,
        forms: seed.protocolForms,
        indicatorMaps: seed.formIndicatorMaps,
      })
      expect(parsed.metadata.number).toBe('29-26-ДФ')
      expect(parsed.parserProfile).toBe('physio-df')
      expect(parsed.objects).toHaveLength(1)
      expect(parsed.results).toHaveLength(7)
      expect(parsed.results.map((r) => r.sourceKey)).toEqual([
        'energy_le2kv',
        'energy_le2kv',
        'energy_2_8kv',
        'energy_2_8kv',
        'energy_2_8kv',
        'energy_2_8kv',
        'interval',
      ])
      expect(parsed.results.map((r) => r.factValue)).toEqual([
        '18',
        '44',
        '91',
        '150',
        '228',
        '330',
        '4,0',
      ])
    },
  )

  it.skipIf(!existsSync(REAL_UHF))(
    'боевой 26-26-УВЧ: 12 результатов (9 мощность + 3 частота)',
    () => {
      const buf = readFileSync(REAL_UHF)
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      const parsed = parseProtocol({
        data,
        forms: seed.protocolForms,
        indicatorMaps: seed.formIndicatorMaps,
      })
      expect(parsed.metadata.number).toBe('26-26-УВЧ')
      expect(parsed.results).toHaveLength(12)
      expect(parsed.results.map((r) => r.factValue)).toEqual([
        '6,8',
        '14,6',
        '21,8',
        '8,4',
        '19,2',
        '29,6',
        '14,0',
        '28,1',
        '49,0',
        '26,911',
        '26,992',
        '40,745',
      ])
    },
  )

  it('неподдерживаемая / пустая книга → ParseError без частичных данных', () => {
    expect(() =>
      parseProtocol({
        data: new ArrayBuffer(8),
        forms: seed.protocolForms,
        indicatorMaps: seed.formIndicatorMaps,
      }),
    ).toThrow(ParseError)
  })
})

describe('Загрузка: SHA-256 и save', () => {
  it('повтор того же файла распознаётся по хешу; save пишет протокол', async () => {
    const { api } = await bootstrapServer()
    const login = await api.login(
      SeedCredentials.engineer.email,
      SeedCredentials.engineer.password,
    )
    const ctx = api.auth.resolveToken(login.token)
    const data = buildReferenceUhfXlsx()
    const sha = await sha256Hex(data)

    const first = await api.uploads.parseUpload(ctx, '20-26-УВЧ.xlsx', data)
    expect(first.error).toBeNull()
    expect(first.parsed?.results).toHaveLength(9)
    expect(first.sha256).toBe(sha)

    const saved = api.uploads.saveParsed(ctx, {
      sourcePath: first.sourcePath,
      sha256: first.sha256,
      parsed: first.parsed!,
      createCustomer: true,
    })
    expect(saved.number).toBe('20-26-УВЧ')
    expect(saved.status).toBe('review')
    expect(saved.sourceSha256).toBe(sha)

    const dup = await api.uploads.parseUpload(ctx, '20-26-УВЧ.xlsx', data)
    expect(dup.alreadyUploaded?.protocolId).toBe(saved.id)
    expect(dup.error).toMatch(/уже загружен/i)
  })

  it('боевой 22-26-ДФ: save → карточка 4 объекта / 43 результата + XML', async () => {
    const { api } = await bootstrapServer()
    const engLogin = await api.login(
      SeedCredentials.engineer.email,
      SeedCredentials.engineer.password,
    )
    const eng = api.auth.resolveToken(engLogin.token)
    const headLogin = await api.login(
      SeedCredentials.head.email,
      SeedCredentials.head.password,
    )
    const head = api.auth.resolveToken(headLogin.token)
    const buf = readFileSync(REAL_DF_22)
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)

    const parsed = await api.uploads.parseUpload(eng, '22-26-ДФ.xlsx', data)
    expect(parsed.error).toBeNull()
    expect(parsed.parsed?.objects).toHaveLength(4)
    expect(parsed.parsed?.results).toHaveLength(43)

    const saved = api.uploads.saveParsed(eng, {
      sourcePath: parsed.sourcePath,
      sha256: parsed.sha256,
      parsed: parsed.parsed!,
    })
    expect(saved.number).toBe('22-26-ДФ')

    let detail = api.getProtocolDetail(eng, saved.id)
    expect(detail.objects).toHaveLength(4)
    expect(detail.results).toHaveLength(43)
    expect(detail.results.filter((r) => r.oaItemId)).toHaveLength(43)
    expect(detail.equipment.filter((e) => e.kind === 'si')).toHaveLength(4)
    // в Excel заказчик пуст — XML после ручного сопоставления
    expect(detail.xmlPreview).toMatch(/Заказчик не сопоставлен/)
    const customer = api.createCustomer(head, {
      name: 'Тестовый заказчик ДФ',
    })
    api.updateProtocol(eng, saved.id, { customerId: customer.id })
    detail = api.getProtocolDetail(eng, saved.id)
    expect(detail.xmlPreview).toContain('<FullNameObject>')
    expect(detail.xmlPreview).toMatch(/Дефибрилляторы/)
    expect(detail.xmlPreview.match(/<ResearchObject>/g)?.length).toBe(43)
  })

  it('замена по номеру+дате до выгрузки', async () => {
    const { api } = await bootstrapServer()
    const login = await api.login(
      SeedCredentials.head.email,
      SeedCredentials.head.password,
    )
    const ctx = api.auth.resolveToken(login.token)
    const data = buildReferenceMtXlsx()
    const first = await api.uploads.parseUpload(ctx, '44.xlsx', data)
    const saved = api.uploads.saveParsed(ctx, {
      sourcePath: first.sourcePath,
      sha256: first.sha256,
      parsed: first.parsed!,
      createCustomer: true,
    })

    // новый файл с тем же номером/датой, другой хеш — чуть меняем через повторную генерацию + байт
    const data2 = buildReferenceMtXlsx()
    const bytes = new Uint8Array(data2.slice(0))
    bytes[bytes.length - 1] = (bytes[bytes.length - 1]! + 1) % 256
    const second = await api.uploads.parseUpload(ctx, '44-b.xlsx', bytes.buffer)
    expect(second.replaceCandidate?.protocolId).toBe(saved.id)

    const replaced = api.uploads.saveParsed(ctx, {
      sourcePath: second.sourcePath,
      sha256: second.sha256,
      parsed: second.parsed!,
      replaceProtocolId: saved.id,
      createCustomer: true,
    })
    expect(replaced.id).not.toBe(saved.id)
    expect(
      api.listProtocolEntities(ctx).some((p) => p.id === saved.id),
    ).toBe(false)
  })
})
