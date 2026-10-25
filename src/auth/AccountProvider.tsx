// Who is using the dashboards. Demo mode: a mock account picker (NOT authentication).
// Supabase mode: the real Supabase Auth session, with the role read from platform_admins / business_members.
// Either way this only drives navigation; access control is enforced by RLS in the database.
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Business, ID, PlatformRole, SecurityState, User } from '@/domain/types'
import { type AssuranceLevels, type AuthService, type SignedInAccount, account as accountApi, auth, service } from '@/services'
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
  /** The signed-in user's 2FA state, policy and session assurance level. */
  security: SecurityInfo
  /** Loads the security state again (after a 2FA change). A failed first load also retries by itself. */
  refreshSecurity: () => Promise<void>
  /** Updates the known security state in place after a change the server accepted (before the reload confirms it). */
  patchSecurity: (patch: SecurityPatch) => void
}

export interface SecurityInfo {
  /** my_security_state (policy, factor, closure, onboarding). Undefined while signed out, loading, or never loaded. */
  state?: SecurityState
  /** The session's levels, read locally. Undefined while unknown (not loaded, or the read failed). */
  assurance?: AssuranceLevels
  /** The first load has answered, successfully or not. */
  loaded: boolean
  /** Why the state could not be loaded (only when there is no earlier state to keep). */
  error?: string
  /** Failed loads in a row without a state (drives the background retry). */
  failures: number
}

export interface SecurityPatch {
  state?: Partial<SecurityState>
  assurance?: Partial<AssuranceLevels>
}

const NO_SECURITY: SecurityInfo = { loaded: false, failures: 0 }

/**
 * The sign-in needs the authenticator code: decided from the session's assurance level (aal1 now, aal2 possible).
 * When the level can't be read, an account with a factor is asked for the code (fail toward asking).
 */
export function needsCodeStep(info: Pick<SecurityInfo, 'state' | 'assurance'>): boolean {
  if (info.assurance) return info.assurance.currentLevel === 'aal1' && info.assurance.nextLevel === 'aal2'
  return info.state?.hasVerifiedFactor === true
}

/** The policy requires 2FA and the account has none yet. */
export function needsTwoFactorSetup(info: Pick<SecurityInfo, 'state' | 'assurance'>): boolean {
  const { state } = info
  if (!state?.requires2fa || state.hasVerifiedFactor) return false
  return (info.assurance?.currentLevel ?? state.aal) !== 'aal2'
}

/** A 2FA step stands between the user and their data (the database hides it until the session is aal2). */
export const twoFactorDue = (info: Pick<SecurityInfo, 'state' | 'assurance'>) => needsCodeStep(info) || needsTwoFactorSetup(info)

/** After the authenticator code was accepted: the session is aal2. */
export const VERIFIED_PATCH: SecurityPatch = { state: { aal: 'aal2' }, assurance: { currentLevel: 'aal2', nextLevel: 'aal2' } }
/** After a recovery code was accepted: the server removed the authenticator. */
export const RECOVERED_PATCH: SecurityPatch = { state: { hasVerifiedFactor: false, recoveryCodesLeft: null }, assurance: { nextLevel: 'aal1' } }
/** After 2FA was set up and confirmed. */
export const ENABLED_PATCH: SecurityPatch = { state: { hasVerifiedFactor: true, aal: 'aal2' }, assurance: { currentLevel: 'aal2', nextLevel: 'aal2' } }

// The tab that ran the password sign-in records it, once the sign-in is complete. Session storage: it survives a
// reload at the code step, and other tabs that gain the session don't record it.
const SIGN_IN_KEY = 'arfurn:sign-in-pending'
function storage(fn: (s: Storage) => unknown): unknown {
  try {
    return fn(sessionStorage)
  } catch {
    return null // storage blocked: the sign-in is simply not recorded
  }
}
/** Call before the password sign-in (LoginPage); clear it again when the sign-in fails. */
export const markPasswordSignIn = () => void storage((s) => s.setItem(SIGN_IN_KEY, '1'))
export const clearPasswordSignIn = () => void storage((s) => s.removeItem(SIGN_IN_KEY))
const passwordSignInPending = () => storage((s) => s.getItem(SIGN_IN_KEY)) === '1'

const Ctx = createContext<AccountCtx | null>(null)

export function AccountProvider({ children }: { children: ReactNode }) {
  return auth ? <SupabaseAccountProvider auth={auth}>{children}</SupabaseAccountProvider> : <DemoAccountProvider>{children}</DemoAccountProvider>
}

/**
 * The signed-in user's security state and assurance level. A failed reload keeps what is already known (as the
 * account does), so a network blip on a token refresh never flashes the 2FA gate. A failed first load lets the app
 * through (the database still refuses data) and retries in the background: on window focus and with a backoff.
 */
