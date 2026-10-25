// Who is using the dashboards. Demo mode: a mock account picker (NOT authentication).
// Supabase mode: the real Supabase Auth session, with the role read from platform_admins / business_members.
// Either way this only drives navigation; access control is enforced by RLS in the database.
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Business, ID, PlatformRole, User } from '@/domain/types'
import { type AuthService, type SignedInAccount, auth, service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { DEMO_PLATFORM_USERS, SUPER_ADMIN, businessAdminFor } from './accounts'

export const ACCOUNT_KEY = 'arfurn:account'

export type Session = { role: 'super_admin'; platformRole?: PlatformRole } | { role: 'business_admin'; businessId: ID }

/** `signedOut` false: the session is still active. `error`: what to tell the user (also when signed out on this device only). */
export type LogoutResult = { signedOut: boolean; error?: string }

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY)
    if (!raw) return null
    const v: unknown = JSON.parse(raw)
    if (typeof v !== 'object' || v === null) return null
    const s = v as Record<string, unknown>
    if (s.role === 'super_admin') return s.platformRole === 'admin' || s.platformRole === 'team' ? { role: 'super_admin', platformRole: s.platformRole } : { role: 'super_admin' }
    if (s.role === 'business_admin' && typeof s.businessId === 'string') return { role: 'business_admin', businessId: s.businessId }
    return null
  } catch {
    return null
  }
}

interface AccountCtx {
  /** null = signed out; undefined = still resolving (or failed to load: see accountError) */
  user: User | null | undefined
  business: Business | null
  signInAs: (s: Session) => void
  /** Resolves once the session has ended (or could not be ended). */
  logout: () => Promise<LogoutResult>
  /** Supabase mode: email of a signed-in user who has no role (or no business) yet. */
  signedInEmail?: string
  /** Why the account or its business could not be loaded. A user who was already signed in stays signed in. */
  accountError?: string
  /** Loads the account and its business again (after accountError). */
  retry: () => void
}

const Ctx = createContext<AccountCtx | null>(null)

export function AccountProvider({ children }: { children: ReactNode }) {
  return auth ? <SupabaseAccountProvider auth={auth}>{children}</SupabaseAccountProvider> : <DemoAccountProvider>{children}</DemoAccountProvider>
}

function useBusiness(businessId: ID | null) {
  return useServiceQuery(() => (businessId ? service.getBusinessById(businessId) : Promise.resolve({ ok: true as const, data: null })), [businessId])
}

