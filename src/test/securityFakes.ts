// Fakes for the sign-in 2FA tests: a Supabase-like auth whose session the test controls, and an account service
// whose 2FA state (factor, aal, policy) the test sets. Tests swap them into '@/services' with vi.mock.
import { act } from '@testing-library/react'
import { vi } from 'vitest'
import type { SecurityState } from '@/domain/types'
import type { AccountService, AuthService, SignedInAccount } from '@/services'
import { accountFail } from '@/services/accountService'
import { fail, ok } from '@/services/catalogService'

export const TOTP = '123456'
export const RECOVERY = 'ABCDE-FGHJK'

export const ADMIN: SignedInAccount = { email: 'ana@test', user: { id: 'u1', name: 'Ana', email: 'ana@test', role: 'super_admin' } }
/** A business owner whose business is a draft: at aal1 under 2FA rules the database hides it (NOT_FOUND). */
export const DRAFT_OWNER: SignedInAccount = { email: 'rui@test', user: { id: 'u2', name: 'Rui', email: 'rui@test', role: 'business_admin', businessId: 'biz_draft' } }

/** `signsInAs`: the account a right password ("right-password") signs in. */
export function fakeAuth(initial: SignedInAccount | null = null, signsInAs: SignedInAccount = ADMIN) {
  const listeners = new Set<() => void>()
  let session: SignedInAccount | null = initial
  /** Fires an auth event (SIGNED_IN, TOKEN_REFRESHED…): the provider reloads the account. */
  const emit = () => act(() => listeners.forEach((l) => l()))
  const auth: AuthService = {
    getSession: vi.fn(async () => ok(null)),
    getCurrentUser: vi.fn(async () => ok(session)),
    signInWithPassword: vi.fn(async (_email: string, password: string) => {
      if (password !== 'right-password') return { ok: false as const, error: { code: 'VALIDATION' as const, message: 'Email or password is incorrect.', reason: 'invalid_credentials' } }
      session = signsInAs
      setTimeout(() => listeners.forEach((l) => l()), 0) // SIGNED_IN
      return ok(undefined)
    }),
    signOut: vi.fn(async () => {
      session = null
      return ok(undefined)
    }),
    requestPasswordReset: vi.fn(async () => ok(undefined)),
    verifyEmailCode: vi.fn(async () => ok(undefined)),
    updatePassword: vi.fn(async () => ok(undefined)),
    updateDisplayName: vi.fn(async () => ok(undefined)),
    completeOwnerOnboarding: vi.fn(async () => ok({ businessId: 'biz_casa' })),
    onAuthStateChange: vi.fn((l: () => void) => {
      listeners.add(l)
      return () => listeners.delete(l)
    }),
  }
  return { auth, emit, setSession: (s: SignedInAccount | null) => (session = s) }
}

export interface FakeSecurity {
  factor: boolean
  aal: 'aal1' | 'aal2'
  requires2fa: boolean
  recovery: string[]
}

/** An account service with just the 2FA methods; every other method fails loudly. */
export function fakeAccount(start: Partial<FakeSecurity> = {}) {
  const s: FakeSecurity = { factor: false, aal: 'aal1', requires2fa: false, recovery: [RECOVERY], ...start }
  const normalise = (c: string) => c.toUpperCase().replace(/[\s-]/g, '')
  const state = (): SecurityState => ({
    requires2fa: s.requires2fa,
    aal: s.aal,
    hasVerifiedFactor: s.factor,
    recoveryCodesLeft: s.factor ? s.recovery.length : null,
    pendingEmail: null,
    closure: null,
    onboarding: { completedAt: null, dismissedAt: null },
  })
  let pendingFactor: string | null = null
  const impl: Partial<AccountService> = {
    getSecurityState: vi.fn(async () => ok(state())),
    getAssurance: vi.fn(async () => ok({ currentLevel: s.aal, nextLevel: s.factor ? ('aal2' as const) : ('aal1' as const) })),
    recordSignIn: vi.fn(async () => ok(undefined)),
    verifyTotpForSignIn: vi.fn(async (code: string) => {
      if (!s.factor) return accountFail('not_found')
      if (code !== TOTP) return accountFail('invalid_code')
      s.aal = 'aal2'
      return ok(undefined)
    }),
    redeemRecoveryCode: vi.fn(async (code: string) => {
      const i = s.recovery.findIndex((c) => normalise(c) === normalise(code))
      if (!s.factor || i < 0) return accountFail('invalid_code')
      s.recovery.splice(i, 1)
      s.factor = false
      s.aal = 'aal1'
      return ok(undefined)
    }),
    startTotpEnrollment: vi.fn(async () => {
      pendingFactor = 'factor-1'
      return ok({ factorId: pendingFactor, qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>', secret: 'ABCDABCDABCD' })
    }),
    confirmTotpEnrollment: vi.fn(async (factorId: string, code: string) => {
      if (factorId !== pendingFactor) return accountFail('not_found')
      if (code !== TOTP) return accountFail('invalid_code')
      s.factor = true
      s.aal = 'aal2'
      return ok(undefined)
    }),
    generateRecoveryCodes: vi.fn(async () => ok(['AAAAA-AAAAA', 'BBBBB-BBBBB', 'CCCCC-CCCCC', 'DDDDD-DDDDD', 'EEEEE-EEEEE', 'FFFFF-FFFFF', 'GGGGG-GGGGG', 'HHHHH-HHHHH'])),
  }
  const account = new Proxy(impl as AccountService, {
    get: (target, key) => (key === 'then' ? undefined : (Reflect.get(target, key) ?? (async () => fail('UNKNOWN', `fakeAccount.${String(key)} is not faked`)))),
  })
  return { account, impl, s }
}
