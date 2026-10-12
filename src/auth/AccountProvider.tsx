// Who is using the dashboards. Demo mode: a mock account picker (NOT authentication).
// Supabase mode: the real Supabase Auth session, with the role read from platform_admins / business_members.
// Either way this only drives navigation; access control is enforced by RLS in the database.
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Business, ID, User } from '@/domain/types'
import { type AuthService, type SignedInAccount, auth, service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { SUPER_ADMIN, businessAdminFor } from './accounts'

export const ACCOUNT_KEY = 'arfurn:account'

export type Session = { role: 'super_admin' } | { role: 'business_admin'; businessId: ID }

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY)
    if (!raw) return null
    const v: unknown = JSON.parse(raw)
    if (typeof v !== 'object' || v === null) return null
    const s = v as Record<string, unknown>
    if (s.role === 'super_admin') return { role: 'super_admin' }
    if (s.role === 'business_admin' && typeof s.businessId === 'string') return { role: 'business_admin', businessId: s.businessId }
    return null
  } catch {
    return null
  }
}

interface AccountCtx {
  /** null = signed out; undefined = still resolving */
  user: User | null | undefined
  business: Business | null
  signInAs: (s: Session) => void
  logout: () => void
  /** Supabase mode: email of a signed-in user who has no role yet. */
  signedInEmail?: string
  /** Supabase mode: why the account could not be loaded. */
  accountError?: string
}

const Ctx = createContext<AccountCtx | null>(null)

export function AccountProvider({ children }: { children: ReactNode }) {
  return auth ? <SupabaseAccountProvider auth={auth}>{children}</SupabaseAccountProvider> : <DemoAccountProvider>{children}</DemoAccountProvider>
}

function useBusiness(businessId: ID | null) {
  return useServiceQuery(() => (businessId ? service.getBusinessById(businessId) : Promise.resolve({ ok: true as const, data: null })), [businessId])
}

function SupabaseAccountProvider({ auth, children }: { auth: AuthService; children: ReactNode }) {
  const [account, setAccount] = useState<SignedInAccount | null | undefined>(undefined)
  const [accountError, setAccountError] = useState<string | undefined>()
  const businessId = account?.user?.businessId ?? null
  const biz = useBusiness(businessId)

  useEffect(() => {
    let alive = true
    const load = () =>
      void auth.getCurrentUser().then((r) => {
        if (!alive) return
        setAccount(r.ok ? r.data : null)
        setAccountError(r.ok ? undefined : r.error.message)
      })
    load()
    const off = auth.onAuthStateChange(load)
    return () => {
      alive = false
      off()
    }
  }, [auth])

  const logout = useCallback(() => void auth.signOut(), [auth])
  const signInAs = useCallback(() => {}, [])

  const value = useMemo<AccountCtx>(() => {
    const extra = { signInAs, logout, accountError, signedInEmail: account && !account.user ? account.email : undefined }
    if (account === undefined) return { user: undefined, business: null, ...extra }
    const user = account?.user ?? null
    if (!user?.businessId) return { user, business: null, ...extra }
    const business = biz.data ?? null
    if (!business) return { user: biz.status === 'loading' ? undefined : null, business: null, ...extra }
    return { user, business, ...extra }
  }, [account, accountError, biz.data, biz.status, signInAs, logout])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function DemoAccountProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readSession)
  const businessId = session?.role === 'business_admin' ? session.businessId : null
  const biz = useBusiness(businessId)

  const signInAs = useCallback((s: Session) => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(s))
    setSession(s)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(ACCOUNT_KEY)
    setSession(null)
  }, [])

  // A business admin whose business was deleted is signed out.
  useEffect(() => {
    if (businessId && biz.status === 'error' && biz.error.code === 'NOT_FOUND') logout()
  }, [businessId, biz.status, biz.error, logout])

  const value = useMemo<AccountCtx>(() => {
    if (!session) return { user: null, business: null, signInAs, logout }
    if (session.role === 'super_admin') return { user: SUPER_ADMIN, business: null, signInAs, logout }
    const business = biz.data ?? null
    if (!business) return { user: biz.status === 'loading' ? undefined : null, business: null, signInAs, logout }
    return { user: businessAdminFor(business), business, signInAs, logout }
  }, [session, biz.data, biz.status, signInAs, logout])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAccount(): AccountCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAccount must be used inside <AccountProvider>')
  return ctx
}

/** For Business Admin pages: the signed-in user's business (guaranteed by RequireRole). */
export function useCurrentBusiness(): Business {
  const { business } = useAccount()
  if (!business) throw new Error('useCurrentBusiness requires a business_admin session')
  return business
}
