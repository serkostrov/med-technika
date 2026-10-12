import { useCallback, useState } from 'react'
import { PROTOCOL_STATUS_LABELS } from '@/domain'
import { useToast } from '@/shared/ui/toast'
import { MetaSep } from '@/shared/ui/icons'
import { EmptyState } from '@/shared/ui/states'
import { apiFetchJson } from '@/client/dictionaries-api'
import { uploadFileInChunks } from '@/client/chunked-upload'
import type { ParsedProtocol } from '@/parser'

type ProgressItem = { stage: string; message: string }

type ParseResponse = {
  sha256: string
  sourcePath: string
  alreadyUploaded: { protocolId: string; number: string } | null
  replaceCandidate: { protocolId: string; number: string; status: string } | null
  parsed: ParsedProtocol | null
  error: string | null
  progress: ProgressItem[]
  matching: {
    customerId: string | null
    customerName: string | null
    engineerStaffId: string | null
    unmatchedResults: string[]
    unmatchedEquipment: string[]
  } | null
}

type FileCard = {
  id: string
  fileName: string
  status: 'uploading' | 'parsing' | 'ready' | 'saved' | 'error' | 'duplicate'
  progress: ProgressItem[]
  uploadPercent: number | null
  result: ParseResponse | null
  error: string | null
}

