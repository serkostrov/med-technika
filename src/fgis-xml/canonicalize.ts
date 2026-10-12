/**
 * Канонизация XML для сравнения с эталоном (ТЗ §10.2 / §18):
 * — удалить Content;
 * — отсортировать EquipmentDetails по EquipmentId;
 * — нормализовать пробелы между тегами.
 */
export function canonicalizeFgisXml(xml: string): string {
  let out = xml.replace(/\r\n/g, '\n')
  out = out.replace(/<Content>[\s\S]*?<\/Content>/g, '<Content></Content>')

  out = out.replace(
    /<Equipment>([\s\S]*?)<\/Equipment>/g,
    (_m, inner: string) => {
      const details = [
        ...inner.matchAll(
          /<EquipmentDetails>[\s\S]*?<\/EquipmentDetails>/g,
        ),
      ].map((x) => x[0]!)
      details.sort((a, b) => {
        const idA = /<EquipmentId>(.*?)<\/EquipmentId>/.exec(a)?.[1] ?? ''
        const idB = /<EquipmentId>(.*?)<\/EquipmentId>/.exec(b)?.[1] ?? ''
        return idA.localeCompare(idB, 'en', { numeric: true })
      })
      return `<Equipment>${details.join('')}</Equipment>`
    },
  )

  // убрать пробелы/переводы между тегами
  out = out.replace(/>\s+</g, '><')
  return out.trim()
}

export function xmlEqualCanonically(a: string, b: string): boolean {
  return canonicalizeFgisXml(a) === canonicalizeFgisXml(b)
}

/** Diff первой отличающейся позиции (для тестов). */
export function firstCanonicalDiff(
  actual: string,
  expected: string,
): string | null {
  const a = canonicalizeFgisXml(actual)
  const b = canonicalizeFgisXml(expected)
  if (a === b) return null
  const max = Math.min(a.length, b.length)
  let i = 0
  while (i < max && a[i] === b[i]) i += 1
  const ctx = 60
  return (
    `diff@${i}:\n` +
    ` actual: …${a.slice(Math.max(0, i - ctx), i + ctx)}…\n` +
    ` expect: …${b.slice(Math.max(0, i - ctx), i + ctx)}…`
  )
}
