import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { AppRole } from '@/domain'
import { uiCapabilities } from '@/security'
import {
  clearSession,
  fetchMe,
  getStoredToken,
  loginRequest,
} from '@/client/api'
import { resetSharedApi } from '@/client/shared-api'

type Session = {
  email: string
  role: AppRole
  staffId: string
}

type AuthContextValue = {
  session: Session | null
  capabilities: ReturnType<typeof uiCapabilities> | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthContextValue | null>(null)

function readSession(): Session | null {
  const raw = sessionStorage.getItem('mt.session')
  if (!raw || !getStoredToken()) return null
  try {
    const parsed = JSON.parse(raw) as Session
    if (parsed.role !== AppRole.head && parsed.role !== AppRole.engineer) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readSession())

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginRequest(email, password)
    setSession({
      email: result.email,
      role: result.role as AppRole,
      staffId: result.staffId,
    })
  }, [])

  const logout = useCallback(() => {
    clearSession()
    resetSharedApi()
    setSession(null)
  }, [])

  const refresh = useCallback(async () => {
    if (!getStoredToken()) {
      clearSession()
      setSession(null)
      return
    }
    const me = await fetchMe()
    if (!me) {
      clearSession()
      setSession(null)
      return
    }
    setSession({
      email: me.email,
      role: me.role as AppRole,
      staffId: me.staffId,
    })
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo<AuthContextValue>(() => {
    const capabilities = session
      ? uiCapabilities({
          authUserId: 'ui',
          staffId: session.staffId,
          role: session.role,
          email: session.email,
        })
      : null
    return { session, capabilities, login, logout, refresh }
  }, [session, login, logout, refresh])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth вне AuthProvider')
  return ctx
}
