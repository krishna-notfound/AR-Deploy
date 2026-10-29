// Who is using the dashboards. Demo mode: a mock account picker (NOT authentication).
// Supabase mode: the real Supabase Auth session, with the role read from platform_admins / business_members.
// Either way this only drives navigation; access control is enforced by RLS in the database.
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useOptionalToast } from '@/components/ui/ToastProvider'
import type { Business, ID, PlatformAccess, PlatformRole, SecurityState, User } from '@/domain/types'
import { type AssuranceLevels, type AuthService, type ServiceError, type SignedInAccount, account as accountApi, auth, service } from '@/services'
import { useI18n } from '@/i18n/LanguageProvider'
import { translate } from '@/i18n/translate'
import { onPermissionError, useServiceQuery } from '@/services/hooks'
import { DEMO_PLATFORM_USERS, SUPER_ADMIN, businessAdminFor } from './accounts'

export const ACCOUNT_KEY = 'arfurn:account'

export type Session = { role: 'super_admin'; platformRole?: PlatformRole } | { role: 'business_admin'; businessId: ID }

/** `signedOut` false: the session is still active. `error`: what to tell the user (also when signed out on this device only). */
/** `error` is English, for logs; `reason` says which sentence to show (auth.signOut.*). */
export type LogoutResult = { signedOut: boolean; error?: string; reason?: 'device_only' | 'failed' }

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
  /** Supabase mode, with signedInEmail: the Owner turned this platform member's access off (S1.5 R-W6-7). */
  accessDeactivated?: boolean
  /** Why the account or its business could not be loaded. A user who was already signed in stays signed in. */
  accountError?: string
  /** The same failure with its code, so screens can word it in the person's language (errorText). */
  accountFailure?: ServiceError
  /** Loads the account and its business again (after accountError). */
  retry: () => void
  /** The signed-in user's 2FA state, policy and session assurance level. */
  security: SecurityInfo
  /** Loads the security state again (after a 2FA change). A failed first load also retries by itself. */
  refreshSecurity: () => Promise<void>
  /**
   * Loads the security state again unless it was loaded in the last 30 s (on route changes: a policy turned on
   * mid-session reaches a session that raised no auth event since).
   */
  refreshSecurityIfStale: () => void
  /**
   * Updates the known security state in place after a change the server accepted. The patch holds over later reloads
   * until one confirms it (a lagging session refresh can't bring the old values back), for at most a minute.
   */
  patchSecurity: (patch: SecurityPatch) => void
  /** The 2FA gate is finishing a step (e.g. showing new recovery codes): the account must stay mounted meanwhile. */
  holdGate: (on: boolean) => void
  /** The 2FA gate holds: see holdGate. */
  gateHeld: boolean
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
 * The sign-in needs the authenticator code: the session's assurance level says aal1 now and aal2 possible, or the
 * server knows a verified factor while the session is at aal1 (a stale local factor list must not skip the step).
 * Never when the server says there is no factor.
 * The current level comes from the session, or from the server state when the session can't be read.
 */
