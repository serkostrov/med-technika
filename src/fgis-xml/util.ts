/**
 * Телефон ФГИС: 8XXXXXXXXXX, IsRf=true (ТЗ §6.3, §10.2).
 */
export function toFgisPhone(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('8')) return digits
  if (digits.length === 11 && digits.startsWith('7')) return `8${digits.slice(1)}`
  if (digits.length === 10) return `8${digits}`
  return null
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
