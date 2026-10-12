import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AppLayout } from '@/layouts/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { RegistryPage } from '@/pages/RegistryPage'
import { ProtocolCardPage } from '@/pages/ProtocolCardPage'
import { UploadPage } from '@/pages/UploadPage'
import { ExportPage } from '@/pages/ExportPage'
import { DictionariesPage } from '@/pages/DictionariesPage'
import { UsersSettingsPage } from '@/pages/UsersSettingsPage'
import { JournalPage } from '@/pages/JournalPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { useAuth } from '@/client/auth-context'

function RequireSession({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  if (!session) return <Navigate to="/login" replace />
  return children
}

function RequireHead({ children }: { children: ReactNode }) {
  const { capabilities } = useAuth()
  if (!capabilities?.canManageUsers) return <Navigate to="/" replace />
  return children
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireSession>
              <AppLayout />
            </RequireSession>
          }
        >
          <Route index element={<RegistryPage />} />
          <Route path="protocols/:protocolId" element={<ProtocolCardPage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="export" element={<ExportPage />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="dictionaries" element={<DictionariesPage />} />
          <Route
            path="settings"
            element={
              <RequireHead>
                <UsersSettingsPage />
              </RequireHead>
            }
          />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
