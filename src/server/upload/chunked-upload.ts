import { DomainError } from '@/domain'
import {
  decodeBase64,
  UPLOAD_CHUNK_SIZE,
  type UploadPurpose,
} from '@/shared/upload/chunks'

export { UPLOAD_CHUNK_SIZE, type UploadPurpose } from '@/shared/upload/chunks'

/** Сессии незавершённых загрузок живут 1 час. */
const UPLOAD_TTL_MS = 60 * 60 * 1000

export type PendingUpload = {
  id: string
  staffId: string
  fileName: string
  purpose: UploadPurpose
  totalBytes: number
  chunkSize: number
  totalChunks: number
  chunks: Map<number, Uint8Array>
  createdAt: number
  receivedBytes: number
}

export type ChunkedUploadStore = Map<string, PendingUpload>

export function createPendingUpload(
  staffId: string,
  input: { fileName: string; totalBytes: number; purpose: UploadPurpose },
): PendingUpload {
  const fileName = input.fileName?.trim()
  if (!fileName) {
    throw new DomainError('Не указано имя файла', 'UPLOAD_NO_NAME')
  }
  if (!Number.isFinite(input.totalBytes) || input.totalBytes < 0) {
    throw new DomainError('Некорректный размер файла', 'UPLOAD_BAD_SIZE')
  }
  if (input.purpose !== 'protocol_source' && input.purpose !== 'protocol_scan') {
    throw new DomainError('Неизвестный тип загрузки', 'UPLOAD_BAD_PURPOSE')
  }

  const totalChunks =
    input.totalBytes === 0 ? 1 : Math.ceil(input.totalBytes / UPLOAD_CHUNK_SIZE)

  return {
    id: crypto.randomUUID(),
    staffId,
    fileName,
    purpose: input.purpose,
    totalBytes: input.totalBytes,
    chunkSize: UPLOAD_CHUNK_SIZE,
    totalChunks,
    chunks: new Map(),
    createdAt: Date.now(),
    receivedBytes: 0,
  }
}

export function putChunk(
  store: ChunkedUploadStore,
  staffId: string,
  input: { uploadId: string; chunkIndex: number; contentBase64: string },
): { receivedChunks: number; totalChunks: number; complete: boolean } {
  purgeExpired(store)
  const session = store.get(input.uploadId)
  if (!session || session.staffId !== staffId) {
    throw new DomainError('Сессия загрузки не найдена', 'UPLOAD_NOT_FOUND')
  }

  const index = input.chunkIndex
  if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks) {
    throw new DomainError('Некорректный номер чанка', 'UPLOAD_BAD_CHUNK')
  }

  let bytes: Uint8Array
  try {
    bytes = decodeBase64(input.contentBase64)
  } catch {
    throw new DomainError('Повреждённые данные чанка', 'UPLOAD_BAD_CHUNK')
  }

  const isLast = index === session.totalChunks - 1
  const expected = isLast
    ? session.totalBytes - index * session.chunkSize
    : session.chunkSize
  if (session.totalBytes === 0) {
    if (bytes.byteLength !== 0) {
      throw new DomainError('Неожиданный размер чанка', 'UPLOAD_BAD_CHUNK')
    }
  } else if (bytes.byteLength !== expected) {
    throw new DomainError(
      `Неожиданный размер чанка ${index}: ${bytes.byteLength}, ожидали ${expected}`,
      'UPLOAD_BAD_CHUNK',
    )
  }

  if (!session.chunks.has(index)) {
    session.receivedBytes += bytes.byteLength
  }
  session.chunks.set(index, bytes)

  const complete = session.chunks.size === session.totalChunks
  return {
    receivedChunks: session.chunks.size,
    totalChunks: session.totalChunks,
    complete,
  }
}

/** Собирает файл и удаляет сессию. */
export function takeAssembledUpload(
  store: ChunkedUploadStore,
  staffId: string,
  uploadId: string,
  expectedPurpose: UploadPurpose,
): { fileName: string; bytes: ArrayBuffer } {
  purgeExpired(store)
  const session = store.get(uploadId)
  if (!session || session.staffId !== staffId) {
    throw new DomainError('Сессия загрузки не найдена', 'UPLOAD_NOT_FOUND')
  }
  if (session.purpose !== expectedPurpose) {
    throw new DomainError('Неверный тип загрузки', 'UPLOAD_BAD_PURPOSE')
  }
  if (session.chunks.size !== session.totalChunks) {
    throw new DomainError(
      `Загрузка не завершена: ${session.chunks.size}/${session.totalChunks}`,
      'UPLOAD_INCOMPLETE',
    )
  }

  const out = new Uint8Array(session.totalBytes)
  let offset = 0
  for (let i = 0; i < session.totalChunks; i++) {
    const part = session.chunks.get(i)
    if (!part) {
      throw new DomainError('Загрузка не завершена', 'UPLOAD_INCOMPLETE')
    }
    out.set(part, offset)
    offset += part.byteLength
  }
  if (offset !== session.totalBytes) {
    throw new DomainError('Размер собранного файла не совпал', 'UPLOAD_SIZE_MISMATCH')
  }

  store.delete(uploadId)
  return {
    fileName: session.fileName,
    bytes: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength),
  }
}

export function abortUpload(
  store: ChunkedUploadStore,
  staffId: string,
  uploadId: string,
): void {
  const session = store.get(uploadId)
  if (session && session.staffId === staffId) {
    store.delete(uploadId)
  }
}

function purgeExpired(store: ChunkedUploadStore): void {
  const now = Date.now()
  for (const [id, session] of store) {
    if (now - session.createdAt > UPLOAD_TTL_MS) {
      store.delete(id)
    }
  }
}
