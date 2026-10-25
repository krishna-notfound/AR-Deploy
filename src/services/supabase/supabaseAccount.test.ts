import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { settingsPath } from '@/lib/urls'
import { createSupabaseAccount, makeVerifyCurrentPassword } from './supabaseAccount'

type Answer = { data?: unknown; error?: unknown }
type Call = [string, ...unknown[]]

const UID = 'user-1'
const authError = (code: string, status = 422) => ({ name: 'AuthApiError', code, status, message: `raw provider text: ${code}` })
/** What supabase-js returns for a non-2xx function response: a FunctionsHttpError whose context is the Response. */
const httpError = (status: number, body: unknown) => ({ name: 'FunctionsHttpError', context: new Response(JSON.stringify(body), { status }) })

/**
 * supabase-js stand-in that records every call. `tables[name]` answers a query on that table: it gets the chain of
 * builder calls (['select', cols], ['eq', col, v], ['upsert', row], ...) and returns { data, error }.
 */
function fake(opts: {
  rpc?: Record<string, Answer>
  invoke?: Answer
  tables?: Record<string, (calls: Call[]) => Answer>
  auth?: Partial<Record<string, (...args: unknown[]) => unknown>>
  mfa?: Partial<Record<string, (...args: unknown[]) => unknown>>
  storage?: Partial<Record<string, (...args: unknown[]) => unknown>>
  /** How the throwaway password-check client answers signInWithPassword. */
  password?: 'ok' | 'wrong' | 'http429' | 'rate_code' | 'server' | 'fetch' | 'throws'
} = {}) {
  const log: Call[] = []
  const queries: { table: string; calls: Call[] }[] = []
  const rec = (name: string, impl?: (...a: unknown[]) => unknown, fallback: unknown = { data: {}, error: null }) =>
    vi.fn(async (...args: unknown[]) => {
      log.push([name, ...args])
      return impl ? impl(...args) : fallback
    })

  const rpc = rec('rpc', (fn) => ({ data: null, error: null, ...(opts.rpc?.[fn as string] ?? {}) }))
  const invoke = rec('invoke', () => ({ data: null, error: null, ...(opts.invoke ?? {}) }))

  function from(table: string) {
    const q = { table, calls: [] as Call[] }
    queries.push(q)
    const answer = () => Promise.resolve({ data: null, error: null, ...(opts.tables?.[table]?.(q.calls) ?? {}) })
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'upsert', 'update', 'insert', 'order', 'limit']) {
      builder[m] = (...args: unknown[]) => {
        q.calls.push([m, ...args])
        return builder
      }
    }
    builder.maybeSingle = () => answer()
    builder.single = () => answer()
    builder.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => answer().then(res, rej)
    return builder
  }

  const user = { id: UID, email: 'ana@studio.pt', new_email: null as string | null }
  const auth = {
    getUser: rec('auth.getUser', opts.auth?.getUser ?? (() => ({ data: { user }, error: null }))),
    updateUser: rec('auth.updateUser', opts.auth?.updateUser ?? (() => ({ data: { user }, error: null }))),
    signOut: rec('auth.signOut', opts.auth?.signOut ?? (() => ({ error: null }))),
    signInWithPassword: rec('auth.signInWithPassword', opts.auth?.signInWithPassword ?? (() => ({ data: {}, error: null }))),
    refreshSession: rec('auth.refreshSession', opts.auth?.refreshSession ?? (() => ({ data: {}, error: null }))),
    mfa: {
      listFactors: rec('mfa.listFactors', opts.mfa?.listFactors ?? (() => ({ data: { all: [], totp: [], phone: [] }, error: null }))),
      enroll: rec('mfa.enroll', opts.mfa?.enroll),
      unenroll: rec('mfa.unenroll', opts.mfa?.unenroll ?? (() => ({ data: {}, error: null }))),
      challengeAndVerify: rec('mfa.challengeAndVerify', opts.mfa?.challengeAndVerify ?? (() => ({ data: {}, error: null }))),
      getAuthenticatorAssuranceLevel: rec(
        'mfa.getAuthenticatorAssuranceLevel',
        opts.mfa?.getAuthenticatorAssuranceLevel ?? (() => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })),
      ),
    },
  }
  const bucket = {
    upload: rec('storage.upload', opts.storage?.upload ?? (() => ({ data: {}, error: null }))),
    remove: rec('storage.remove', opts.storage?.remove ?? (() => ({ data: [], error: null }))),
    getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.test/avatars/${path}` } })),
  }
  const storageFrom = vi.fn((name: string) => {
    log.push(['storage.from', name])
    return bucket
  })
  const sb = { rpc, functions: { invoke }, from, auth, storage: { from: storageFrom } } as unknown as SupabaseClient
  // The throwaway client the password check runs on (never the main session).
  const pwAuth = {
    signInWithPassword: rec('pw.signInWithPassword', () => {
      const no = (error: unknown) => ({ data: { session: null }, error })
      switch (opts.password) {
        case 'wrong': return no(authError('invalid_credentials', 400))
        case 'http429': return no({ name: 'AuthApiError', status: 429, message: 'raw' })
        case 'rate_code': return no(authError('over_request_rate_limit', 400))
        case 'server': return no({ name: 'AuthApiError', status: 503, message: 'raw' })
        case 'fetch': return no({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' })
        case 'throws': throw new TypeError('Failed to fetch')
        default: return { data: { session: {} }, error: null }
      }
    }),
    signOut: rec('pw.signOut', () => ({ error: null })),
  }
  const pw = { auth: pwAuth } as unknown as SupabaseClient
  const newPasswordClient = vi.fn(() => pw)
  const deps = { verifyCurrentPassword: makeVerifyCurrentPassword(newPasswordClient) }
  return { sb, log, queries, rpc, invoke, auth, bucket, pwAuth, newPasswordClient, deps }
}

const names = (log: Call[]) => log.map((c) => c[0])
const account = (f: ReturnType<typeof fake>) => createSupabaseAccount(f.sb, f.deps)

const PROFILE_ROW = {
  user_id: UID,
  display_name: 'Ana',
  avatar_path: null,
  timezone: 'Europe/Lisbon',
  date_format: 'd MMM yyyy',
  clock: '24h',
  notify_new_applications: true,
  onboarding_completed_at: null,
  onboarding_dismissed_at: null,
}

describe('Supabase account service', () => {
  it('changePassword calls updateUser with current_password and then signOut scope others; maps current_password_mismatch and same_password', async () => {
    const f = fake()
    expect(await account(f).changePassword('old-password-1', 'new-password-12')).toEqual({ ok: true, data: undefined })
    expect(f.auth.updateUser).toHaveBeenCalledWith({ password: 'new-password-12', current_password: 'old-password-1' })
    expect(f.auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
    const order = names(f.log)
    expect(order.indexOf('auth.updateUser')).toBeLessThan(order.indexOf('auth.signOut'))
    expect(f.rpc).toHaveBeenCalledWith('log_account_event', { p_event: 'account_password_changed' })

    for (const code of ['current_password_mismatch', 'same_password']) {
      const g = fake({ auth: { updateUser: () => ({ data: { user: null }, error: authError(code) }) } })
      const r = await account(g).changePassword('old-password-1', 'new-password-12')
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.error.reason).toBe(code)
        expect(r.error.message).not.toContain('raw provider text')
      }
      expect(g.auth.signOut).not.toHaveBeenCalled()
    }

    const short = await account(fake()).changePassword('old', 'short')
    expect(!short.ok && short.error.reason).toBe('weak_password')
  })

  it("requestEmailChange verifies the password on a throwaway client first and maps a failure to password_incorrect; then calls updateUser({ email }, { emailRedirectTo: origin + settingsPath('business'|'admin','account') }) and logs account_email_change_requested", async () => {
    const bad = fake({ password: 'wrong' })
    const r = await account(bad).requestEmailChange('wrong', 'new@studio.pt')
    expect(!r.ok && r.error.reason).toBe('password_incorrect')
    expect(bad.auth.updateUser).not.toHaveBeenCalled()

    history.replaceState(null, '', '/dashboard/settings/account')
    const f = fake()
    expect((await account(f).requestEmailChange('right', 'new@studio.pt')).ok).toBe(true)
    expect(f.pwAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'ana@studio.pt', password: 'right' })
    expect(f.auth.updateUser).toHaveBeenCalledWith({ email: 'new@studio.pt' }, { emailRedirectTo: location.origin + settingsPath('business', 'account') })
    const order = names(f.log)
    expect(order.indexOf('pw.signInWithPassword')).toBeLessThan(order.indexOf('auth.updateUser'))
    expect(f.rpc).toHaveBeenCalledWith('log_account_event', { p_event: 'account_email_change_requested' })

    history.replaceState(null, '', '/admin/settings/account')
    const s = fake()
    await account(s).requestEmailChange('right', 'new@studio.pt')
    expect(s.auth.updateUser).toHaveBeenCalledWith({ email: 'new@studio.pt' }, { emailRedirectTo: location.origin + settingsPath('admin', 'account') })
    history.replaceState(null, '', '/')

    const taken = fake({ auth: { updateUser: () => ({ data: { user: null }, error: authError('email_exists') }) } })
    const t = await account(taken).requestEmailChange('right', 'used@studio.pt')
    expect(!t.ok && t.error.reason).toBe('email_taken')
    const invalid = await account(fake()).requestEmailChange('right', 'nope')
    expect(!invalid.ok && invalid.error.reason).toBe('invalid_email')
  })

  it("requestEmailChange never calls signInWithPassword on the main client, so the main session and its aal stay as they were", async () => {
    for (const password of ['ok', 'wrong'] as const) {
      const f = fake({ password })
      await account(f).requestEmailChange('pw', 'new@studio.pt')
      expect(f.auth.signInWithPassword).not.toHaveBeenCalled()
      expect(f.auth.signOut).not.toHaveBeenCalled()
      expect(f.auth.refreshSession).not.toHaveBeenCalled()
      expect(f.pwAuth.signInWithPassword).toHaveBeenCalledTimes(1)
    }
  })

  it('verifyCurrentPassword uses a new throwaway client per call and signs it out (scope local) right after a successful check', async () => {
    const f = fake()
    expect(await f.deps.verifyCurrentPassword('ana@studio.pt', 'right')).toBe('ok')
    expect(await f.deps.verifyCurrentPassword('ana@studio.pt', 'right')).toBe('ok')
    expect(f.newPasswordClient).toHaveBeenCalledTimes(2)
    expect(f.pwAuth.signOut).toHaveBeenCalledTimes(2)
    expect(f.pwAuth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    const order = names(f.log)
    expect(order.indexOf('pw.signInWithPassword')).toBeLessThan(order.indexOf('pw.signOut'))

    const wrong = fake({ password: 'wrong' })
    expect(await wrong.deps.verifyCurrentPassword('ana@studio.pt', 'nope')).toBe('password_incorrect')
    expect(wrong.pwAuth.signOut).not.toHaveBeenCalled()

    const throws = makeVerifyCurrentPassword(() => {
      throw new Error('offline')
    })
    expect(await throws('ana@studio.pt', 'x')).toBe('unknown')
  })

  it('verifyCurrentPassword tells a wrong password from a rate limit and from a network or server failure', async () => {
    const outcomes = { wrong: 'password_incorrect', http429: 'rate_limited', rate_code: 'rate_limited', server: 'unknown', fetch: 'unknown', throws: 'unknown' } as const
    for (const [password, expected] of Object.entries(outcomes)) {
      const f = fake({ password: password as keyof typeof outcomes })
      expect(await f.deps.verifyCurrentPassword('ana@studio.pt', 'x'), password).toBe(expected)
    }
  })

  it('requestEmailChange reports a rate-limited or failed password check as such, not as a wrong password', async () => {
    const limited = fake({ password: 'http429' })
    const r = await account(limited).requestEmailChange('pw', 'new@studio.pt')
    expect(!r.ok && r.error.reason).toBe('rate_limited')
    expect(limited.auth.updateUser).not.toHaveBeenCalled()

    const thrown = fake({ password: 'throws' })
    const t = await account(thrown).requestEmailChange('pw', 'new@studio.pt')
    expect(!t.ok && t.error).toMatchObject({ code: 'UNKNOWN', reason: 'unknown' })
    expect(thrown.auth.updateUser).not.toHaveBeenCalled()
  })

  it('cancelEmailChange sets the address back to the current one', async () => {
    const f = fake()
    expect(await account(f).cancelEmailChange()).toEqual({ ok: true, data: undefined })
    expect(f.auth.updateUser).toHaveBeenCalledWith({ email: 'ana@studio.pt' })
    const failing = fake({ auth: { updateUser: () => ({ data: { user: null }, error: authError('unexpected_failure', 500) }) } })
    const r = await account(failing).cancelEmailChange()
    expect(!r.ok && r.error.reason).toBe('unknown')
  })

  it('getSecurityState combines my_security_state, mfa.listFactors (verified totp), my_recovery_codes_left and user.new_email', async () => {
    const verified = { id: 'f1', factor_type: 'totp', status: 'verified' }
    const f = fake({
      rpc: {
        my_security_state: { data: { requires_2fa: true, aal: 'aal2', closure: { requested_at: '2026-10-20T10:00:00Z', business_id: 'b1' }, onboarding: { completed_at: null, dismissed_at: '2026-10-21T10:00:00Z' } } },
        my_recovery_codes_left: { data: 6 },
      },
      auth: { getUser: () => ({ data: { user: { id: UID, email: 'ana@studio.pt', new_email: 'new@studio.pt' } }, error: null }) },
      mfa: { listFactors: () => ({ data: { all: [verified, { id: 'f2', factor_type: 'totp', status: 'unverified' }], totp: [verified], phone: [] }, error: null }) },
    })
    expect(await account(f).getSecurityState()).toEqual({
      ok: true,
      data: {
        requires2fa: true,
        aal: 'aal2',
        hasVerifiedFactor: true,
        recoveryCodesLeft: 6,
        pendingEmail: 'new@studio.pt',
        closure: { requestedAt: '2026-10-20T10:00:00Z', businessId: 'b1' },
        onboarding: { completedAt: null, dismissedAt: '2026-10-21T10:00:00Z' },
      },
    })

    // Without a verified factor the recovery-code count does not apply.
    const none = fake({ rpc: { my_security_state: { data: { requires_2fa: false, aal: 'aal1', closure: null, onboarding: { completed_at: null, dismissed_at: null } } } } })
    const r = await account(none).getSecurityState()
    expect(r.ok && r.data).toMatchObject({ requires2fa: false, aal: 'aal1', hasVerifiedFactor: false, recoveryCodesLeft: null, pendingEmail: null, closure: null })

    // No aal claim in the answer: treated as aal1 (never assumed to be aal2).
    const noAal = fake({ rpc: { my_security_state: { data: { requires_2fa: true, closure: null, onboarding: { completed_at: null, dismissed_at: null } } } } })
    const n = await account(noAal).getSecurityState()
    expect(n.ok && n.data).toMatchObject({ aal: 'aal1', requires2fa: true })

    // A database failure is reported, never replaced by defaults.
    const broken = fake({ rpc: { my_security_state: { error: { code: 'PGRST202', message: 'not found' } } } })
    const b = await account(broken).getSecurityState()
    expect(!b.ok && b.error.reason).toBe('not_enabled')
  })

  it('getAssurance reads the local assurance level (mfa.getAuthenticatorAssuranceLevel) and reports a failure', async () => {
    const f = fake({ mfa: { getAuthenticatorAssuranceLevel: () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null }) } })
    expect(await account(f).getAssurance()).toEqual({ ok: true, data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
    const up = fake({ mfa: { getAuthenticatorAssuranceLevel: () => ({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null }) } })
    expect(await account(up).getAssurance()).toEqual({ ok: true, data: { currentLevel: 'aal2', nextLevel: 'aal2' } })
    // No session yet (null levels) reads as aal1, never as aal2.
    const empty = fake({ mfa: { getAuthenticatorAssuranceLevel: () => ({ data: { currentLevel: null, nextLevel: null }, error: null }) } })
    expect(await account(empty).getAssurance()).toEqual({ ok: true, data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
    const broken = fake({ mfa: { getAuthenticatorAssuranceLevel: () => ({ data: null, error: { message: 'boom' } }) } })
    const b = await account(broken).getAssurance()
    expect(b.ok).toBe(false)
  })

  it('startTotpEnrollment removes stale unverified factors before mfa.enroll; confirmTotpEnrollment uses challengeAndVerify and maps a wrong code to invalid_code', async () => {
    const stale = { id: 'old', factor_type: 'totp', status: 'unverified' }
    const f = fake({
      mfa: {
        listFactors: () => ({ data: { all: [stale, { id: 'keep', factor_type: 'totp', status: 'verified' }], totp: [], phone: [] }, error: null }),
        enroll: () => ({ data: { id: 'new', type: 'totp', totp: { qr_code: '<svg>qr</svg>', secret: 'SECRET', uri: 'otpauth://x' } }, error: null }),
      },
    })
    const a = account(f)
    expect(await a.startTotpEnrollment()).toEqual({ ok: true, data: { factorId: 'new', qrSvg: '<svg>qr</svg>', secret: 'SECRET' } })
    expect(f.auth.mfa.unenroll).toHaveBeenCalledTimes(1)
    expect(f.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'old' })
    expect(f.auth.mfa.enroll).toHaveBeenCalledWith({ factorType: 'totp', friendlyName: 'Authenticator' })
    const order = names(f.log)
    expect(order.indexOf('mfa.unenroll')).toBeLessThan(order.indexOf('mfa.enroll'))

    expect((await a.confirmTotpEnrollment('new', '123456')).ok).toBe(true)
    expect(f.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'new', code: '123456' })

    const wrong = fake({ mfa: { challengeAndVerify: () => ({ data: null, error: authError('mfa_verification_failed') }) } })
    const r = await account(wrong).confirmTotpEnrollment('new', '000000')
    expect(!r.ok && r.error.reason).toBe('invalid_code')

    const rejected = fake({ mfa: { challengeAndVerify: () => ({ data: null, error: authError('mfa_verification_rejected') }) } })
    const rj = await account(rejected).confirmTotpEnrollment('new', '123456')
    expect(!rj.ok && rj.error.reason).toBe('invalid_code')

    const off = fake({ mfa: { enroll: () => ({ data: null, error: authError('mfa_totp_enroll_not_enabled') }) } })
    const o = await account(off).startTotpEnrollment()
    expect(!o.ok && o.error.reason).toBe('mfa_not_enabled')
  })

  it('startTotpEnrollment maps enrolment errors on their own and never answers invalid_code', async () => {
    const cases = [
      [authError('insufficient_aal', 401), 'aal2_required'],
      [authError('too_many_enrolled_mfa_factors', 422), 'unknown'],
      [authError('validation_failed', 422), 'unknown'],
      [authError('mfa_factor_name_conflict', 422), 'unknown'],
    ] as const
    for (const [error, reason] of cases) {
      const f = fake({ mfa: { enroll: () => ({ data: null, error }) } })
      const r = await account(f).startTotpEnrollment()
      expect(!r.ok && r.error.reason, error.code).toBe(reason)
    }
    const unenrol = fake({
      mfa: {
        listFactors: () => ({ data: { all: [{ id: 'old', factor_type: 'totp', status: 'unverified' }], totp: [], phone: [] }, error: null }),
        unenroll: () => ({ data: null, error: authError('unexpected_failure', 422) }),
      },
    })
    const u = await account(unenrol).startTotpEnrollment()
    expect(!u.ok && u.error.reason).toBe('unknown')
  })

  it('redeemRecoveryCode refreshes the session after the factor is removed, and tries once more when that refresh fails', async () => {
    let calls = 0
    const f = fake({
      invoke: { data: { ok: true } },
      auth: { refreshSession: () => (++calls === 1 ? { data: {}, error: { message: 'offline' } } : { data: {}, error: null }) },
    })
    expect((await account(f).redeemRecoveryCode('ABCDE-FGHJK')).ok).toBe(true)
    expect(f.auth.refreshSession).toHaveBeenCalledTimes(2)
    // A refresh that throws is retried as well, and the accepted code still counts as ok.
    const thrown = fake({
      invoke: { data: { ok: true } },
      auth: {
        refreshSession: () => {
          throw new Error('network')
        },
      },
    })
    expect((await account(thrown).redeemRecoveryCode('ABCDE-FGHJK')).ok).toBe(true)
    expect(thrown.auth.refreshSession).toHaveBeenCalledTimes(2)
  })

  it('function-backed methods post { action, ... } to account-security and map { ok:false, error } to ServiceError.reason', async () => {
    const f = fake({ invoke: { data: { ok: true, sentTo: 'a•••@studio.pt' } } })
    const a = account(f)
    expect(await a.sendActionCode('disable_2fa')).toEqual({ ok: true, data: { sentTo: 'a•••@studio.pt' } })
    expect(f.invoke).toHaveBeenLastCalledWith('account-security', { body: { action: 'send_code', purpose: 'disable_2fa' } })
    await a.disable2fa('123456')
    expect(f.invoke).toHaveBeenLastCalledWith('account-security', { body: { action: 'disable_2fa', code: '123456' } })
    await a.redeemRecoveryCode('ABCDE-FGHJK')
    expect(f.invoke).toHaveBeenLastCalledWith('account-security', { body: { action: 'redeem_recovery_code', code: 'ABCDE-FGHJK' } })
    await a.generateRecoveryCodes()
    expect(f.invoke).toHaveBeenLastCalledWith('account-security', { body: { action: 'generate_recovery_codes' } })
    await a.generateRecoveryCodes('654321')
    expect(f.invoke).toHaveBeenLastCalledWith('account-security', { body: { action: 'generate_recovery_codes', code: '654321' } })
    await a.ownerReset2fa('u2', '123456')
    expect(f.invoke).toHaveBeenLastCalledWith('account-security', { body: { action: 'owner_reset_2fa', target_user_id: 'u2', code: '123456' } })
    await a.completeClosure('u2', '123456')
    expect(f.invoke).toHaveBeenLastCalledWith('account-security', { body: { action: 'complete_closure', target_user_id: 'u2', code: '123456' } })
    await a.restoreClosure('u2')
    expect(f.invoke).toHaveBeenLastCalledWith('account-security', { body: { action: 'restore_closure', target_user_id: 'u2' } })

    const codes = fake({ invoke: { data: { ok: true, codes: ['AAAAA-BBBBB'] } } })
    expect(await account(codes).generateRecoveryCodes()).toEqual({ ok: true, data: ['AAAAA-BBBBB'] })
    const closure = fake({ invoke: { data: { ok: true, kind: 'business' } } })
    expect(await account(closure).requestClosure('123456')).toEqual({ ok: true, data: { kind: 'business' } })
    expect(closure.invoke).toHaveBeenCalledWith('account-security', { body: { action: 'request_closure', code: '123456' } })

    // Non-2xx: the reason comes from the JSON body; raw text is never shown.
    for (const [status, code] of [[400, 'invalid_code'], [400, 'code_expired'], [429, 'too_many_attempts'], [429, 'rate_limited'], [403, 'aal2_required'], [403, 'policy_requires_2fa'], [400, 'owner_cannot_close'], [502, 'email_failed']] as const) {
      const g = fake({ invoke: { error: httpError(status, { ok: false, error: code, message: 'raw provider text' }) } })
      const r = await account(g).disable2fa('123456')
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.error.reason).toBe(code)
        expect(r.error.message).not.toContain('raw provider text')
      }
    }
    // A 200 answer that still says ok:false is a failure too.
    const soft = fake({ invoke: { data: { ok: false, error: 'not_allowed' } } })
    const s = await account(soft).restoreClosure('u2')
    expect(!s.ok && s.error.reason).toBe('not_allowed')
    // An unknown code or an unreadable body is 'unknown'.
    const odd = fake({ invoke: { error: httpError(500, { ok: false, error: 'something_new' }) } })
    const o = await account(odd).disable2fa('1')
    expect(!o.ok && o.error).toMatchObject({ code: 'UNKNOWN', reason: 'unknown' })
    const expired = fake({ invoke: { error: httpError(401, { msg: 'Invalid JWT' }) } })
    const e = await account(expired).disable2fa('1')
    expect(!e.ok && e.error.reason).toBe('not_signed_in')
    const expiredText = fake({ invoke: { error: { name: 'FunctionsHttpError', context: new Response('Unauthorized', { status: 401 }) } } })
    const et = await account(expiredText).disable2fa('1')
    expect(!et.ok && et.error.reason).toBe('not_signed_in')
    const relay = fake({ invoke: { error: { name: 'FunctionsFetchError', context: new Error('offline') } } })
    const x = await account(relay).disable2fa('1')
    expect(!x.ok && x.error.reason).toBe('unknown')

    // After 2FA is removed the session is refreshed, so the new assurance level is picked up.
    const ok = fake({ invoke: { data: { ok: true } } })
    await account(ok).redeemRecoveryCode('ABCDE-FGHJK')
    expect(ok.auth.refreshSession).toHaveBeenCalled()
  })

  it('uploadAvatar writes avatars/<uid>/<uuid>.webp, updates avatar_path, deletes the previous object', async () => {
    const f = fake({
      tables: {
        profiles: (calls) => {
          const upsert = calls.find((c) => c[0] === 'upsert')
          if (upsert) return { data: { ...PROFILE_ROW, ...(upsert[1] as object) } }
          return { data: { ...PROFILE_ROW, avatar_path: `${UID}/previous.webp` } }
        },
      },
    })
    const file = new Blob(['img'], { type: 'image/webp' })
    const r = await account(f).uploadAvatar(file)
    expect(r.ok).toBe(true)
    expect(f.log).toContainEqual(['storage.from', 'avatars'])
    const upload = f.bucket.upload.mock.calls[0] as unknown as [string, Blob, { contentType: string }]
    expect(upload[0]).toMatch(new RegExp(`^${UID}/[0-9a-f-]{36}\\.webp$`))
    expect(upload[1]).toBe(file)
    expect(upload[2]).toMatchObject({ contentType: 'image/webp' })
    const write = f.queries.find((q) => q.table === 'profiles' && q.calls.some((c) => c[0] === 'upsert'))
    expect(write?.calls.find((c) => c[0] === 'upsert')?.[1]).toMatchObject({ user_id: UID, avatar_path: upload[0] })
    expect(f.bucket.remove).toHaveBeenCalledWith([`${UID}/previous.webp`])
    expect(r.ok && r.data.avatarUrl).toBe(`https://cdn.test/avatars/${upload[0]}`)

    const big = await account(fake()).uploadAvatar(new Blob([new Uint8Array(512 * 1024 + 1)], { type: 'image/webp' }))
    expect(!big.ok && big.error.reason).toBe('invalid_avatar')
    const gif = await account(fake()).uploadAvatar(new Blob(['x'], { type: 'image/gif' }))
    expect(!gif.ok && gif.error.reason).toBe('invalid_avatar')

    // A failed profile write removes the object just uploaded and keeps the previous one.
    const g = fake({
      tables: { profiles: (calls) => (calls.some((c) => c[0] === 'upsert') ? { error: { code: '42501', message: 'denied' } } : { data: { ...PROFILE_ROW, avatar_path: `${UID}/previous.webp` } }) },
    })
    const failed = await account(g).uploadAvatar(file)
    expect(failed.ok).toBe(false)
    const uploaded = (g.bucket.upload.mock.calls[0] as unknown as [string])[0]
    expect(g.bucket.remove).toHaveBeenCalledWith([uploaded])
    expect(g.bucket.remove).not.toHaveBeenCalledWith([`${UID}/previous.webp`])
  })

  it('updatePlatformSettings maps an RLS refusal at aal1 to aal2_required', async () => {
    // RLS hides the row from an update that fails the policy, so PostgREST answers with no rows.
    const f = fake({ tables: { platform_settings: () => ({ data: [] }) }, rpc: { my_platform_access: { data: { role: 'owner', permissions: [] } } } })
    const r = await account(f).updatePlatformSettings({ require2faStaff: true })
    expect(!r.ok && r.error.reason).toBe('aal2_required')

    // A platform Admin or Team member is refused for their role, whatever their aal.
    const admin = fake({ tables: { platform_settings: () => ({ data: [] }) }, rpc: { my_platform_access: { data: { role: 'admin', permissions: [] } } } })
    const ad = await account(admin).updatePlatformSettings({ require2faStaff: true })
    expect(!ad.ok && ad.error.reason).toBe('not_allowed')
    expect(admin.auth.mfa.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled()

    // Access unknown (no row, e.g. hidden by the 2FA policy itself): falls back to the aal check.
    const unknownRole = fake({ tables: { platform_settings: () => ({ data: [] }) } })
    const ur = await account(unknownRole).updatePlatformSettings({ require2faStaff: true })
    expect(!ur.ok && ur.error.reason).toBe('aal2_required')

    const denied = fake({
      tables: { platform_settings: () => ({ error: { code: '42501', message: 'permission denied' } }) },
      rpc: { my_platform_access: { data: { role: 'owner', permissions: [] } } },
      mfa: { getAuthenticatorAssuranceLevel: () => ({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null }) },
    })
    const d = await account(denied).updatePlatformSettings({ require2faStaff: true })
    expect(!d.ok && d.error.reason).toBe('not_allowed')

    const saved = fake({
      tables: { platform_settings: () => ({ data: [{ require_2fa_staff: true, require_2fa_business: false, updated_at: '2026-10-25T10:00:00Z' }] }) },
    })
    expect(await account(saved).updatePlatformSettings({ require2faStaff: true })).toEqual({
      ok: true,
      data: { require2faStaff: true, require2faBusiness: false, updatedAt: '2026-10-25T10:00:00Z' },
    })
    const q = saved.queries.find((x) => x.table === 'platform_settings')
    expect(q?.calls).toContainEqual(['update', { require_2fa_staff: true }])
    expect(q?.calls).toContainEqual(['eq', 'id', true])
  })

  it('updateProfile writes profiles and keeps user_metadata.display_name in step', async () => {
    const f = fake({ tables: { profiles: (calls) => ({ data: { ...PROFILE_ROW, ...(calls.find((c) => c[0] === 'upsert')?.[1] as object) } }) } })
    const r = await account(f).updateProfile({ displayName: '  Ana Silva ', clock: '12h' })
    expect(r.ok && r.data).toMatchObject({ userId: UID, displayName: 'Ana Silva', clock: '12h', avatarUrl: null })
    const q = f.queries.find((x) => x.table === 'profiles')
    expect(q?.calls.find((c) => c[0] === 'upsert')?.[1]).toEqual({ user_id: UID, display_name: 'Ana Silva', clock: '12h' })
    expect(f.auth.updateUser).toHaveBeenCalledWith({ data: { display_name: 'Ana Silva' } })

    const tooLong = await account(fake()).updateProfile({ displayName: 'x'.repeat(81) })
    expect(!tooLong.ok && tooLong.error.reason).toBe('invalid_name')
  })

  it('reads security events, closure requests and records sign-ins through the database functions', async () => {
    const f = fake({
      rpc: {
        list_my_security_events: { data: [{ id: 'e1', event_type: 'account_signed_in', created_at: '2026-10-25T09:00:00Z', metadata: { user_agent: 'Firefox', ip: '1.2.3.4' } }, { id: 'e2', event_type: 'account_password_changed', created_at: '2026-10-24T09:00:00Z', metadata: {} }, { id: 'e3', event_type: 'account_deleted', created_at: '2026-10-23T09:00:00Z', metadata: { delete_failed: true } }] },
        admin_list_closure_requests: { data: [{ user_id: 'u2', email: 'b@x.pt', business_id: 'b2', business_name: 'Casa', requested_at: '2026-10-20T00:00:00Z' }] },
        cancel_account_closure: { data: { error: 'not_found' } },
        record_sign_in: { data: 'rate_limited' },
      },
    })
    const a = account(f)
    expect(await a.listSecurityEvents()).toEqual({
      ok: true,
      data: [
        { id: 'e1', type: 'account_signed_in', at: '2026-10-25T09:00:00Z', userAgent: 'Firefox', ip: '1.2.3.4' },
        { id: 'e2', type: 'account_password_changed', at: '2026-10-24T09:00:00Z', userAgent: null, ip: null },
        { id: 'e3', type: 'account_deleted', at: '2026-10-23T09:00:00Z', userAgent: null, ip: null, deleteFailed: true },
      ],
    })
    expect(await a.listClosureRequests()).toEqual({ ok: true, data: [{ userId: 'u2', email: 'b@x.pt', businessId: 'b2', businessName: 'Casa', requestedAt: '2026-10-20T00:00:00Z' }] })
    const c = await a.cancelClosure()
    expect(!c.ok && c.error.reason).toBe('not_found')

    // Without businesses.view the function answers {"error":"forbidden"} (an object, not an array).
    const refused = fake({ rpc: { admin_list_closure_requests: { data: { error: 'forbidden' } } } })
    const lr = await account(refused).listClosureRequests()
    expect(!lr.ok && lr.error).toMatchObject({ code: 'PERMISSION', reason: 'not_allowed' })
    // Reasons the database and function can answer are known, never collapsed to 'unknown'.
    for (const reason of ['not_allowed', 'invalid_request']) {
      const g = fake({ invoke: { error: httpError(400, { ok: false, error: reason }) } })
      const r = await account(g).requestClosure('123456')
      expect(!r.ok && r.error.reason).toBe(reason)
    }
    expect((await a.recordSignIn()).ok).toBe(true)
    const [, args] = f.rpc.mock.calls.find((x) => x[0] === 'record_sign_in') as unknown as [string, { p_user_agent: string }]
    expect(args.p_user_agent.length).toBeLessThanOrEqual(200)
  })
})
