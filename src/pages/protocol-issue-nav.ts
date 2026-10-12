import type { ProtocolIssue } from '@/domain'

export type ProtocolCardTab =
  | 'summary'
  | 'results'
  | 'equipment'
  | 'checks'
  | 'scan'
  | 'xml'
  | 'journal'

export type IssueNavTarget = {
  tab: ProtocolCardTab
  /** Значения data-focus для подсветки */
  focuses: string[]
}

const SUMMARY_CODES = new Set([
  'E01',
  'E06',
  'E07',
  'E08',
  'E09',
  'E10',
  'E11',
  'E13',
  'E14',
  'W01',
  'W05',
])

const EQUIPMENT_CODES = new Set(['E04', 'E05', 'W03'])

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x.length > 0)
}

/** Эвристика для старых issue без ref.fields (до пересчёта проверок). */
function inferSummaryFields(code: string, message: string): string[] {
  const m = message.toLowerCase()
  if (code === 'E06') return ['engineerStaffId']
  if (code === 'E09') return ['applicationDate', 'protocolDate']
  if (code === 'E11' || code === 'E10') return ['number', 'protocolDate']
  if (code === 'E13' || code === 'E14') return ['customerId']
  if (code === 'E08') return ['measureStart', 'measureEnd']
  if (code === 'E07') {
    if (m.includes('окончан')) return ['measureEnd', 'protocolDate']
    return ['measureStart', 'protocolDate']
  }
  if (code === 'E01') {
    if (m.includes('адрес')) return ['measureAddress']
    if (m.includes('исполнител')) return ['engineerStaffId']
    if (m.includes('заказчик')) return ['customerId']
    if (m.includes('объект')) return ['objectFullName']
    if (m.includes('измер')) return ['measureStart', 'measureEnd']
    if (m.includes('номер') || m.includes('дата протокол')) {
      return ['number', 'protocolDate']
    }
  }
  return []
}

/**
 * Куда вести при клике по ошибке/замечанию и что подсветить.
 */
export function resolveIssueNavigation(
  issue: Pick<ProtocolIssue, 'code' | 'message' | 'ref'>,
): IssueNavTarget {
  const ref = (issue.ref ?? {}) as Record<string, unknown>
  const resultId = typeof ref.resultId === 'string' ? ref.resultId : null
  const seq =
    typeof ref.seq === 'number'
      ? String(ref.seq)
      : typeof ref.seq === 'string'
        ? ref.seq
        : null
  const fields = asStringArray(ref.fields)
  const highlight = typeof ref.highlight === 'string' ? ref.highlight : null
  const refTab = typeof ref.tab === 'string' ? (ref.tab as ProtocolCardTab) : null

  if (resultId) {
    const focuses: string[] = [`results:row:${resultId}`]
    if (highlight === 'fact' || issue.code === 'E02' || issue.code === 'W02') {
      focuses.push(`results:fact:${resultId}`)
    }
    if (
      highlight === 'oa' ||
      issue.code === 'E03' ||
      issue.code === 'E12' ||
      issue.code === 'W07'
    ) {
      focuses.push(`results:oa:${resultId}`)
    }
    if (issue.code === 'E15') {
      focuses.push(`results:unit:${resultId}`)
    }
    // E12 также подсветить признак 353 в сводке — но вкладка results первична
    if (issue.code === 'E12' && fields.includes('accredScope353')) {
      // остаёмся на results с ОА; пользователь сам откроет сводку при необходимости
    }
    return { tab: 'results', focuses }
  }

  if (EQUIPMENT_CODES.has(issue.code)) {
    return {
      tab: 'equipment',
      focuses: seq
        ? [`equipment:row:${seq}`, `equipment:match:${seq}`]
        : [],
    }
  }

  if (refTab === 'results' || refTab === 'equipment') {
    return { tab: refTab, focuses: [] }
  }

  if (SUMMARY_CODES.has(issue.code) || fields.length > 0 || refTab === 'summary') {
    const summaryFields =
      fields.length > 0 ? fields : inferSummaryFields(issue.code, issue.message)
    // E01 «нет результатов/оборудования» без fields
    if (issue.code === 'E01' && summaryFields.length === 0) {
      const m = issue.message.toLowerCase()
      if (m.includes('результат')) return { tab: 'results', focuses: [] }
      if (m.includes('оборудован')) return { tab: 'equipment', focuses: [] }
    }
    return {
      tab: 'summary',
      focuses: summaryFields.map((f) => `summary:${f}`),
    }
  }

  return { tab: 'results', focuses: [] }
}

/** Подсветить элементы и прокрутить к первому. */
export function flashFocusTargets(focuses: string[]): void {
  if (focuses.length === 0) return
  const nodes = focuses
    .map((id) =>
      document.querySelector<HTMLElement>(`[data-focus="${CSS.escape(id)}"]`),
    )
    .filter((el): el is HTMLElement => el != null)
  if (nodes.length === 0) return

  nodes[0]!.scrollIntoView({ behavior: 'smooth', block: 'center' })
  for (const el of nodes) {
    el.classList.remove('is-flashing')
    // restart animation
    void el.offsetWidth
    el.classList.add('is-flashing')
  }
  window.setTimeout(() => {
    for (const el of nodes) el.classList.remove('is-flashing')
  }, 2400)
}
