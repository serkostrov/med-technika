import { useEffect } from 'react'
import { onPersistFailure } from '@/client/db-persist'
import { useToast } from '@/shared/ui/toast'

/**
 * Связывает ошибки локального снимка БД с toast.
 * Должен жить внутри ToastProvider.
 */
export function PersistFailureBridge() {
  const { notify } = useToast()

  useEffect(() => {
    return onPersistFailure((error) => {
      const msg = error.message || 'Не удалось сохранить данные локально'
      notify(
        msg.includes('поврежд')
          ? msg
          : `Не удалось сохранить данные локально: ${msg}`,
        'error',
      )
    })
  }, [notify])

  return null
}
