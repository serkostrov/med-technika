import { EquipmentKind } from '@/domain'
import { normalizeText } from '@/dictionaries/normalize/text'
import {
  COL,
  cellText,
  extractPhoneDigits,
  findAnchorRows,
  parseRuDate,
  valueRightOf,
  type SheetGrid,
} from './sheet-utils'
import type { ParsedEquipment, ParsedMetadata, ParsedNdRow } from './types'

const HEADER_SCAN_MAX = 40

function firstAnchorValue(grid: SheetGrid, anchors: string[]): string {
  const rows = findAnchorRows(grid, anchors)
  if (rows.length === 0) return ''
  return valueRightOf(grid, rows[0]!)
}

function collectListUntilNextAnchor(
  grid: SheetGrid,
  startRow: number,
  stopAnchors: string[],
): string[] {
  const stops = stopAnchors.map((a) => normalizeText(a).toLowerCase())
  const lines: string[] = []
  for (let r = startRow + 1; r <= grid.maxRow; r++) {
    const a = normalizeText(cellText(grid, r, COL.A)).toLowerCase()
    if (a && stops.some((s) => a.includes(s))) break
    const line = valueRightOf(grid, r) || cellText(grid, r, COL.A)
    // numbered list often in A itself
    const full =
      /^\d+[\).]/.test(cellText(grid, r, COL.A))
        ? cellText(grid, r, COL.A) +
          (valueRightOf(grid, r) ? ' ' + valueRightOf(grid, r) : '')
        : line
    if (full.trim()) lines.push(full.trim())
  }
  return lines
}

/**
 * Regex строки СИ (ТЗ §6.3 — группы как в демо parse.py).
 * наименование, зав.№, свидетельство, дата поверки, действительна до.
 */
const SI_LINE_RE =
  /^(.+?),\s*зав\.?\s*№\s*([^,]+?)(?:,\s*(?:свид(?:етельство)?\.?\s*(?:о\s*поверке)?\s*№?\s*([^,]+?))?)?(?:,\s*(?:от\s*)?(\d{2}\.\d{2}\.\d{4}))?(?:,?\s*действительн[ао]\s*до\s*(\d{2}\.\d{2}\.\d{4}))?/i

function parseSiLine(line: string): ParsedEquipment | null {
  const cleaned = line.replace(/^\d+[\).]\s*/, '').trim()
  if (!cleaned) return null
  const m = SI_LINE_RE.exec(cleaned)
  if (m) {
    return {
      seq: 0,
      kind: EquipmentKind.si,
      rawText: cleaned,
      name: m[1]?.trim() ?? null,
      serialRaw: m[2]?.trim() ?? null,
      certRaw: m[3]?.trim() ?? null,
      validUntilRaw: m[5] ? parseRuDate(m[5]) : null,
    }
  }
  // fallback: «наименование зав.№ N»
  const simple = /^(.*?)\s+зав\.?\s*№\s*(\S+)/i.exec(cleaned)
  if (simple) {
    return {
      seq: 0,
      kind: EquipmentKind.si,
      rawText: cleaned,
      name: simple[1]!.trim(),
      serialRaw: simple[2]!.trim(),
      certRaw: null,
      validUntilRaw: null,
    }
  }
  return {
    seq: 0,
    kind: EquipmentKind.si,
    rawText: cleaned,
    name: cleaned,
    serialRaw: null,
    certRaw: null,
    validUntilRaw: null,
  }
}

function parseAuxLine(line: string, kind: typeof EquipmentKind.aux | typeof EquipmentKind.test): ParsedEquipment {
  const cleaned = line.replace(/^\d+[\).]\s*/, '').trim()
  const simple = /^(.*?)\s+зав\.?\s*№\s*(\S+)/i.exec(cleaned)
  return {
    seq: 0,
    kind,
    rawText: cleaned,
    name: simple?.[1]?.trim() ?? cleaned,
    serialRaw: simple?.[2]?.trim() ?? null,
    certRaw: null,
    validUntilRaw: null,
  }
}

function parseMeasureDates(text: string): { start: string | null; end: string | null } {
  const range = /с\s*(\d{2}\.\d{2}\.\d{4})\s*по\s*(\d{2}\.\d{2}\.\d{4})/i.exec(text)
  if (range) {
    return { start: parseRuDate(range[1]!), end: parseRuDate(range[2]!) }
  }
  const one = parseRuDate(text)
  return { start: one, end: one }
}

