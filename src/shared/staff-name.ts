/** Фамилия из полного ФИО, если не задана отдельно. */
export function deriveSurname(fullName: string, surname?: string | null): string {
  if (surname?.trim()) return surname.trim()
  return fullName.trim().split(/\s+/).filter(Boolean)[0] ?? ''
}

/**
 * Краткое имя для сопоставления с Excel/ФГИС:
 * «Судницын Алексей Владимирович» → «Судницын А.В.»
 */
export function deriveShortName(
  fullName: string,
  surname?: string | null,
): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  const sur = deriveSurname(fullName, surname)
  if (parts.length === 1) return sur
  const initials = parts
    .slice(1)
    .map((p) => `${p.charAt(0).toUpperCase()}.`)
    .join('')
  return initials ? `${sur} ${initials}` : sur
}
