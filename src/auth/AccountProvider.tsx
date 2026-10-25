// Who is using the dashboards. Demo mode: a mock account picker (NOT authentication).
// Supabase mode: the real Supabase Auth session, with the role read from platform_admins / business_members.
// Either way this only drives navigation; access control is enforced by RLS in the database.
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Business, ID, PlatformRole, SecurityState, User } from '@/domain/types'
import { type AuthService, type SignedInAccount, account as accountApi, auth, service } from '@/services'
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
  /** The signed-in user's 2FA state and policy (my_security_state). Undefined while signed out or still loading. */
  securityState?: SecurityState
  /** Why the security state could not be loaded (only when there is no earlier state to keep). */
  securityError?: string
  /** Loads the security state again (after a 2FA change, or to retry after securityError). */
  refreshSecurity: () => Promise<void>
}

const Ctx = createContext<AccountCtx | null>(null)

export function AccountProvider({ children }: { children: ReactNode }) {
  return auth ? <SupabaseAccountProvider auth={auth}>{children}</SupabaseAccountProvider> : <DemoAccountProvider>{children}</DemoAccountProvider>
}

/**
 * The signed-in user's security state. A failed reload keeps the state already shown (as the account does), so a
 * network blip on a token refresh never flashes the 2FA gate; only a first load reports the error.
 */
function useSecurityLoader(onLoaded?: (s: SecurityState) => void) {
  const [sec, setSec] = useState<{ state?: SecurityState; error?: string }>({})
  const loadId = useRef(0)
  const onLoadedRef = useRef(onLoaded)
  useEffect(() => {
    onLoadedRef.current = onLoaded
  })
  const refresh = useCallback(async () => {
    const id = ++loadId.current
    // Retrying after an error shows the loading state again.
    setSec((prev) => (prev.error ? {} : prev))
    const r = await accountApi.getSecurityState()
    if (id !== loadId.current) return
    if (r.ok) {
      setSec({ state: r.data })
      onLoadedRef.current?.(r.data)
    } else setSec((prev) => (prev.state ? prev : { error: r.error.message }))
  }, [])
  const clear = useCallback(() => {
    loadId.current++ // drop a load still in flight
    setSec({})
  }, [])
  return { securityState: sec.state, securityError: sec.error, refresh, clear }
}

/** A finished sign-in: no authenticator, or the code was given (aal2). Until then the sign-in is not recorded. */
const signInComplete = (s: SecurityState) => !s.hasVerifiedFactor || s.aal === 'aal2'

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
  // The last account lookup that succeeded: undefined before the first one, null when signed out.
  const accountRef = useRef<SignedInAccount | null | undefined>(undefined)
  // Set when a signed-out tab gets a session (SIGNED_IN); cleared once the sign-in is recorded.
  const signInPending = useRef(false)
  const security = useSecurityLoader((s) => {
    if (!signInPending.current || !signInComplete(s)) return
    signInPending.current = false
    // At most one per minute on the server; a failure to record never blocks the user.
    void accountApi.recordSignIn()
  })
  const { refresh: refreshSecurity, clear: clearSecurity } = security

  const load = useCallback(() => {
    const id = ++loadId.current
    void auth.getCurrentUser().then((r) => {
      if (id !== loadId.current) return
      // No session is ok(null). A failed lookup (network blip on TOKEN_REFRESHED, database error) keeps the account we had.
      if (r.ok) {
        const prev = accountRef.current
        const next = r.data
        // Only signed out -> signed in is a sign-in: not a page load with a session, not a token refresh.
        if (next && prev === null) signInPending.current = true
        // Signed out, or someone else signed in: the old security state must not decide for the new session.
        if (!next || (prev && prev.email !== next.email)) clearSecurity()
        accountRef.current = next
        setAccount(next)
        // Every auth event can change it (code verified, factor removed, new session).
        if (next) void refreshSecurity()
      }
      setAccountError(r.ok ? undefined : r.error.message)
    })
    // Signing in again keeps the same business id, so a failed business lookup has to be retried here.
    if (bizRef.current.status === 'error') bizRef.current.refetch()
  }, [auth, clearSecurity, refreshSecurity])

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
    accountRef.current = null
    signInPending.current = false
    clearSecurity()
    setAccount(null)
    setAccountError(undefined)
    return global.ok ? { signedOut: true } : { signedOut: true, error: 'Signed out on this device only. Other devices stay signed in until their session expires.' }
  }, [auth, clearSecurity])
  const signInAs = useCallback(() => {}, [])

  const value = useMemo<AccountCtx>(() => {
    const noRole = !!account && !account.user
    const base = {
      business: null,
      signInAs,
      logout,
      retry,
      accountError,
      signedInEmail: noRole ? account.email : undefined,
      securityState: security.securityState,
      securityError: security.securityError,
      refreshSecurity,
    }
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
  }, [account, accountError, biz.data, biz.status, biz.error, signInAs, logout, retry, security.securityState, security.securityError, refreshSecurity])

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
  const security = useSecurityLoader()
  const { refresh: refreshSecurity, clear: clearSecurity } = security
  // The demo security state follows the chosen account (the staff and business policies differ).
  const sessionKey = session ? JSON.stringify(session) : null
  useEffect(() => {
    if (sessionKey) void refreshSecurity()
    else clearSecurity()
  }, [sessionKey, refreshSecurity, clearSecurity])

  const signInAs = useCallback(
    (s: Session) => {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(s))
      setSession(s)
      // Choosing a demo account is the demo's sign-in: it shows in Security activity.
      void accountApi.recordSignIn()
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
    const base = {
      business: null,
      signInAs,
      logout,
      retry: refetchBusiness,
      securityState: security.securityState,
      securityError: security.securityError,
      refreshSecurity,
    }
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
  }, [
    session,
    businessId,
    biz.data,
    biz.status,
    biz.error,
    signInAs,
    logout,
    refetchBusiness,
    platformRole,
    access.data,
    access.status,
    access.error,
    security.securityState,
    security.securityError,
    refreshSecurity,
  ])

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

/** The signed-in user's 2FA state and policy, and a way to load it again (the 2FA gate, sign-in, onboarding). */
export function useSecurityState(): { state: SecurityState | undefined; error: string | undefined; refresh: () => Promise<void> } {
  const { securityState, securityError, refreshSecurity } = useAccount()
  return { state: securityState, error: securityError, refresh: refreshSecurity }
}

/** For Business Admin pages: the signed-in user's business (guaranteed by RequireRole). */
export function useCurrentBusiness(): Business {
  const { business } = useAccount()
  if (!business) throw new Error('useCurrentBusiness requires a business_admin session')
  return business
}
