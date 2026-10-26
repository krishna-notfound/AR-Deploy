// Demo implementation of the account settings, security and 2FA methods (S1). A test harness only: it keeps its
// state in memory (gone on reload), sends no email and checks no real authenticator. Every action code and TOTP code
// is the demo code 123456, and the setup QR code says "Demo". The rules mirror the real service so the UI can be
// driven by tests: same validation, same reasons, aal2 needed for the platform policy.
import type { BusinessStatus, ClosureRequest, PlatformSettings, Profile, SecurityEvent, SecurityState } from '@/domain/types'
import { newId } from '@/lib/id'
import { type AccountService, AVATAR_MAX_BYTES, AVATAR_TYPES, DISPLAY_NAME_MAX, EMAIL_PATTERN, type NoticeOutcome, PASSWORD_MAX, PASSWORD_MIN, accountFail } from '../accountService'
import { type Result, ok } from '../catalogService'
import { mockCatalogService } from './mockCatalogService'
import { clearDemoMember2fa, demoMemberHas2fa, demoPlatformRole, recordDemoSelfClosure } from './mockTeam'
import { store } from './store'

/** The only code the demo accepts, for action codes and the authenticator alike. */
export const DEMO_CODE = '123456'
const DEMO_EMAIL = 'demo@demo.example'
const DEMO_SENT_TO = 'd•••@demo.example'
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const LATENCY_MS = import.meta.env.MODE === 'test' ? 0 : 150