function useSecurityLoader(onChange?: (info: SecurityInfo) => void) {
  const [sec, setSec] = useState<SecurityInfo>(NO_SECURITY)
  const secRef = useRef(sec)
  const loadId = useRef(0)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })
  const commit = useCallback((next: SecurityInfo, notify: boolean) => {
    secRef.current = next
    setSec(next)
    if (notify) onChangeRef.current?.(next)
  }, [])

  const refresh = useCallback(async () => {
    const id = ++loadId.current
    const [r, a] = await Promise.all([accountApi.getSecurityState(), accountApi.getAssurance()])
    if (id !== loadId.current) return
    const prev = secRef.current
    const state = r.ok ? r.data : prev.state
    commit(
      {
        state,
        assurance: a.ok ? a.data : prev.assurance,
        loaded: true,
        error: state ? undefined : !r.ok ? r.error.message : undefined,
        failures: state ? 0 : prev.failures + 1,
      },
      true,
    )
  }, [commit])

  const patch = useCallback(
    (p: SecurityPatch) => {
      loadId.current++ // a load still in flight predates the change
      const prev = secRef.current
      commit(
        {
          ...prev,
          state: prev.state && p.state ? { ...prev.state, ...p.state } : prev.state,
          assurance: p.assurance ? { currentLevel: 'aal1', nextLevel: 'aal1', ...prev.assurance, ...p.assurance } : prev.assurance,
        },
        true,
      )
    },
    [commit],
  )

  const clear = useCallback(() => {
    loadId.current++ // drop a load still in flight
    commit(NO_SECURITY, false)
  }, [commit])

  // A failed first load: retry on focus and after 2 s, 4 s, 8 s… (at most a minute apart).
  const { error, failures } = sec
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => void refresh(), Math.min(60_000, 2_000 * 2 ** Math.max(0, failures - 1)))
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [error, failures, refresh])

  return { security: sec, refresh, patch, clear }
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
  // The last account lookup that succeeded: undefined before the first one, null when signed out.
  const accountRef = useRef<SignedInAccount | null | undefined>(undefined)
  const { security, refresh: refreshSecurity, patch: patchSecurity, clear: clearSecurity } = useSecurityLoader((info) => {
    if (!info.loaded) return
    // A business hidden while a 2FA step was due is fetched again once the step is done.
    if (bizRef.current.status === 'error' && !twoFactorDue(info)) bizRef.current.refetch()
    // The password sign-in of this tab is complete (no code step left): record it once.
    if (passwordSignInPending() && !needsCodeStep(info)) {
      clearPasswordSignIn()
      // At most one per minute on the server; a failure to record never blocks the user.
      void accountApi.recordSignIn()
    }
  })

  const load = useCallback(() => {
    const id = ++loadId.current
    void auth.getCurrentUser().then((r) => {
      if (id !== loadId.current) return
      // No session is ok(null). A failed lookup (network blip on TOKEN_REFRESHED, database error) keeps the account we had.
      if (r.ok) {
        const prev = accountRef.current
        const next = r.data
        const who = (a: SignedInAccount) => a.user?.id ?? a.email
        // Signed out, or someone else signed in: the old security state must not decide for the new session.
        if (!next || (prev && who(prev) !== who(next))) clearSecurity()
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
    clearPasswordSignIn()
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
      security,
      refreshSecurity,
      patchSecurity,
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
    if (biz.error.code === 'NOT_FOUND') {
      // Under 2FA rules an aal1 session can't see its business (a draft or inactive one is not public either). While a
      // 2FA step is due, the user goes on without the business so the 2FA gate can run; it is fetched again after.
      if (!security.loaded) return { ...base, user: undefined }
      if (twoFactorDue(security)) return { ...base, user }
      return { ...base, user: null, signedInEmail: account?.email }
    }
    return { ...base, user: undefined, accountError: biz.error.message }
  }, [account, accountError, biz.data, biz.status, biz.error, signInAs, logout, retry, security, refreshSecurity, patchSecurity])

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
  const { security, refresh: refreshSecurity, patch: patchSecurity, clear: clearSecurity } = useSecurityLoader()
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
      security,
      refreshSecurity,
      patchSecurity,
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
    security,
    refreshSecurity,
    patchSecurity,
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

/** The signed-in user's 2FA state, policy and assurance level, with ways to reload and update it (gate, sign-in, onboarding). */
export function useSecurityState(): SecurityInfo & { refresh: () => Promise<void>; patch: (p: SecurityPatch) => void } {
  const { security, refreshSecurity, patchSecurity } = useAccount()
  return { ...security, refresh: refreshSecurity, patch: patchSecurity }
}

/** For Business Admin pages: the signed-in user's business (guaranteed by RequireRole). */
export function useCurrentBusiness(): Business {
  const { business } = useAccount()
  if (!business) throw new Error('useCurrentBusiness requires a business_admin session')
  return business
}
