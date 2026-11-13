import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AppRole, CustomerKindId, EquipmentKind, type Protocol } from '@/domain'
import { normalizeSerial } from '@/dictionaries/normalize/text'
import { canonicalizeFgisXml } from '@/fgis-xml'
import { bootstrapServer, SeedCredentials } from '@/server'

/**
 * Боевые протоколы клиента (П+X): Excel → сохранение → XML и сверка
 * с эталонной выгрузкой ФГИС (Content вырезан).
 */
const HERE = dirname(fileURLToPath(import.meta.url))

export function realXlsx(name: string): ArrayBuffer {
  const buf = readFileSync(join(HERE, 'real', `${name}.xlsx`))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

export function realReferenceXml(name: string): string {
  return readFileSync(join(HERE, '../../fgis-xml/fixtures/real', `${name}.xml`), 'utf8')
}

/** Канонизация + хвостовые пробелы текстов из ячеек Excel (FullNameObject и т.п.). */
export function normalizeForCompare(xml: string): string {
  return canonicalizeFgisXml(xml).replace(/>([^<]*?)\s+</g, '>$1<')
}

export type RealReferenceSetup = {
  name: string
  applicationDate: string
  customer: {
    name: string
    inn: string
    ogrn: string
    legalAddress: string
  }
  /** сотрудник-испытатель, которого нет в seed */
  engineer?: { shortName: string; fullName: string; surname: string; fgisIdFullName: number }
  /**
   * зав.№ → EquipmentId ФГИС (null — СИ без кода, в XML не попадает).
   * Ключ `name:<наименование>` — оборудование без номера («б/н»).
   */
  equipment: Record<string, number | null>
  /** ручные правки карточки после загрузки (как сделал бы инженер) */
  protocolPatch?: Partial<Pick<Protocol, 'customerPhone' | 'measureAddress'>>
}

export async function buildRealProtocolXml(setup: RealReferenceSetup): Promise<{
  xml: string
  resultsWithOa: number
  resultsTotal: number
}> {
  const { api } = await bootstrapServer()
  const db = api.getDbForTests()

  db.customers.push({
    id: crypto.randomUUID(),
    name: setup.customer.name,
    nameAliases: [],
    kindId: CustomerKindId.legalEntity,
    inn: setup.customer.inn,
    ogrn: setup.customer.ogrn,
    phone: null,
    email: null,
    legalAddress: setup.customer.legalAddress,
    actualAddress: null,
    createdAt: new Date().toISOString(),
    deletedAt: null,
  })
  const existing = setup.engineer
    ? db.staff.find((s) => s.surname === setup.engineer!.surname)
    : undefined
  if (setup.engineer && existing) {
    // сотрудник уже есть в seed (Громов) — дополняем кодом ФГИС, как в справочнике клиента
    Object.assign(existing, {
      shortName: setup.engineer.shortName,
      fullName: setup.engineer.fullName,
      fgisIdFullName: setup.engineer.fgisIdFullName,
    })
  } else if (setup.engineer) {
    db.staff.push({
      id: crypto.randomUUID(),
      authUserId: null,
      fullName: setup.engineer.fullName,
      shortName: setup.engineer.shortName,
      surname: setup.engineer.surname,
      fgisIdFullName: setup.engineer.fgisIdFullName,
      postName: 'Испытатель',
      fgisRoleIds: [1],
      appRole: AppRole.engineer,
      isActive: true,
      deletedAt: null,
    })
  }
  for (const [key, fgisId] of Object.entries(setup.equipment)) {
    const id = crypto.randomUUID()
    const byName = key.startsWith('name:')
    const serial = byName ? null : key
    db.equipment.push({
      id,
      name: byName ? key.slice(5) : `СИ ${key}`,
      serialNo: serial,
      serialNorm: serial ? normalizeSerial(serial) : null,
      invNo: null,
      fgisEquipmentId: fgisId,
      kind: EquipmentKind.si,
      isActive: true,
      deletedAt: null,
    })
    db.equipmentVerifications.push({
      id: crypto.randomUUID(),
      equipmentId: id,
      certNo: `C-${key}`,
      verifiedOn: '2026-01-01',
      validUntil: '2027-12-31',
      createdAt: new Date().toISOString(),
      deletedAt: null,
    })
  }

  const login = await api.login(SeedCredentials.head.email, SeedCredentials.head.password)
  const head = api.auth.resolveToken(login.token)
  const up = await api.uploads.parseUpload(head, `${setup.name}.xlsx`, realXlsx(setup.name))
  if (up.error) throw new Error(`parseUpload: ${up.error}`)
  const saved = api.uploads.saveParsed(head, {
    sourcePath: up.sourcePath,
    sha256: up.sha256,
    parsed: up.parsed!,
  })
  api.updateProtocol(head, saved.id, { applicationDate: setup.applicationDate })
  if (setup.protocolPatch) {
    Object.assign(db.protocols.find((p) => p.id === saved.id)!, setup.protocolPatch)
  }

  const detail = api.getProtocolDetail(head, saved.id)
  return {
    xml: detail.xmlPreview,
    resultsWithOa: detail.results.filter((r) => r.oaItemId).length,
    resultsTotal: detail.results.length,
  }
}

/** Заказчик и испытатель, общие для эталонов 29-26-Ш / 52-26-ПЧ (ООО «Радуга-Мед»). */
export const RADUGA_MED = {
  name: 'ООО "Радуга-Мед"',
  inn: '4345096710',
  ogrn: '1054316522677',
  legalAddress:
    '610010, Кировская область, город Киров, пр-кт Строителей (Радужный Мкр.), д.11а',
} as const

export const KORSHUNOV = {
  shortName: 'Коршунов Е.В.',
  fullName: 'Коршунов Евгений Владимирович',
  surname: 'Коршунов',
  fgisIdFullName: 175412,
} as const

export const GROMOV = {
  shortName: 'Громов А.В.',
  fullName: 'Громов А.В.',
  surname: 'Громов',
  fgisIdFullName: 293723,
} as const