const DEMO_QR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="Demo QR code"><rect width="120" height="120" fill="#fff" stroke="#999"/><text x="60" y="56" text-anchor="middle" font-family="sans-serif" font-size="16">Demo</text><text x="60" y="76" text-anchor="middle" font-family="sans-serif" font-size="10">code 123456</text></svg>`

/** The sample closure request: the seeded business Oak & Ember and its sample owner (the id the demo owner list uses). */
const DEMO_CLOSING_BUSINESS = 'biz_oak'
const DEMO_CLOSING_OWNER = `demo-owner-${DEMO_CLOSING_BUSINESS}`

interface State {
  profile: Profile
  email: string
  pendingEmail: string | null
  factor: { id: string; verified: boolean } | null
  aal: 'aal1' | 'aal2'
  recovery: string[]
  closure: { requestedAt: string; businessId: string | null } | null
  platform: PlatformSettings
  events: SecurityEvent[]
  closureRequests: ClosureRequest[]
}

/** When the demo accounts finished "Complete your setup": they start completed, so the dashboards open directly. */
const DEMO_SETUP_COMPLETED_AT = '2026-01-01T00:00:00.000Z'

function initial(onboarding: 'completed' | 'new' = 'completed'): State {
  return {
    profile: {
      userId: 'demo-user',
      displayName: null,
      avatarUrl: null,
      timezone: 'Europe/Lisbon',
      dateFormat: 'd MMM yyyy',
      clock: '24h',
      notifyNewApplications: true,
      onboardingCompletedAt: onboarding === 'completed' ? DEMO_SETUP_COMPLETED_AT : null,
      onboardingDismissedAt: null,
    },
    email: DEMO_EMAIL,
    pendingEmail: null,
    factor: null,
    aal: 'aal1',
    recovery: [],
    closure: null,
    platform: { require2faStaff: false, require2faBusiness: false, updatedAt: null },
    events: [],
    closureRequests: [
      // The seeded business and owner (seed.ts), so the owner-removal dialog and Complete/Restore have a real target.
      { userId: DEMO_CLOSING_OWNER, email: 'closing@demo.example', businessId: DEMO_CLOSING_BUSINESS, businessName: 'Oak & Ember Studio', requestedAt: '2026-10-20T10:00:00.000Z' },
    ],
  }
}

let state = initial()
/** The status each business had when its closure request was made, to restore on cancel (as account_closure_requests). */
let statusBefore: Record<string, BusinessStatus> = { [DEMO_CLOSING_BUSINESS]: 'inactive' }

/** A draft or inactive status chosen while a request is open is the one to restore (closure_follow_status). */
export function noteMockClosureStatus(businessId: string, status: BusinessStatus): void {
  if (businessId in statusBefore && status !== 'active') statusBefore[businessId] = status
}

/** The business is inactive for the request; remember what it was. */
function pauseForClosure(businessId: string): void {
  const b = store.get().businesses.find((x) => x.id === businessId)
  if (!b) return
  statusBefore[businessId] = b.status
  if (b.status !== 'inactive') store.update((d) => void (d.businesses = d.businesses.map((x) => (x.id === businessId ? { ...x, status: 'inactive' as const, updatedAt: nowIso() } : x))))
}

/** Cancel or Restore: the business goes back to the status it had (a business already deleted is left alone). */
function restoreAfterClosure(businessId: string | null): void {
  if (!businessId) return
  const status = statusBefore[businessId]
  delete statusBefore[businessId]
  if (status) store.update((d) => void (d.businesses = d.businesses.map((x) => (x.id === businessId ? { ...x, status, updatedAt: nowIso() } : x))))
}

/** The business of the demo business account picked on /demo (the account service has no other way to know it). */
function sessionBusinessId(): string | null {
  try {
    const raw = localStorage.getItem('arfurn:account')
    const s = raw ? (JSON.parse(raw) as { role?: unknown; businessId?: unknown }) : null
    return s?.role === 'business_admin' && typeof s.businessId === 'string' ? s.businessId : null
  } catch {
    return null
  }
}

/**
 * Back to the starting state (tests, demo reset). `onboarding: 'new'` starts like a new account, with the setup
 * neither completed nor dismissed (tests of the setup checklist).
 */
/** Whether a closure request is open for this business (the demo catalog service refuses activation, R-W1-3). */
export function mockClosureOpen(businessId: string): boolean {
  return state.closure?.businessId === businessId || state.closureRequests.some((r) => r.businessId === businessId)
}

/** Removing a business's owner cancels their closure request (R-W1-2). Returns the user ids of the cancelled requests. */
export function voidMockClosure(businessId: string): string[] {
  const gone = state.closureRequests.filter((r) => r.businessId === businessId).map((r) => r.userId)
  state.closureRequests = state.closureRequests.filter((r) => r.businessId !== businessId)
  delete statusBefore[businessId]
  if (state.closure?.businessId === businessId) {
    state.closure = null
    gone.push(state.profile.userId)
  }
  return gone
}

export function resetMockAccount(opts: { onboarding?: 'completed' | 'new' } = {}): void {
  state = initial(opts.onboarding)
  statusBefore = { [DEMO_CLOSING_BUSINESS]: 'inactive' }
}

const nowIso = () => new Date().toISOString()
const isStaff = () => demoPlatformRole() !== null
/** Demo mode sends no email, so an Owner action's notice is never reported as sent (R-W7-6). */
const DEMO_NOTICE: NoticeOutcome = { status: 'blocked', error: 'demo_mode' }
const normalise = (code: string) => code.toUpperCase().replace(/[\s-]/g, '')

function record(type: string): void {
  state.events.unshift({ id: newId('sec'), type, at: nowIso(), userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null, ip: null })
  if (state.events.length > 50) state.events.length = 50
}

function recoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  const raw = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
  return `${raw.slice(0, 5)}-${raw.slice(5)}`
}

const checkCode = (code: string): Result<void> => (code.trim() === DEMO_CODE ? ok(undefined) : accountFail('invalid_code'))

/** Latency like a network call, then a copy of the answer (callers never hold live state). */
async function run<T>(fn: () => Result<T>): Promise<Result<T>> {
  if (LATENCY_MS) await new Promise((r) => setTimeout(r, LATENCY_MS))
  try {
    const r = fn()
    return r.ok ? ok(structuredClone(r.data)) : r
  } catch {
    return accountFail('unknown')
  }
}

function clearFactor(): void {
  state.factor = null
  state.recovery = []
  state.aal = 'aal1'
}

export const mockAccountService: AccountService = {
  getProfile: () => run(() => ok(state.profile)),

  updateProfile: (patch) =>
    run(() => {
      const next = { ...state.profile }
      if ('displayName' in patch) {
        const name = patch.displayName?.trim() || null
        if (!name || name.length > DISPLAY_NAME_MAX) return accountFail('invalid_name')
        next.displayName = name
      }
      if (patch.timezone !== undefined) next.timezone = patch.timezone
      if (patch.dateFormat !== undefined) next.dateFormat = patch.dateFormat
      if (patch.clock !== undefined) next.clock = patch.clock
      if (patch.notifyNewApplications !== undefined) next.notifyNewApplications = patch.notifyNewApplications
      state.profile = next
      return ok(next)
    }),

  uploadAvatar: (file) =>
    run(() => {
      if (!AVATAR_TYPES[file.type] || file.size > AVATAR_MAX_BYTES) return accountFail('invalid_avatar')
      if (state.profile.avatarUrl?.startsWith('blob:')) URL.revokeObjectURL?.(state.profile.avatarUrl)
      // Session-only: the photo lives in this tab until reload.
      state.profile = { ...state.profile, avatarUrl: typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : 'blob:demo-avatar' }
      return ok(state.profile)
    }),

  removeAvatar: () =>
    run(() => {
      if (state.profile.avatarUrl?.startsWith('blob:')) URL.revokeObjectURL?.(state.profile.avatarUrl)
      state.profile = { ...state.profile, avatarUrl: null }
      return ok(state.profile)
    }),

  setOnboarding: (s) =>
    run(() => {
      state.profile = { ...state.profile, [s === 'completed' ? 'onboardingCompletedAt' : 'onboardingDismissedAt']: nowIso() }
      return ok(undefined)
    }),

  getSecurityState: () =>
    run(() => {
      const verified = state.factor?.verified === true
      const s: SecurityState = {
        requires2fa: isStaff() ? state.platform.require2faStaff : state.platform.require2faBusiness,
        aal: state.aal,
        hasVerifiedFactor: verified,
        recoveryCodesLeft: verified ? state.recovery.length : null,
        pendingEmail: state.pendingEmail,
        closure: state.closure,
        onboarding: { completedAt: state.profile.onboardingCompletedAt, dismissedAt: state.profile.onboardingDismissedAt },
      }
      return ok(s)
    }),

  getAssurance: () => run(() => ok({ currentLevel: state.aal, nextLevel: state.factor?.verified ? ('aal2' as const) : ('aal1' as const) })),

  recordSignIn: () =>
    run(() => {
      record('account_signed_in')
      return ok(undefined)
    }),

  listSecurityEvents: () => run(() => ok(state.events)),

  changePassword: (current, next) =>
    run(() => {
      if (next.length < PASSWORD_MIN || next.length > PASSWORD_MAX) return accountFail('weak_password')
      if (current === next) return accountFail('same_password')
      record('account_password_changed')
      return ok(undefined)
    }),

  requestEmailChange: (_password, newEmail) =>
    run(() => {
      const email = newEmail.trim()
      if (!EMAIL_PATTERN.test(email)) return accountFail('invalid_email')
      if (email.toLowerCase() === state.email) return accountFail('email_taken')
      state.pendingEmail = email
      record('account_email_change_requested')
      return ok(undefined)
    }),

  cancelEmailChange: () =>
    run(() => {
      state.pendingEmail = null
      return ok(undefined)
    }),

  signOutOtherDevices: () => run(() => ok(undefined)),

  startTotpEnrollment: () =>
    run(() => {
      if (state.factor?.verified) return accountFail('invalid_request')
      state.factor = { id: newId('factor'), verified: false }
      return ok({ factorId: state.factor.id, qrSvg: DEMO_QR, secret: 'DEMO DEMO DEMO DEMO' })
    }),

  confirmTotpEnrollment: (factorId, code) =>
    run(() => {
      if (!state.factor || state.factor.id !== factorId) return accountFail('not_found')
      const c = checkCode(code)
      if (!c.ok) return c
      state.factor = { ...state.factor, verified: true }
      state.aal = 'aal2'
      record('account_2fa_enabled')
      return ok(undefined)
    }),

  verifyTotpForSignIn: (code) =>
    run(() => {
      if (!state.factor?.verified) return accountFail('not_found')
      const c = checkCode(code)
      if (!c.ok) return c
      state.aal = 'aal2'
      return ok(undefined)
    }),

  sendActionCode: () => run(() => ok({ sentTo: DEMO_SENT_TO })),

  generateRecoveryCodes: (code) =>
    run(() => {
      if (state.aal !== 'aal2' || !state.factor?.verified) return accountFail('aal2_required')
      // A first set needs no code; a regenerate needs the emailed one (as the real function does).
      if (state.recovery.length > 0) {
        if (code === undefined) return accountFail('invalid_code')
        const c = checkCode(code)
        if (!c.ok) return c
        record('account_recovery_regenerated')
      }
      state.recovery = Array.from({ length: 8 }, recoveryCode)
      return ok(state.recovery)
    }),

  redeemRecoveryCode: (code) =>
    run(() => {
      const i = state.recovery.findIndex((c) => normalise(c) === normalise(code))
      if (!state.factor?.verified || i < 0) return accountFail('invalid_code')
      // Like the real function: the code is used, 2FA is removed and the user sets it up again.
      clearFactor()
      record('account_recovery_used')
      return ok(undefined)
    }),

  disable2fa: (code) =>
    run(() => {
      if (state.aal !== 'aal2') return accountFail('aal2_required')
      if (isStaff() ? state.platform.require2faStaff : state.platform.require2faBusiness) return accountFail('policy_requires_2fa')
      const c = checkCode(code)
      if (!c.ok) return c
      clearFactor()
      record('account_2fa_disabled')
      return ok(undefined)
    }),

  requestClosure: (code) =>
    run(() => {
      const c = checkCode(code)
      if (!c.ok) return c
      if (demoPlatformRole() === 'owner') return accountFail('owner_cannot_close')
      if (state.closure) return accountFail('already_requested')
      const kind = isStaff() ? ('staff' as const) : ('business' as const)
      if (kind === 'business') {
        // As request_closure: the business becomes inactive and its status is remembered.
        const businessId = sessionBusinessId()
        state.closure = { requestedAt: nowIso(), businessId }
        if (businessId) pauseForClosure(businessId)
      }
      // As the database (R-W6-3): the member's Access history shows that they closed their own account.
      else recordDemoSelfClosure()
      record(kind === 'staff' ? 'account_deleted' : 'account_closure_requested')
      return ok({ kind })
    }),

  cancelClosure: () =>
    run(() => {
      if (!state.closure) return accountFail('not_found')
      restoreAfterClosure(state.closure.businessId)
      state.closure = null
      record('account_closure_cancelled')
      return ok(undefined)
    }),

  getPlatformSettings: () => run(() => ok(state.platform)),

  updatePlatformSettings: (patch) =>
    run(() => {
      if (state.aal !== 'aal2') return accountFail('aal2_required')
      state.platform = {
        require2faStaff: patch.require2faStaff ?? state.platform.require2faStaff,
        require2faBusiness: patch.require2faBusiness ?? state.platform.require2faBusiness,
        updatedAt: nowIso(),
      }
      // Not recorded in the person's Security activity: the platform policy log is not theirs (R-W8-6).
      return ok(state.platform)
    }),

  ownerReset2fa: (target, code) =>
    run(() => {
      if (state.aal !== 'aal2') return accountFail('aal2_required')
      // As account-security (R-W6-6): a team member with no 2FA has nothing to reset, and the code is kept.
      if (demoMemberHas2fa(target) === false) return accountFail('nothing_to_reset')
      const r = checkCode(code)
      if (!r.ok) return r
      clearDemoMember2fa(target)
      return ok({ notice: DEMO_NOTICE })
    }),

  listClosureRequests: () => run(() => ok(state.closureRequests)),

  completeClosure: async (target, code) => {
    const found = await run(() => {
      if (state.aal !== 'aal2') return accountFail('aal2_required')
      const c = checkCode(code)
      if (!c.ok) return c
      const req = state.closureRequests.find((r) => r.userId === target)
      return req ? ok(req.businessId) : accountFail('not_found')
    })
    if (!found.ok) return found
    // Complete deletes the business (with its owner, products and events) and ends the request.
    if (found.data) {
      await mockCatalogService.deleteBusiness(found.data)
      delete statusBefore[found.data]
    }
    state.closureRequests = state.closureRequests.filter((r) => r.userId !== target)
    return ok({ notice: DEMO_NOTICE })
  },

  restoreClosure: (target) =>
    run(() => {
      if (state.aal !== 'aal2') return accountFail('aal2_required')
      const req = state.closureRequests.find((r) => r.userId === target)
      if (!req) return accountFail('not_found')
      restoreAfterClosure(req.businessId)
      state.closureRequests = state.closureRequests.filter((r) => r.userId !== target)
      return ok({ notice: DEMO_NOTICE })
    }),
}