function parsePlaceBlock(grid: SheetGrid, startRow: number): {
  place: string | null
  address: string | null
} {
  let place: string | null = null
  let address: string | null = null
  const first = valueRightOf(grid, startRow)
  if (first) place = first

  for (let r = startRow + 1; r <= Math.min(startRow + 6, grid.maxRow); r++) {
    const a = normalizeText(cellText(grid, r, COL.A)).toLowerCase()
    if (
      a.includes('наименование') ||
      a.includes('заказчик') ||
      a.includes('средства измер') ||
      a.includes('дата проведения') ||
      a.includes('протокол оформил')
    ) {
      break
    }
    if (a.startsWith('адрес')) {
      address = valueRightOf(grid, r) || null
      continue
    }
    const val = valueRightOf(grid, r) || cellText(grid, r, COL.A)
    if (/^\d{6}/.test(val)) {
      address = val
      continue
    }
    if (
      val &&
      !/корпус|этаж|кабинет|физиокабинет/i.test(val) &&
      !place
    ) {
      place = val
    }
  }
  return { place, address }
}

function parseConditions(grid: SheetGrid): ParsedMetadata['conditions'] {
  const conditions: ParsedMetadata['conditions'] = { voltages: [] }
  for (let r = 0; r <= grid.maxRow; r++) {
    const a = normalizeText(cellText(grid, r, COL.A)).toLowerCase()
    const val = valueRightOf(grid, r)
    const num = Number(val.replace(',', '.').replace(/[^\d.\-]/g, ''))
    if (a.includes('температура')) {
      if (Number.isFinite(num)) conditions.t = num
    } else if (a.includes('влажность')) {
      if (Number.isFinite(num)) conditions.rh = num
    } else if (a.includes('атмосферн') || a.includes('давление')) {
      if (Number.isFinite(num)) conditions.p = num
    } else if (a.includes('напряжение сети')) {
      const isStart = a.includes('начал')
      const isEnd = a.includes('конц')
      if (!conditions.voltages) conditions.voltages = []
      if (isStart) {
        conditions.voltages.push({ start: Number.isFinite(num) ? num : undefined })
      } else if (isEnd && conditions.voltages.length > 0) {
        conditions.voltages[conditions.voltages.length - 1]!.end = Number.isFinite(num)
          ? num
          : undefined
      } else if (Number.isFinite(num)) {
        conditions.voltages.push({ start: num })
      }
    }
  }
  return conditions
}

function parseNdTable(grid: SheetGrid): ParsedNdRow[] {
  const rows = findAnchorRows(grid, ['обозначение нд', 'обозначение'])
  if (rows.length === 0) return []
  const start = rows[0]!
  const out: ParsedNdRow[] = []
  for (let r = start + 1; r <= Math.min(start + 30, grid.maxRow); r++) {
    const a = cellText(grid, r, COL.A)
    if (!a) continue
    const low = normalizeText(a).toLowerCase()
    if (
      low.includes('средства измер') ||
      low.includes('условия') ||
      low.includes('результаты')
    ) {
      break
    }
    out.push({
      designation: a,
      name: cellText(grid, r, 2) || valueRightOf(grid, r),
      indicator: cellText(grid, r, 5) || '',
    })
  }
  return out
}

/**
 * Разбор шапки по текстовым якорям (ТЗ §6.3).
 */