export function needsCodeStep(info: Pick<SecurityInfo, 'state' | 'assurance'>): boolean {
  const { assurance: a, state: st } = info
  // The server knows there is no factor (also a held "no factor" after a recovery code): there is no code to ask for.
  if (st && !st.hasVerifiedFactor) return false
  if (a && a.currentLevel === 'aal1' && a.nextLevel === 'aal2') return true
  return !!st?.hasVerifiedFactor && (a?.currentLevel ?? st.aal) === 'aal1'
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
function useSecurityLoader(onChange?: (info: SecurityInfo) => void, onScheduledReload?: () => void) {
  const [sec, setSec] = useState<SecurityInfo>(NO_SECURITY)
  const secRef = useRef(sec)
  const loadId = useRef(0)
  const onChangeRef = useRef(onChange)
  // Told on each reload of the focus, visibility, route and aal1-interval cadence (the platform access follows it).
  const onScheduledRef = useRef(onScheduledReload)
  useEffect(() => {
    onChangeRef.current = onChange
    onScheduledRef.current = onScheduledReload
  })
  // The last patch, held over reloads until one confirms it (or a minute has passed).
  const pending = useRef<{ patch: SecurityPatch; at: number } | null>(null)
  const commit = useCallback((next: SecurityInfo, notify: boolean) => {
    secRef.current = next
    setSec(next)
    if (notify) onChangeRef.current?.(next)
  }, [])

  // When the last load started (drives refreshIfStale).
  const lastLoadAt = useRef(0)
  const refresh = useCallback(async () => {
    const id = ++loadId.current
    lastLoadAt.current = Date.now()
    const [r, a] = await Promise.all([accountApi.getSecurityState(), accountApi.getAssurance()])
    if (id !== loadId.current) return
    const prev = secRef.current
    let known: Pick<SecurityInfo, 'state' | 'assurance'> = { state: r.ok ? r.data : prev.state, assurance: a.ok ? a.data : prev.assurance }
    const held = pending.current
    if (held) {
      const confirmed =
        Object.entries(held.patch.state ?? {}).every(([k, v]) => r.ok && r.data[k as keyof SecurityState] === v) &&
        Object.entries(held.patch.assurance ?? {}).every(([k, v]) => a.ok && a.data[k as keyof AssuranceLevels] === v)
      if (confirmed || Date.now() - held.at > PATCH_HOLD_MS) pending.current = null
      else known = applyPatch(known, held.patch)
    }
    commit(
      {
        ...known,
        loaded: true,
        error: known.state ? undefined : !r.ok ? r.error.message : undefined,
        failures: known.state ? 0 : prev.failures + 1,
      },
      true,
    )
  }, [commit])

  const patch = useCallback(
    (p: SecurityPatch) => {
      loadId.current++ // a load still in flight predates the change
      pending.current = { patch: p, at: Date.now() }
      const prev = secRef.current
      commit({ ...prev, ...applyPatch(prev, p) }, true)
    },
    [commit],
  )

  const clear = useCallback(() => {
    loadId.current++ // drop a load still in flight
    pending.current = null
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

  // The state only reloads on auth events otherwise, so a policy the Owner turns on mid-session would leave a
  // signed-in user at aal1 on empty tables. Known state only: signed out there is nothing to reload, and a failed
  // first load has its own retry above.
  const refreshIfStale = useCallback(() => {
    if (!secRef.current.state) return
    if (Date.now() - lastLoadAt.current < STALE_AFTER_MS) return
    void refresh()
    onScheduledRef.current?.()
  }, [refresh])

  const known = !!sec.state
  useEffect(() => {
    if (!known) return
    const onFocus = () => refreshIfStale()
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshIfStale()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [known, refreshIfStale])

  // A session at aal1 is the one the 2FA rules can lock out: also reload every few minutes while the tab is shown
  // (a hidden tab catches up when it becomes visible). Stops at aal2, on sign-out (clear) and on unmount.
  const atAal1 = !!sec.state && (sec.assurance?.currentLevel ?? sec.state.aal) === 'aal1'
  useEffect(() => {
    if (!atAal1) return
    const timer = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      void refresh()
      onScheduledRef.current?.()
    }, AAL1_RELOAD_MS)
    return () => clearInterval(timer)
  }, [atAal1, refresh])

  return { security: sec, refresh, refreshIfStale, patch, clear }
}

const PATCH_HOLD_MS = 60_000
/** Focus, visibility and route changes reload the security state at most this often. */
const STALE_AFTER_MS = 30_000
/** At aal1 the security state also reloads on its own this often. */
const AAL1_RELOAD_MS = 3 * 60_000

function applyPatch(info: Pick<SecurityInfo, 'state' | 'assurance'>, p: SecurityPatch): Pick<SecurityInfo, 'state' | 'assurance'> {
  return {
    state: info.state && p.state ? { ...info.state, ...p.state } : info.state,
    assurance: p.assurance ? { currentLevel: 'aal1', nextLevel: 'aal1', ...info.assurance, ...p.assurance } : info.assurance,
  }
}

/** Shown when a reload finds that the signed-in platform user's role or permissions changed (S1.5 R-W6-8). */
export const ACCESS_CHANGED = translate('en', 'auth.accessChanged')
/** A PERMISSION error reloads the platform access at most this often. */
const ACCESS_ON_REFUSAL_MS = 2_000

const accessKey = (a: PlatformAccess) => `${a.role}|${a.status}|${[...a.permissions].sort().join(',')}`
const sameAccess = (a: PlatformAccess, b: PlatformAccess | null) => !!b && accessKey(a) === accessKey(b)

function useBusiness(businessId: ID | null) {
  return useServiceQuery(() => (businessId ? service.getBusinessById(businessId) : Promise.resolve({ ok: true as const, data: null })), [businessId])
}

export function SupabaseAccountProvider({ auth, children }: { auth: AuthService; children: ReactNode }) {
  const [account, setAccount] = useState<SignedInAccount | null | undefined>(undefined)
  const [accountFailure, setAccountFailure] = useState<ServiceError | undefined>()
  const businessId = account?.user?.businessId ?? null
  const biz = useBusiness(businessId)
  const bizRef = useRef(biz)
  useEffect(() => {
    bizRef.current = biz
  })
  const loadId = useRef(0)
  // The last account lookup that succeeded: undefined before the first one, null when signed out.
  const accountRef = useRef<SignedInAccount | null | undefined>(undefined)
  const [gateHeld, setGateHeld] = useState(false)
  const holdGate = useCallback((on: boolean) => setGateHeld(on), [])
  // The business id being fetched again after the 2FA rules hid it: the user stays shown (without the business)
  // meanwhile, so the 2FA gate and what it shows (new recovery codes) stay mounted.
  const [hiddenRefetch, setHiddenRefetch] = useState<ID | null>(null)
  // Whether the last render showed the user without their business (set after each render).
  const shownWithoutBusiness = useRef(false)
  const refetchFailedBusiness = useCallback(() => {
    const b = bizRef.current
    if (b.status !== 'error') return
    setHiddenRefetch(shownWithoutBusiness.current ? (accountRef.current?.user?.businessId ?? null) : null)
    b.refetch()
  }, [])
  // The platform access reload (below), called on the security state's cadence.
  const refreshAccessRef = useRef<() => void>(() => {})
  const { security, refresh: refreshSecurity, refreshIfStale: refreshSecurityIfStale, patch: patchSecurity, clear: clearSecurity } = useSecurityLoader((info) => {
    if (!info.loaded || !info.state) return
    // A business hidden while a 2FA step was due is fetched again once the step is done.
    if (!twoFactorDue(info)) refetchFailedBusiness()
    // The password sign-in of this tab is complete (state known, no code step left): record it once.
    if (passwordSignInPending() && !needsCodeStep(info)) {
      clearPasswordSignIn()
      // At most one per minute on the server; a failure to record never blocks the user.
      void accountApi.recordSignIn()
    }
  }, () => refreshAccessRef.current())

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
      setAccountFailure(r.ok ? undefined : r.error)
    })
    // Signing in again keeps the same business id, so a failed business lookup has to be retried here.
    refetchFailedBusiness()
  }, [auth, clearSecurity, refreshSecurity, refetchFailedBusiness])

  // Retry is also how a page asks for fresh data after it changed something (e.g. a cancelled closure restores the
  // business status), so it reloads the business even when the last lookup succeeded.
  const retry = useCallback(() => {
    if (bizRef.current.status !== 'error') bizRef.current.refetch()
    load()
  }, [load])

  // R-W6-8: a platform user's role and permissions are read again on the security state's cadence and after a
  // PERMISSION error, so a change the Owner makes elsewhere reaches this session. A change updates the account (the
  // nav and permission checks follow) and says so; access turned off reloads the account, which signs them out of
  // the dashboard. Business owners have no platform access to reload.
  const toast = useOptionalToast()
  const { t } = useI18n()
  const accessLoad = useRef({ running: false, at: 0 })
  const refreshAccess = useCallback(async () => {
    const cur = accountRef.current
    const platform = cur?.user?.role === 'super_admin' ? cur.user.platform : undefined
    if (!cur?.user || !platform || accessLoad.current.running) return
    accessLoad.current = { running: true, at: Date.now() }
    try {
      const id = loadId.current
      const r = await service.getMyAccess()
      // A failed read keeps what is known; a newer account lookup (or a sign-out) answers for itself.
      if (!r.ok || id !== loadId.current || accountRef.current !== cur || sameAccess(platform, r.data)) return
      if (!r.data?.role || r.data.status !== 'active') return load()
      const next: SignedInAccount = { ...cur, user: { ...cur.user, platform: r.data } }
      accountRef.current = next
      setAccount(next)
      toast?.info(t('auth.accessChanged'))
    } finally {
      accessLoad.current.running = false
    }
  }, [load, toast, t])
  useEffect(() => {
    refreshAccessRef.current = () => void refreshAccess()
  }, [refreshAccess])
  useEffect(
    () =>
      onPermissionError(() => {
        if (Date.now() - accessLoad.current.at >= ACCESS_ON_REFUSAL_MS) void refreshAccess()
      }),
    [refreshAccess],
  )

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
    if (!local.ok) return { signedOut: false, error: 'Could not sign out. Check your connection and try again.', reason: 'failed' }
    loadId.current++ // a lookup still in flight must not bring the old account back
    accountRef.current = null
    clearPasswordSignIn()
    clearSecurity()
    setGateHeld(false)
    setHiddenRefetch(null)
    setAccount(null)
    setAccountFailure(undefined)
    return global.ok ? { signedOut: true } : { signedOut: true, error: 'Signed out on this device only. Other devices stay signed in until their session expires.', reason: 'device_only' }
  }, [auth, clearSecurity])
  const signInAs = useCallback(() => {}, [])

  const value = useMemo<AccountCtx>(() => {
    const noRole = !!account && !account.user
    const base = {
      business: null,
      signInAs,
      logout,
      retry,
      accountError: accountFailure?.message,
      accountFailure,
      signedInEmail: noRole ? account.email : undefined,
      accessDeactivated: noRole && account.deactivated ? true : undefined,
      security,
      refreshSecurity,
      refreshSecurityIfStale,
      patchSecurity,
      holdGate,
      gateHeld,
    }
    if (account === undefined) return { ...base, user: undefined }
    const user = account?.user ?? null
    if (!user?.businessId) return { ...base, user }
    // Until the query for *this* business settles, the account is still loading (a stale result from the
    // previous business id must not read as "signed out" and bounce the user to /login).
    const business = biz.data?.id === user.businessId ? biz.data : null
    if (business) return { ...base, user, business }
    // Shown without the business (the gate decides what to show): never drop back to loading while the gate holds,
    // nor while a business the 2FA rules hid is fetched again.
    const withoutBusiness = { ...base, user }
    if (biz.status !== 'error') return gateHeld || hiddenRefetch === user.businessId ? withoutBusiness : { ...base, user: undefined }
    if (gateHeld) return withoutBusiness
    // Only a missing business means "no business"; any other failure is reported with a retry.
    if (biz.error.code === 'NOT_FOUND') {
      // Under 2FA rules an aal1 session can't see its business (a draft or inactive one is not public either). While a
      // 2FA step is due, or the security check could not answer, the user goes on without the business: the gate shows
      // the step or a notice, and the business is fetched again after.
      if (!security.loaded) return { ...base, user: undefined }
      if (twoFactorDue(security) || !security.state) return withoutBusiness
      return { ...base, user: null, signedInEmail: account?.email }
    }
    return { ...base, user: undefined, accountError: biz.error.message, accountFailure: biz.error }
  }, [account, accountFailure, biz.data, biz.status, biz.error, signInAs, logout, retry, security, refreshSecurity, refreshSecurityIfStale, patchSecurity, holdGate, gateHeld, hiddenRefetch])

  useEffect(() => {
    shownWithoutBusiness.current = !!value.user?.businessId && !value.business
  })

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
  const { refetch: refetchAccess } = access
  const bizFailed = biz.status === 'error'
  // R-W6-8, as in Supabase mode: the access is read again on the security state's cadence and after a PERMISSION error.
  const accessAt = useRef(0)
  const reloadAccess = useCallback(() => {
    if (!platformRole) return
    accessAt.current = Date.now()
    refetchAccess()
  }, [platformRole, refetchAccess])
  const { security, refresh: refreshSecurity, refreshIfStale: refreshSecurityIfStale, patch: patchSecurity, clear: clearSecurity } = useSecurityLoader(undefined, reloadAccess)
  useEffect(
    () =>
      onPermissionError(() => {
        if (Date.now() - accessAt.current >= ACCESS_ON_REFUSAL_MS) reloadAccess()
      }),
    [reloadAccess],
  )
  // A changed role or permission set for the same demo account says so (the nav follows the new access).
  const toast = useOptionalToast()
  const { t } = useI18n()
  const seenAccess = useRef<{ role: PlatformRole; access: PlatformAccess } | null>(null)
  useEffect(() => {
    const now = access.data
    if (!platformRole || !now) return
    const prev = seenAccess.current
    seenAccess.current = { role: platformRole, access: now }
    if (prev?.role === platformRole && now.status === 'active' && !sameAccess(prev.access, now)) toast?.info(t('auth.accessChanged'))
  }, [access.data, platformRole, toast, t])
  const [gateHeld, setGateHeld] = useState(false)
  const holdGate = useCallback((on: boolean) => setGateHeld(on), [])
  // The demo security state follows the chosen account (the staff and business policies differ).
  const sessionKey = session ? JSON.stringify(session) : null
  useEffect(() => {
    if (sessionKey) void refreshSecurity()
    else clearSecurity()
  }, [sessionKey, refreshSecurity, clearSecurity])

  const signInAs = useCallback(
    (s: Session) => {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(s))
      // Another demo account: the previous one's security state must not decide for it (reloaded by the effect).
      if (JSON.stringify(s) !== sessionKey) clearSecurity()
      setSession(s)
      // Choosing a demo account is the demo's sign-in: it shows in Security activity.
      void accountApi.recordSignIn()
      // Same business after a failed lookup: the query deps do not change, so load it again.
      if (s.role === 'business_admin' && s.businessId === businessId && bizFailed) refetchBusiness()
    },
    [businessId, bizFailed, refetchBusiness, sessionKey, clearSecurity],
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
      refreshSecurityIfStale,
      patchSecurity,
      holdGate,
      gateHeld,
    }
    if (!session) return { ...base, user: null }
    if (session.role === 'super_admin') {
      // The demo member was deactivated on Team & Access: no dashboard (as in Supabase mode).
      if (access.data?.status === 'deactivated') return { ...base, user: null }
      if (!access.data || access.data.role !== platformRole) return access.status === 'error' ? { ...base, user: undefined, accountError: access.error.message, accountFailure: access.error } : { ...base, user: undefined }
      const person = platformRole === 'owner' ? SUPER_ADMIN : DEMO_PLATFORM_USERS[platformRole as 'admin' | 'team']
      return { ...base, user: { ...person, platform: access.data } }
    }
    const business = biz.data?.id === businessId ? biz.data : null
    if (business) return { ...base, user: businessAdminFor(business), business }
    if (biz.status !== 'error') return { ...base, user: undefined }
    if (biz.error.code === 'NOT_FOUND') return { ...base, user: null }
    return { ...base, user: undefined, accountError: biz.error.message, accountFailure: biz.error }
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
    refreshSecurityIfStale,
    patchSecurity,
    holdGate,
    gateHeld,
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