export function UploadPage() {
  const { notify } = useToast()
  const [cards, setCards] = useState<FileCard[]>([])
  const [dragOver, setDragOver] = useState(false)

  const updateCard = useCallback((id: string, patch: Partial<FileCard>) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }, [])

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = [...files].filter((f) => /\.xlsx?$/i.test(f.name))
      if (list.length === 0) {
        notify('Нужны файлы .xlsx', 'error')
        return
      }

      for (const file of list) {
        const id = crypto.randomUUID()
        setCards((prev) => [
          {
            id,
            fileName: file.name,
            status: 'uploading',
            progress: [{ stage: 'start', message: 'Передача файла…' }],
            uploadPercent: 0,
            result: null,
            error: null,
          },
          ...prev,
        ])

        try {
          const { uploadId } = await uploadFileInChunks(
            file,
            'protocol_source',
            (ratio) => {
              const pct = Math.round(ratio * 100)
              updateCard(id, {
                status: 'uploading',
                uploadPercent: pct,
                progress: [
                  {
                    stage: 'upload',
                    message: `Передача файла… ${pct}%`,
                  },
                ],
              })
            },
          )

          updateCard(id, {
            status: 'parsing',
            uploadPercent: 100,
            progress: [
              { stage: 'upload', message: 'Файл передан' },
              { stage: 'parse', message: 'Разбор протокола…' },
            ],
          })

          const result = await apiFetchJson<ParseResponse>('/rpc/parse_protocol', {
            method: 'POST',
            body: JSON.stringify({
              fileName: file.name,
              uploadId,
            }),
          })

          if (result.alreadyUploaded) {
            updateCard(id, {
              status: 'duplicate',
              result,
              progress: result.progress,
              error: result.error,
            })
            notify(result.error ?? 'Файл уже загружен', 'info')
            continue
          }

          if (result.error || !result.parsed) {
            updateCard(id, {
              status: 'error',
              result,
              progress: result.progress,
              error: result.error,
            })
            notify(result.error ?? 'Разбор не удался', 'error')
            continue
          }

          updateCard(id, {
            status: 'ready',
            result,
            progress: result.progress,
            error: null,
          })
        } catch (err) {
          updateCard(id, {
            status: 'error',
            error: err instanceof Error ? err.message : 'Ошибка',
            uploadPercent: null,
            progress: [{ stage: 'error', message: 'Сбой загрузки или разбора' }],
          })
          notify(err instanceof Error ? err.message : 'Ошибка', 'error')
        }
      }
    },
    [notify, updateCard],
  )

  async function saveCard(card: FileCard, replace: boolean) {
    if (!card.result?.parsed) return
    try {
      await apiFetchJson('/rpc/protocol_save_parsed', {
        method: 'POST',
        body: JSON.stringify({
          sourcePath: card.result.sourcePath,
          sha256: card.result.sha256,
          parsed: card.result.parsed,
          replaceProtocolId: replace
            ? card.result.replaceCandidate?.protocolId
            : null,
          createCustomer: true,
        }),
      })
      updateCard(card.id, { status: 'saved' })
      notify(
        replace ? 'Протокол заменён' : 'Протокол сохранён (статус «На проверке»)',
        'success',
      )
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка сохранения', 'error')
    }
  }

  return (
    <div className="page page--wide">
      <h1>Загрузка</h1>
      <p className="muted">
        Один Excel-файл — один протокол. Данные измерений из файла не правятся.
      </p>

      <div
        className={dragOver ? 'dropzone dropzone--active' : 'dropzone'}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void processFiles(e.dataTransfer.files)
        }}
      >
        <EmptyState
          title="Перетащите протоколы сюда"
          description="или выберите файлы .xlsx"
          action={
            <label className="file-btn">
              <input
                type="file"
                accept=".xlsx,.xls"
                multiple
                onChange={(e) => {
                  if (e.target.files) void processFiles(e.target.files)
                  e.target.value = ''
                }}
              />
              Выбрать файлы
            </label>
          }
        />
      </div>

      <div className="upload-cards">
        {cards.map((card) => (
          <article key={card.id} className="upload-card">
            <header>
              <strong>{card.fileName}</strong>
              <span className={`badge badge--${card.status === 'uploading' ? 'parsing' : card.status}`}>
                {statusLabel(card.status)}
              </span>
            </header>
            {card.uploadPercent != null && card.status === 'uploading' && (
              <div
                className="upload-progress"
                role="progressbar"
                aria-valuenow={card.uploadPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="upload-progress__bar"
                  style={{ width: `${card.uploadPercent}%` }}
                />
              </div>
            )}
            <ul className="progress-log">
              {card.progress.map((p, i) => (
                <li key={`${p.stage}-${i}`}>{p.message}</li>
              ))}
            </ul>
            {card.result?.parsed && (
              <div className="parse-summary">
                <p className="page__meta">
                  Форма: {card.result.parsed.formTitle}
                  <MetaSep />
                  № {card.result.parsed.metadata.number}
                  <MetaSep />
                  объектов {card.result.parsed.objects.length}
                  <MetaSep />
                  результатов {card.result.parsed.results.length}
                  <MetaSep />
                  СИ{' '}
                  {
                    card.result.parsed.equipment.filter((e) => e.kind === 'si')
                      .length
                  }
                </p>
                {card.result.matching && (
                  <p className="muted small">
                    Не сопоставлено: показателей{' '}
                    {card.result.matching.unmatchedResults.length}, СИ{' '}
                    {card.result.matching.unmatchedEquipment.length}
                  </p>
                )}
              </div>
            )}
            {card.error && <p className="issue issue--error">{card.error}</p>}
            {card.status === 'ready' && card.result?.parsed && (
              <div className="upload-actions">
                {card.result.replaceCandidate ? (
                  <>
                    <p className="muted small">
                      Протокол {card.result.replaceCandidate.number} уже есть
                      (статус «
                      {PROTOCOL_STATUS_LABELS[
                        card.result.replaceCandidate
                          .status as keyof typeof PROTOCOL_STATUS_LABELS
                      ] ?? card.result.replaceCandidate.status}
                      »). Заменить до выгрузки?
                    </p>
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => void saveCard(card, true)}
                    >
                      Заменить протокол
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => void saveCard(card, false)}
                  >
                    Сохранить
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}

function statusLabel(s: FileCard['status']): string {
  switch (s) {
    case 'uploading':
      return 'Загрузка…'
    case 'parsing':
      return 'Разбор…'
    case 'ready':
      return 'Готов к сохранению'
    case 'saved':
      return 'Сохранён'
    case 'duplicate':
      return 'Уже загружен'
    default:
      return 'Ошибка'
  }
}
