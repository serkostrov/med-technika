import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AppRole, CustomerKindId, EquipmentKind, type Protocol } from '@/domain'
import { normalizeSerial } from '@/dictionaries/normalize/text'
import { canonicalizeFgisXml } from '@/fgis-xml'
import { bootstrapServer, SeedCredentials } from '@/server'
import type { Database } from '@/server/db/database'

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

/**
 * Эталон клиента с поправкой на ответы ИЛ, которые меняют выгрузку:
 * добавить оборудование (секундомер выгружается — ИЛ 16.11.2026),
 * заменить текст (адрес места — из протокола).
 */
export function adjustReference(
  xml: string,
  fix: {
    addEquipmentIds?: number[]
    replace?: [from: string, to: string][]
    /** продублировать N-ю запись ResearchObjectInfo (1-based) — запись, которую ИЛ пропустила */
    duplicateResultAt?: number
    /** убрать N-й результат (1…): в эталоне выгружено то, чего по правилам нет (скрытая строка) */
    removeResultAt?: number
    /** адрес места измерений (IdAddrType 3) — из протокола (ответ ИЛ 16.11.2026) */
    measureAddress?: string
    /** вставить записи ResearchObjectInfo после N-й (1…): показатель, который ИЛ не выгрузила */
    insertResultsAfter?: { at: number; results: string[] }
  },
): string {
  let out = xml
  if (fix.measureAddress != null) {
    out = out.replace(
      /(<IdAddrType>\s*3\s*<\/IdAddrType>[\s\S]*?<UniqueAddressText>)[\s\S]*?(<\/UniqueAddressText>)/,
      `$1${fix.measureAddress}$2`,
    )
  }
  if (fix.duplicateResultAt != null) {
    let n = 0
    out = out.replace(/<ResearchObjectInfo>[\s\S]*?<\/ResearchObjectInfo>/g, (m) =>
      ++n === fix.duplicateResultAt ? m + m : m,
    )
  }
  if (fix.removeResultAt != null) {
    let n = 0
    out = out.replace(/<ResearchObjectInfo>[\s\S]*?<\/ResearchObjectInfo>/g, (m) =>
      ++n === fix.removeResultAt ? '' : m,
    )
  }
  if (fix.insertResultsAfter != null) {
    const { at, results } = fix.insertResultsAfter
    let n = 0
    out = out.replace(/<ResearchObjectInfo>[\s\S]*?<\/ResearchObjectInfo>/g, (m) =>
      ++n === at ? m + results.join('') : m,
    )
  }
  for (const id of fix.addEquipmentIds ?? []) {
    out = out.replace(
      /<\/Equipment>/,
      `<EquipmentDetails><EquipmentId>${id}</EquipmentId></EquipmentDetails></Equipment>`,
    )
  }
  for (const [from, to] of fix.replace ?? []) {
    if (!out.includes(from)) throw new Error(`adjustReference: нет «${from}» в эталоне`)
    out = out.split(from).join(to)
  }
  return out
}

/**
 * Сравнение без учёта порядка результатов: ResearchObjectInfo сортируются.
 * Для эталонов, где старая программа клиента ставила записи в другом порядке
 * (26-РК 322 / 328) — сами записи должны совпасть один в один.
 */
export function normalizeIgnoringResultOrder(xml: string): string {
  return normalizeForCompare(xml).replace(
    /<ResearchObject>([\s\S]*?)<\/ResearchObject>/,
    (_m, inner: string) => {
      const infos = [...inner.matchAll(/<ResearchObjectInfo>[\s\S]*?<\/ResearchObjectInfo>/g)].map(
        (x) => x[0],
      )
      return `<ResearchObject>${infos.sort().join('')}</ResearchObject>`
    },
  )
}

/** Канонизация + хвостовые пробелы текстов из ячеек Excel (FullNameObject и т.п.). */
export function normalizeForCompare(xml: string): string {
  return canonicalizeFgisXml(xml).replace(/>([^<]*?)\s+</g, '>$1<')
}

export type RealReferenceSetup = {
  name: string
  /** по умолчанию — из эталонного XML */
  applicationDate?: string
  /**
   * Заказчик. «fromReference» — карточка с названием из протокола и ИНН / ОГРН /
   * телефоном / юр. адресом из эталонного XML (как её завела бы лаборатория).
   */
  customer:
    | 'fromReference'
    | {
    name: string
    inn: string
    ogrn: string
    legalAddress: string
    /** телефон в карточке заказчика (в XML — он, ИЛ 16.11.2026) */
    phone?: string
  }
  /** сотрудник-испытатель, которого нет в seed */
  engineer?: { shortName: string; fullName: string; surname: string; fgisIdFullName: number }
  /**
   * зав.№ → EquipmentId ФГИС (null — СИ без кода, в XML не попадает).
   * Ключ `name:<наименование>` — оборудование без номера («б/н»).
   */
  equipment?: Record<string, number | null>
  /**
   * Справочники лаборатории («ID персонал и оборудование.xlsx»): 70 СИ с EquipmentId
   * и 7 сотрудников с idFullName — сопоставление как в реальной работе.
   */
  lab?: boolean
  /** ручные правки карточки после загрузки (как сделал бы инженер) */
  protocolPatch?: Partial<Pick<Protocol, 'customerPhone' | 'measureAddress'>>
  /** лист, если в книге заполнено несколько (выбор пользователя, ТЗ 6.2) */
  sheet?: string
}

