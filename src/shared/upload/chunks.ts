/** Размер бинарного чанка (~256 КБ). Base64 в запросе ~340 КБ. */
export const UPLOAD_CHUNK_SIZE = 256 * 1024

export type UploadPurpose = 'protocol_source' | 'protocol_scan'

export function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function decodeBase64(b64: string): Uint8Array {
  if (!b64) return new Uint8Array(0)
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}
