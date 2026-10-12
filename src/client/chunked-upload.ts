import { apiFetchJson } from '@/client/dictionaries-api'
import {
  encodeBase64,
  UPLOAD_CHUNK_SIZE,
  type UploadPurpose,
} from '@/shared/upload/chunks'

type InitResponse = {
  uploadId: string
  chunkSize: number
  totalChunks: number
}

/** Сколько чанков отправляем параллельно. */
const CONCURRENCY = 3

/**
 * Почанковая загрузка файла на сервер.
 * Возвращает uploadId для последующего parse / attach_scan.
 */
export async function uploadFileInChunks(
  file: File,
  purpose: UploadPurpose,
  onProgress?: (ratio: number) => void,
): Promise<{ uploadId: string; fileName: string }> {
  const init = await apiFetchJson<InitResponse>('/rpc/upload_init', {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      totalBytes: file.size,
      purpose,
    }),
  })

  const chunkSize = init.chunkSize || UPLOAD_CHUNK_SIZE
  const totalChunks = init.totalChunks
  let uploaded = 0

  try {
    const indices = Array.from({ length: totalChunks }, (_, i) => i)

    for (let start = 0; start < indices.length; start += CONCURRENCY) {
      const batch = indices.slice(start, start + CONCURRENCY)
      await Promise.all(
        batch.map(async (chunkIndex) => {
          const begin = chunkIndex * chunkSize
          const end = Math.min(begin + chunkSize, file.size)
          const slice = file.slice(begin, end)
          const buf = new Uint8Array(await slice.arrayBuffer())
          await apiFetchJson('/rpc/upload_chunk', {
            method: 'POST',
            body: JSON.stringify({
              uploadId: init.uploadId,
              chunkIndex,
              contentBase64: encodeBase64(buf),
            }),
          })
          uploaded += 1
          onProgress?.(totalChunks === 0 ? 1 : uploaded / totalChunks)
        }),
      )
    }

    onProgress?.(1)
    return { uploadId: init.uploadId, fileName: file.name }
  } catch (err) {
    try {
      await apiFetchJson('/rpc/upload_abort', {
        method: 'POST',
        body: JSON.stringify({ uploadId: init.uploadId }),
      })
    } catch {
      /* ignore abort errors */
    }
    throw err
  }
}