export function SupabaseAccountProvider({ auth, children }: { auth: AuthService; children: ReactNode }) {
  const [account, setAccount] = useState<SignedInAccount | null | undefined>(undefined)
  const [accountError, setAccountError] = useState<string | undefined>()
  const businessId = account?.user?.businessId ?? null
  const biz = useBusiness(businessId)
  const bizRef = useRef(biz)
  useEffect(() => {
    bizRef.current = biz
  })
  const loadId = useRef(0)

  const load = useCallback(() => {
    const id = ++loadId.current
    void auth.getCurrentUser().then((r) => {
      if (id !== loadId.current) return
      // No session is ok(null). A failed lookup (network blip on TOKEN_REFRESHED, database error) keeps the account we had.
      if (r.ok) setAccount(r.data)
      setAccountError(r.ok ? undefined : r.error.message)
    })
    // Signing in again keeps the same business id, so a failed business lookup has to be retried here.
    if (bizRef.current.status === 'error') bizRef.current.refetch()
  }, [auth])

  // Retry is also how a page asks for fresh data after it changed something (e.g. a cancelled closure restores the
  // business status), so it reloads the business even when the last lookup succeeded.
  const retry = useCallback(() => {
    if (bizRef.current.status !== 'error') bizRef.current.refetch()
    load()
  }, [load])

  useEffect(() => {
    const ids = loadId
    load()
    const off = auth.onAuthStateChange(load)
    return () => {
      ids.current++ // drop a lookup still in flight
      off()
    }
  }, [auth, load])

  const logout = useCallback(async (): Promise<LogoutResult> => {
    const global = await auth.signOut()
    const local = global.ok ? global : await auth.signOut('local')
    if (!local.ok) return { signedOut: false, error: 'Could not sign out. Check your connection and try again.' }
    loadId.current++ // a lookup still in flight must not bring the old account back
    setAccount(null)
    setAccountError(undefined)
    return global.ok ? { signedOut: true } : { signedOut: true, error: 'Signed out on this device only. Other devices stay signed in until their session expires.' }
  }, [auth])
  const signInAs = useCallback(() => {}, [])

  const value = useMemo<AccountCtx>(() => {
    const noRole = !!account && !account.user
    const base = { business: null, signInAs, logout, retry, accountError, signedInEmail: noRole ? account.email : undefined }
    if (account === undefined) return { ...base, user: undefined }
    const user = account?.user ?? null
    if (!user?.businessId) return { ...base, user }
    // Until the query for *this* business settles, the account is still loading (a stale result from the
    // previous business id must not read as "signed out" and bounce the user to /login).
    const business = biz.data?.id === user.businessId ? biz.data : null
    if (business) return { ...base, user, business }
    if (biz.status !== 'error') return { ...base, user: undefined }
    // Only a missing business means "no business"; any other failure is reported with a retry.
    if (biz.error.code === 'NOT_FOUND') return { ...base, user: null, signedInEmail: account?.email }
    return { ...base, user: undefined, accountError: biz.error.message }
  }, [account, accountError, biz.data, biz.status, biz.error, signInAs, logout, retry])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function DemoAccountProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readSession)
  const businessId = session?.role === 'business_admin' ? session.businessId : null
  const biz = useBusiness(businessId)
  const { refetch: refetchBusiness } = biz
  const platformRole = session?.role === 'super_admin' ? (session.platformRole ?? 'owner') : null
  // The demo role's permissions come from the demo team data, so changes on Team & Access apply straight away.
  const access = useServiceQuery(() => (platformRole ? service.getMyAccess() : Promise.resolve({ ok: true as const, data: null })), [platformRole])
  const bizFailed = biz.status === 'error'

  const signInAs = useCallback(
    (s: Session) => {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(s))
      setSession(s)
      // Same business after a failed lookup: the query deps do not change, so load it again.
      if (s.role === 'business_admin' && s.businessId === businessId && bizFailed) refetchBusiness()
    },
    [businessId, bizFailed, refetchBusiness],
  )

  const logout = useCallback(async (): Promise<LogoutResult> => {
    localStorage.removeItem(ACCOUNT_KEY)
    setSession(null)
    return { signedOut: true }
  }, [])

  // A business admin whose business was deleted is signed out.
  useEffect(() => {
    if (businessId && biz.status === 'error' && biz.error.code === 'NOT_FOUND') void logout()
  }, [businessId, biz.status, biz.error, logout])

  const value = useMemo<AccountCtx>(() => {
    const base = { business: null, signInAs, logout, retry: refetchBusiness }
    if (!session) return { ...base, user: null }
    if (session.role === 'super_admin') {
      if (!access.data || access.data.role !== platformRole) return access.status === 'error' ? { ...base, user: undefined, accountError: access.error.message } : { ...base, user: undefined }
      const person = platformRole === 'owner' ? SUPER_ADMIN : DEMO_PLATFORM_USERS[platformRole as 'admin' | 'team']
      return { ...base, user: { ...person, platform: access.data } }
    }
    const business = biz.data?.id === businessId ? biz.data : null
    if (business) return { ...base, user: businessAdminFor(business), business }
    if (biz.status !== 'error') return { ...base, user: undefined }
    if (biz.error.code === 'NOT_FOUND') return { ...base, user: null }
    return { ...base, user: undefined, accountError: biz.error.message }
  }, [session, businessId, biz.data, biz.status, biz.error, signInAs, logout, refetchBusiness, platformRole, access.data, access.status, access.error])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** The account, or null outside <AccountProvider> (standalone component tests). */
export function useOptionalAccount(): AccountCtx | null {
  return useContext(Ctx)
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
