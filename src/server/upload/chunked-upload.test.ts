import { describe, expect, it } from 'vitest'
import {
  createPendingUpload,
  putChunk,
  takeAssembledUpload,
  UPLOAD_CHUNK_SIZE,
} from '@/server/upload/chunked-upload'
import { encodeBase64 } from '@/shared/upload/chunks'

describe('chunked upload', () => {
  it('собирает файл из нескольких чанков', () => {
    const store = new Map()
    const payload = new Uint8Array(UPLOAD_CHUNK_SIZE + 40)
    for (let i = 0; i < payload.length; i++) payload[i] = i % 251

    const session = createPendingUpload('staff-1', {
      fileName: 'a.xlsx',
      totalBytes: payload.byteLength,
      purpose: 'protocol_source',
    })
    store.set(session.id, session)
    expect(session.totalChunks).toBe(2)

    for (let i = 0; i < session.totalChunks; i++) {
      const begin = i * session.chunkSize
      const end = Math.min(begin + session.chunkSize, payload.byteLength)
      const res = putChunk(store, 'staff-1', {
        uploadId: session.id,
        chunkIndex: i,
        contentBase64: encodeBase64(payload.subarray(begin, end)),
      })
      if (i < session.totalChunks - 1) expect(res.complete).toBe(false)
      else expect(res.complete).toBe(true)
    }

    const assembled = takeAssembledUpload(
      store,
      'staff-1',
      session.id,
      'protocol_source',
    )
    expect(new Uint8Array(assembled.bytes)).toEqual(payload)
    expect(store.has(session.id)).toBe(false)
  })

  it('отклоняет чужую сессию', () => {
    const store = new Map()
    const session = createPendingUpload('staff-1', {
      fileName: 'a.pdf',
      totalBytes: 10,
      purpose: 'protocol_scan',
    })
    store.set(session.id, session)
    expect(() =>
      putChunk(store, 'staff-2', {
        uploadId: session.id,
        chunkIndex: 0,
        contentBase64: encodeBase64(new Uint8Array(10)),
      }),
    ).toThrow(/не найдена/i)
  })
})
