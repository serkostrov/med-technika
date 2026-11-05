import { ErrorBoundary } from '@/shared/ui/error-boundary'
import { ToastProvider } from '@/shared/ui/toast'
import { AuthProvider } from '@/client/auth-context'
import { PersistFailureBridge } from '@/client/PersistFailureBridge'
import { AppRouter } from './router'

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <PersistFailureBridge />
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}
