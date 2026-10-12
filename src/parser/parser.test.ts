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
  })

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
