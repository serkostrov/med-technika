import type { Staff } from '@/domain'

/**
 * «Протокол оформил: … Судницын А.В.» → поиск по фамилии (+ инициалы при коллизии).
 */
export function matchEngineer(
  staff: readonly Staff[],
  shortName: string | null | undefined,
): Staff | null {
  if (!shortName?.trim()) return null
  const parts = shortName.trim().replace(/^инженер\s+/i, '').split(/\s+/)
  const surname = parts[0]?.toLowerCase()
  if (!surname) return null

  const candidates = staff.filter(
    (s) =>
      s.deletedAt === null &&
      s.isActive &&
      s.surname.toLowerCase() === surname,
  )
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]!

  const initials = shortName.match(/[А-ЯЁA-Z]\.\s*[А-ЯЁA-Z]\./i)?.[0]
  if (initials) {
    const norm = initials.replace(/\s/g, '').toLowerCase()
    const byInitials = candidates.filter((s) =>
      s.shortName.replace(/\s/g, '').toLowerCase().includes(norm),
    )
    if (byInitials.length === 1) return byInitials[0]!
  }
  return candidates[0]!
}
