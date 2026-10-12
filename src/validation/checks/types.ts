import {
  IssueSeverity,
  type ProtocolIssue,
} from '@/domain'
import type { Database } from '@/server/db/database'

type Severity = (typeof IssueSeverity)[keyof typeof IssueSeverity]

/** Коды ТЗ §8. W04 в ТЗ отсутствует (нумерация W01–W03, W05–W07). */
export type CheckCode =
  | 'E01'
  | 'E02'
  | 'E03'
  | 'E04'
  | 'E05'
  | 'E06'
  | 'E07'
  | 'E08'
  | 'E09'
  | 'E10'
  | 'E11'
  | 'E12'
  | 'E13'
  | 'E14'
  | 'E15'
  | 'W01'
  | 'W02'
  | 'W03'
  | 'W05'
  | 'W06'
  | 'W07'

export type CheckFinding = {
  code: CheckCode
  defaultSeverity: Severity
  message: string
  ref?: Record<string, unknown> | null
}

export function getSeverityOverrides(
  db: Database,
): Partial<Record<CheckCode, Severity>> {
  const raw = db.settings.find((s) => s.key === 'severity_overrides')?.value
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Partial<Record<CheckCode, Severity>>
  }
  return {}
}

/** Уровень из settings.severity_overrides; иначе default из ТЗ. */
export function resolveSeverity(
  db: Database,
  code: CheckCode,
  defaultSeverity: Severity,
): Severity {
  const over = getSeverityOverrides(db)[code]
  return over ?? defaultSeverity
}

/** Стабильный ключ замечания для переноса «к сведению» между прогонами. */
export function findingFingerprint(
  code: string,
  message: string,
  ref: Record<string, unknown> | null | undefined,
): string {
  return `${code}\0${message}\0${JSON.stringify(ref ?? null)}`
}

/**
 * Деактивировать старые активные замечания и создать новые.
 * Физически не удаляем (ТЗ §8).
 * Признание warning («к сведению») переносится на совпадающие findings.
 */
export function applyFindings(
  db: Database,
  protocolId: string,
  findings: CheckFinding[],
  now = new Date().toISOString(),
): ProtocolIssue[] {
  const prevActive = db.protocolIssues.filter(
    (i) => i.protocolId === protocolId && i.isActive,
  )
  const prevByFp = new Map(
    prevActive.map((i) => [
      findingFingerprint(i.code, i.message, i.ref),
      i,
    ]),
  )

  for (const issue of prevActive) {
    issue.isActive = false
  }

  const created: ProtocolIssue[] = []
  for (const f of findings) {
    const severity = resolveSeverity(db, f.code, f.defaultSeverity)
    const prev = prevByFp.get(
      findingFingerprint(f.code, f.message, f.ref),
    )
    const canReuseAck =
      severity === IssueSeverity.warning &&
      prev != null &&
      prev.acknowledgedAt != null

    const issue: ProtocolIssue = {
      id: crypto.randomUUID(),
      protocolId,
      code: f.code,
      severity,
      message: f.message,
      ref: f.ref ?? null,
      acknowledgedBy: canReuseAck ? prev.acknowledgedBy : null,
      acknowledgedAt: canReuseAck ? prev.acknowledgedAt : null,
      ackComment: canReuseAck ? prev.ackComment : null,
      isActive: true,
      createdAt: now,
    }
    db.protocolIssues.push(issue)
    created.push(issue)
  }
  return created
}

export function setSeverityOverride(
  db: Database,
  checkCode: CheckCode,
  severity: Severity,
): void {
  const existing = db.settings.find((s) => s.key === 'severity_overrides')
  const map = {
    ...(existing && typeof existing.value === 'object' && existing.value
      ? (existing.value as Record<string, string>)
      : {}),
    [checkCode]: severity,
  }
  if (existing) {
    existing.value = map
  } else {
    db.settings.push({ key: 'severity_overrides', value: map })
  }
}

export { IssueSeverity }