export async function buildRealProtocolXml(setup: RealReferenceSetup): Promise<{
  xml: string
  resultsWithOa: number
  resultsTotal: number
}> {
  const { api } = await bootstrapServer()
  const db = api.getDbForTests()

  if (setup.customer !== 'fromReference') db.customers.push({
    id: crypto.randomUUID(),
    name: setup.customer.name,
    nameAliases: [],
    kindId: CustomerKindId.legalEntity,
    inn: setup.customer.inn,
    ogrn: setup.customer.ogrn,
    phone: setup.customer.phone ?? null,
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
  if (setup.lab) loadLabDictionaries(db)
  for (const [key, fgisId] of Object.entries(setup.equipment ?? {})) {
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
  const up = await api.uploads.parseUpload(
    head,
    `${setup.name}.xlsx`,
    realXlsx(setup.name),
    setup.sheet ?? null,
  )
  if (up.error) throw new Error(`parseUpload: ${up.error}`)
  const reference = realReferenceXml(setup.name)
  if (setup.customer === 'fromReference') {
    const customerXml = /<Customer>([\s\S]*?)<\/Customer>/.exec(reference)?.[1] ?? ''
    const tag = (t: string) => new RegExp(`<${t}>\\s*([^<]*?)\\s*</${t}>`).exec(customerXml)?.[1] ?? null
    db.customers.push({
      id: crypto.randomUUID(),
      name: up.parsed!.metadata.customerName ?? 'Заказчик',
      nameAliases: [],
      kindId: CustomerKindId.legalEntity,
      inn: tag('InnId'),
      ogrn: tag('OgrnId'),
      phone: tag('Number'),
      email: null,
      legalAddress: tag('UniqueAddressText'),
      actualAddress: null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    })
  }
  const applicationDate =
    setup.applicationDate ??
    /<ApplicationDate>\s*([^<]*?)\s*<\/ApplicationDate>/.exec(reference)?.[1] ??
    null
  const saved = api.uploads.saveParsed(head, {
    sourcePath: up.sourcePath,
    sha256: up.sha256,
    parsed: up.parsed!,
  })
  api.updateProtocol(head, saved.id, { applicationDate })
  if (setup.protocolPatch) {
    Object.assign(db.protocols.find((p) => p.id === saved.id)!, setup.protocolPatch)
  }

  const detail = api.getProtocolDetail(head, saved.id)
  return {
    xml: detail.xmlPreview,
    resultsWithOa: detail.results.filter((r) => r.oaItemId).length,
    resultsTotal: detail.results.length,
    /** ошибки единиц (E15) — у эталонов их быть не должно */
    unitErrors: detail.issues.filter((i) => i.code === 'E15').map((i) => i.message),
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

type LabDictionaries = {
  staff: { surname: string; fgisIdFullName: number; postName: string }[]
  equipment: { name: string; serial: string; fgisEquipmentId: number }[]
}

function loadLabDictionaries(db: Database): void {
  const lab = JSON.parse(
    readFileSync(join(HERE, 'lab-dictionaries.json'), 'utf8'),
  ) as LabDictionaries
  for (const s of lab.staff) {
    const existing = db.staff.find((x) => x.surname === s.surname)
    if (existing) {
      existing.fgisIdFullName = s.fgisIdFullName
      continue
    }
    db.staff.push({
      id: crypto.randomUUID(),
      authUserId: null,
      fullName: s.surname,
      shortName: s.surname,
      surname: s.surname,
      fgisIdFullName: s.fgisIdFullName,
      postName: 'Испытатель',
      fgisRoleIds: [1],
      appRole: AppRole.engineer,
      isActive: true,
      deletedAt: null,
    })
  }
  for (const e of lab.equipment) {
    const id = crypto.randomUUID()
    const serial = e.serial && !/^(б\/н|-)$/i.test(e.serial) ? e.serial : null
    db.equipment.push({
      id,
      name: e.name,
      serialNo: serial,
      serialNorm: serial ? normalizeSerial(serial) : null,
      invNo: null,
      fgisEquipmentId: e.fgisEquipmentId,
      kind: EquipmentKind.si,
      isActive: true,
      deletedAt: null,
    })
    db.equipmentVerifications.push({
      id: crypto.randomUUID(),
      equipmentId: id,
      certNo: 'lab',
      verifiedOn: '2026-01-01',
      validUntil: '2027-12-31',
      createdAt: new Date().toISOString(),
      deletedAt: null,
    })
  }
}

