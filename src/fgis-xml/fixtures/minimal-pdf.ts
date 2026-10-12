/**
 * Минимальный валидный PDF для тестов скана/XML.
 */
export function minimalPdfBytes(label = 'test'): ArrayBuffer {
  const text = `%PDF-1.4\n%${label}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`
  const bytes = new TextEncoder().encode(text)
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  return ab
}

export function minimalPdfBase64(label = 'test'): string {
  const bytes = new Uint8Array(minimalPdfBytes(label))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}
