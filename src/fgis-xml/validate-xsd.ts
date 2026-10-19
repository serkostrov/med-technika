import {
  PROTOCOL_CHILD_SEQUENCE,
  RESEARCH_INFO_SEQUENCE,
} from './xsd/schema'

export type XsdValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] }

/**
 * Структурная проверка XML по sequence из XSD (ТЗ §10.2).
 * Полноценный libxml не подключаем — правила читаются из schema.ts.
 */
export function validateAgainstFgisXsd(xml: string): XsdValidationResult {
  const errors: string[] = []

  if (!xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')) {
    errors.push('Ожидается заголовок UTF-8: <?xml version="1.0" encoding="utf-8"?>')
  }
  if (!/<root>/.test(xml) || !/<\/root>/.test(xml)) {
    errors.push('Корневой элемент root обязателен')
  }

  const protocols = [...xml.matchAll(/<protocol>([\s\S]*?)<\/protocol>/g)]
  if (protocols.length === 0) {
    errors.push('Нет элементов protocol')
  }
  if (protocols.length > 100) {
    errors.push('Более 100 protocol в пакете')
  }

  for (let i = 0; i < protocols.length; i++) {
    const body = protocols[i]![1]!
    validateProtocolBody(body, i + 1, errors)
  }

  return errors.length ? { ok: false, errors } : { ok: true }
}

function validateProtocolBody(body: string, index: number, errors: string[]): void {
  const topChildren = topLevelChildNames(body)
  const allowed = new Set<string>(PROTOCOL_CHILD_SEQUENCE)
  const filtered = topChildren.filter((n) => allowed.has(n))

  // AddressID и Address — choice: ровно один
  const hasAddrId = filtered.includes('AddressID')
  const hasAddr = filtered.includes('Address')
  if (hasAddrId === hasAddr) {
    errors.push(
      `protocol[${index}]: нужен ровно один из AddressID | Address`,
    )
  }

  const expectedOrder = PROTOCOL_CHILD_SEQUENCE.filter((name) => {
    if (name === 'AddressID') return hasAddrId
    if (name === 'Address') return hasAddr
    if (name === 'AccredScope353') return filtered.includes('AccredScope353')
    if (name === 'ModelGetDate') return filtered.includes('ModelGetDate')
    if (name === 'ResearchObject') return false // repeats — check separately
    return true
  })

  const withoutResearch = filtered.filter((n) => n !== 'ResearchObject')
  if (!sequenceMatches(withoutResearch, expectedOrder)) {
    errors.push(
      `protocol[${index}]: нарушен XSD sequence. ` +
        `Ожидалось [${expectedOrder.join(', ')}], получено [${withoutResearch.join(', ')}]`,
    )
  }

  if (!filtered.includes('ResearchObject')) {
    errors.push(`protocol[${index}]: нет ResearchObject`)
  }

  // обязательные константы
  if (!body.includes('<DataStatusId>20</DataStatusId>')) {
    errors.push(`protocol[${index}]: DataStatusId должен быть 20`)
  }
  if (!body.includes('<ProtocolStatusId>6</ProtocolStatusId>')) {
    errors.push(`protocol[${index}]: ProtocolStatusId должен быть 6`)
  }

  const researches = [
    ...body.matchAll(
      /<ResearchObjectInfo>([\s\S]*?)<\/ResearchObjectInfo>/g,
    ),
  ]
  for (let r = 0; r < researches.length; r++) {
    const names = topLevelChildNames(researches[r]![1]!)
    if (!sequenceMatches(names, [...RESEARCH_INFO_SEQUENCE])) {
      errors.push(
        `protocol[${index}] ResearchObjectInfo[${r + 1}]: нарушен sequence ` +
          `[${RESEARCH_INFO_SEQUENCE.join(', ')}]`,
      )
    }
  }
}

function topLevelChildNames(xmlFragment: string): string[] {
  const names: string[] = []
  const re = /<([A-Za-z][\w]*)(?:\s[^>]*)?>/g
  let depth = 0
  let m: RegExpExecArray | null
  const selfClosing = /<([A-Za-z][\w]*)(?:\s[^>]*)?\/>/g
  // walk tags
  const tagRe = /<\/?([A-Za-z][\w]*)(?:\s[^>]*)?\/?>/g
  while ((m = tagRe.exec(xmlFragment))) {
    const full = m[0]
    const name = m[1]!
    if (full.startsWith('</')) {
      depth -= 1
      continue
    }
    if (full.endsWith('/>')) {
      if (depth === 0) names.push(name)
      continue
    }
    if (depth === 0) names.push(name)
    depth += 1
  }
  void re
  void selfClosing
  return names
}

function sequenceMatches(actual: string[], expected: string[]): boolean {
  if (actual.length !== expected.length) return false
  return actual.every((n, i) => n === expected[i])
}
