import type { FormIndicatorMap, ProtocolForm } from '@/domain'
import { detectForm } from './form-detect'
import { parseHeader } from './header'
import { loadWorkbookGrids } from './workbook'
import { normalizeSheetName } from './sheet-utils'
import { assertFormReadyForParse, runProfile } from './profiles/registry'
import { PARSER_VERSION } from './version'
import {
  ParseError,
  type FormDetectionResult,
  type ParsedProtocol,
  type ParseProgressEvent,
} from './types'

export type ParseProtocolInput = {
  data: ArrayBuffer
  forms: readonly ProtocolForm[]
  indicatorMaps: readonly FormIndicatorMap[]
  recalcTolerance?: number
  preferredSheetName?: string | null
  onProgress?: (e: ParseProgressEvent) => void
}

/**
 * parse-protocol: разбор без записи в БД (ТЗ §6.1, §14).
 * При критической ошибке — ParseError, частичный протокол не создаётся.
 */
export function parseProtocol(input: ParseProtocolInput): ParsedProtocol {
  const {
    data,
    forms,
    indicatorMaps,
    recalcTolerance = 1e-6,
    preferredSheetName = null,
    onProgress,
  } = input

  const emit = (stage: string, message: string) =>
    onProgress?.({ stage, message })

  emit('load', 'Чтение Excel…')
  const grids = loadWorkbookGrids(data)
  if (grids.length === 0) {
    throw new ParseError('Файл не распознан: пустая книга Excel')
  }

  emit('detect', 'Определение формы…')
  const detection = detectForm(grids, forms, preferredSheetName)
  if (!detection.ok) {
    throw new ParseError(detection.reason, 'FORM_NOT_DETECTED')
  }

  const form = forms.find((f) => f.id === detection.candidate.formId)
  if (!form) {
    throw new ParseError('Файл не распознан: форма не найдена в справочнике')
  }
  assertFormReadyForParse(form)

  const grid = grids.find(
    (g) =>
      normalizeSheetName(g.name) ===
      normalizeSheetName(detection.candidate.sheetName),
  )
  if (!grid) {
    throw new ParseError('Файл не распознан: лист формы отсутствует')
  }

  emit(
    'form',
    `Форма: ${form.title} · Протокол ${detection.candidate.number} от ${detection.candidate.protocolDate}`,
  )

  emit('header', 'Разбор шапки…')
  const header = parseHeader(grid)
  if (!header.metadata.number || !header.metadata.protocolDate) {
    throw new ParseError(
      'Файл не распознан: не удалось прочитать номер и дату протокола',
    )
  }

  const maps = indicatorMaps.filter((m) => m.formId === form.id)

  emit('results', `Разбор результатов (${form.parserProfile})…`)
  const profile = runProfile(
    form.parserProfile,
    grid,
    maps,
    recalcTolerance,
  )

  if (profile.results.length === 0) {
    throw new ParseError(
      'Файл не распознан: не найдены результаты измерений',
      'NO_RESULTS',
    )
  }

  const siCount = header.equipment.filter((e) => e.kind === 'si').length
  const auxCount = header.equipment.filter((e) => e.kind !== 'si').length

  const summary = `Форма: ${form.title} · Протокол ${header.metadata.number} от ${formatRu(header.metadata.protocolDate)} · аппаратов ${profile.objects.length} · результатов ${profile.results.length} · СИ ${siCount}${auxCount ? ` + вспомогательное ${auxCount}` : ''}`
  emit('done', summary)

  return {
    parserVersion: PARSER_VERSION,
    profileVersion: profile.profileVersion,
    formId: form.id,
    formTitle: form.title,
    parserProfile: form.parserProfile,
    sheetName: grid.name,
    metadata: header.metadata,
    objects: profile.objects,
    results: profile.results,
    equipment: header.equipment,
    log: [summary, ...header.log, ...profile.log],
  }
}

export function detectFormOnly(
  data: ArrayBuffer,
  forms: readonly ProtocolForm[],
): FormDetectionResult {
  const grids = loadWorkbookGrids(data)
  return detectForm(grids, forms)
}

function formatRu(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export { ParseError }
export type { ParsedProtocol, ParseProgressEvent }
