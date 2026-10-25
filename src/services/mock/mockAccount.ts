// Demo implementation of the account settings, security and 2FA methods (S1). A test harness only: it keeps its
// state in memory (gone on reload), sends no email and checks no real authenticator. Every action code and TOTP code
// is the demo code 123456, and the setup QR code says "Demo". The rules mirror the real service so the UI can be
// driven by tests: same validation, same reasons, aal2 needed for the platform policy.
import type { ClosureRequest, PlatformSettings, Profile, SecurityEvent, SecurityState } from '@/domain/types'
import { newId } from '@/lib/id'
import { type AccountService, AVATAR_MAX_BYTES, AVATAR_TYPES, DISPLAY_NAME_MAX, EMAIL_PATTERN, PASSWORD_MAX, PASSWORD_MIN, accountFail } from '../accountService'
import { type Result, ok } from '../catalogService'
import { demoPlatformRole } from './mockTeam'

/** The only code the demo accepts, for action codes and the authenticator alike. */
export const DEMO_CODE = '123456'
const DEMO_EMAIL = 'demo@demo.example'
const DEMO_SENT_TO = 'd•••@demo.example'
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const LATENCY_MS = import.meta.env.MODE === 'test' ? 0 : 150

const DEMO_QR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="Demo QR code"><rect width="120" height="120" fill="#fff" stroke="#999"/><text x="60" y="56" text-anchor="middle" font-family="sans-serif" font-size="16">Demo</text><text x="60" y="76" text-anchor="middle" font-family="sans-serif" font-size="10">code 123456</text></svg>`

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

function initial(): State {
  return {
    profile: {
      userId: 'demo-user',
      displayName: null,
      avatarUrl: null,
      timezone: 'Europe/Lisbon',
      dateFormat: 'd MMM yyyy',
      clock: '24h',
      notifyNewApplications: true,
      onboardingCompletedAt: null,
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
      { userId: 'demo-closing-owner', email: 'closing@demo.example', businessId: 'demo-business', businessName: 'Demo closing business', requestedAt: '2026-10-20T10:00:00.000Z' },
    ],
  }
}

let state = initial()

/** Back to the starting state (tests, demo reset). */
export function resetMockAccount(): void {
  state = initial()
}

const nowIso = () => new Date().toISOString()
const isStaff = () => demoPlatformRole() !== null
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
      if (kind === 'business') state.closure = { requestedAt: nowIso(), businessId: 'demo-business' }
      record(kind === 'staff' ? 'account_deleted' : 'account_closure_requested')
      return ok({ kind })
    }),

  cancelClosure: () =>
    run(() => {
      if (!state.closure) return accountFail('not_found')
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
      record('platform_security_policy_changed')
      return ok(state.platform)
    }),

  ownerReset2fa: (_target, code) =>
    run(() => {
      if (state.aal !== 'aal2') return accountFail('aal2_required')
      return checkCode(code)
    }),

  listClosureRequests: () => run(() => ok(state.closureRequests)),

  completeClosure: (target, code) =>
    run(() => {
      if (state.aal !== 'aal2') return accountFail('aal2_required')
      const c = checkCode(code)
      if (!c.ok) return c
      if (!state.closureRequests.some((r) => r.userId === target)) return accountFail('not_found')
      state.closureRequests = state.closureRequests.filter((r) => r.userId !== target)
      return ok(undefined)
    }),

  restoreClosure: (target) =>
    run(() => {
      if (state.aal !== 'aal2') return accountFail('aal2_required')
      if (!state.closureRequests.some((r) => r.userId === target)) return accountFail('not_found')
      state.closureRequests = state.closureRequests.filter((r) => r.userId !== target)
      return ok(undefined)
    }),
}