export function parseHeader(grid: SheetGrid): {
  metadata: ParsedMetadata
  equipment: ParsedEquipment[]
  log: string[]
} {
  const log: string[] = []
  const equipment: ParsedEquipment[] = []

  // номер/дата уже известны из detect — перечитаем для полноты
  let number = ''
  let protocolDate = ''
  for (let r = 0; r <= 40; r++) {
    let line = ''
    for (let c = 0; c <= 20; c++) {
      const t = cellText(grid, r, c)
      if (t) line += (line ? ' ' : '') + t
    }
    const m = /Протокол\s*№\s*(\S+)\s+от\s+(\d{2}\.\d{2}\.\d{4})/i.exec(line)
    if (m) {
      number = m[1]!
      protocolDate = parseRuDate(m[2]!) ?? ''
      break
    }
  }

  const objectFullName =
    firstAnchorValue(grid, ['наименование объекта:', 'объект испытаний:']) ||
    null
  const customerName =
    firstAnchorValue(grid, [
      'наименование заказчика:',
      'заказчик испытаний:',
    ]) || null
  const customerLegalAddress =
    firstAnchorValue(grid, ['юридический адрес заказчика:']) || null
  const customerActualAddress =
    firstAnchorValue(grid, ['фактический адрес заказчика:']) || null
  const phoneRaw = firstAnchorValue(grid, ['контактные данные заказчика:'])
  const customerPhone = phoneRaw ? extractPhoneDigits(phoneRaw) : null

  const placeRows = findAnchorRows(grid, [
    'место проведения измерений:',
    'место проведения испытаний:',
  ])
  const placeBlock =
    placeRows.length > 0
      ? parsePlaceBlock(grid, placeRows[0]!)
      : { place: null, address: null }

  // рентген: отдельная строка «Адрес:»
  if (!placeBlock.address) {
    const addrRows = findAnchorRows(grid, ['адрес:'])
    if (addrRows.length > 0) {
      placeBlock.address = valueRightOf(grid, addrRows[0]!) || null
    }
  }

  const measureRaw = firstAnchorValue(grid, [
    'дата проведения измерений:',
    'дата проведения испытаний:',
  ])
  const measureDates = parseMeasureDates(measureRaw)

  const siRows = findAnchorRows(grid, [
    'средства измерения:',
    'средства измерений:',
  ])
  if (siRows.length > 0) {
    const lines = collectListUntilNextAnchor(grid, siRows[0]!, [
      'вспомогательное оборудование',
      'испытательное оборудование',
      'обозначение нд',
      'обозначение',
      'условия',
      'температура',
      'результаты',
    ])
    for (const line of lines) {
      const parsed = parseSiLine(line)
      if (parsed) equipment.push(parsed)
    }
    log.push(`СИ: найдено ${lines.length} строк`)
  }

  const auxRows = findAnchorRows(grid, ['вспомогательное оборудование:'])
  if (auxRows.length > 0) {
    const lines = collectListUntilNextAnchor(grid, auxRows[0]!, [
      'испытательное оборудование',
      'обозначение',
      'условия',
      'результаты',
    ])
    for (const line of lines) {
      equipment.push(parseAuxLine(line, EquipmentKind.aux))
    }
  }

  const testRows = findAnchorRows(grid, ['испытательное оборудование:'])
  if (testRows.length > 0) {
    const lines = collectListUntilNextAnchor(grid, testRows[0]!, [
      'обозначение',
      'условия',
      'результаты',
    ])
    for (const line of lines) {
      equipment.push(parseAuxLine(line, EquipmentKind.test))
    }
  }

  equipment.forEach((e, i) => {
    e.seq = i + 1
  })

  let engineerShortName: string | null = null
  const engRows = findAnchorRows(grid, ['протокол оформил:'])
  if (engRows.length > 0) {
    const r = engRows[0]!
    // последняя непустая ячейка строки
    for (let c = HEADER_SCAN_MAX; c >= 0; c--) {
      const t = cellText(grid, r, c)
      if (t && !normalizeText(t).toLowerCase().includes('протокол оформил')) {
        // «инженер Судницын А.В.» → берём как есть / хвост
        const m = /([А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.\s*[А-ЯЁ]\.)/.exec(t)
        engineerShortName = m?.[1] ?? t.replace(/^.*инженер\s+/i, '').trim()
        break
      }
    }
  } else {
    log.push('Якорь «Протокол оформил» не найден — ищем по профилю [УТОЧНИТЬ]')
  }

  const metadata: ParsedMetadata = {
    number,
    protocolDate,
    objectFullName,
    customerName,
    customerLegalAddress,
    customerActualAddress,
    customerPhone,
    measurePlace: placeBlock.place,
    measureAddress: placeBlock.address,
    measureStart: measureDates.start,
    measureEnd: measureDates.end,
    engineerShortName,
    conditions: parseConditions(grid),
    ndRows: parseNdTable(grid),
  }

  log.push(
    `Шапка: № ${number} от ${protocolDate}; заказчик=${customerName ?? '—'}; СИ=${equipment.filter((e) => e.kind === 'si').length}`,
  )

  return { metadata, equipment, log }
}