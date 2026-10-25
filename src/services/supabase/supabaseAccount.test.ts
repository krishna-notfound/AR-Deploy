import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { settingsPath } from '@/lib/urls'
import { createSupabaseAccount } from './supabaseAccount'

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
  return { sb, log, queries, rpc, invoke, auth, bucket }
}

const names = (log: Call[]) => log.map((c) => c[0])

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
    expect(await createSupabaseAccount(f.sb).changePassword('old-password-1', 'new-password-12')).toEqual({ ok: true, data: undefined })
    expect(f.auth.updateUser).toHaveBeenCalledWith({ password: 'new-password-12', current_password: 'old-password-1' })
    expect(f.auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
    const order = names(f.log)
    expect(order.indexOf('auth.updateUser')).toBeLessThan(order.indexOf('auth.signOut'))
    expect(f.rpc).toHaveBeenCalledWith('log_account_event', { p_event: 'account_password_changed' })

    for (const code of ['current_password_mismatch', 'same_password']) {
      const g = fake({ auth: { updateUser: () => ({ data: { user: null }, error: authError(code) }) } })
      const r = await createSupabaseAccount(g.sb).changePassword('old-password-1', 'new-password-12')
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.error.reason).toBe(code)
        expect(r.error.message).not.toContain('raw provider text')
      }
      expect(g.auth.signOut).not.toHaveBeenCalled()
    }

    const short = await createSupabaseAccount(fake().sb).changePassword('old', 'short')
    expect(!short.ok && short.error.reason).toBe('weak_password')
  })

  it("requestEmailChange verifies the password with signInWithPassword first and maps a failure to password_incorrect; then calls updateUser({ email }, { emailRedirectTo: origin + settingsPath('business'|'admin','account') }) and logs account_email_change_requested", async () => {
    const bad = fake({ auth: { signInWithPassword: () => ({ data: {}, error: authError('invalid_credentials', 400) }) } })
    const r = await createSupabaseAccount(bad.sb).requestEmailChange('wrong', 'new@studio.pt')
    expect(!r.ok && r.error.reason).toBe('password_incorrect')
    expect(bad.auth.updateUser).not.toHaveBeenCalled()

    history.replaceState(null, '', '/dashboard/settings/account')
    const f = fake()
    expect((await createSupabaseAccount(f.sb).requestEmailChange('right', 'new@studio.pt')).ok).toBe(true)
    expect(f.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ana@studio.pt', password: 'right' })
    expect(f.auth.updateUser).toHaveBeenCalledWith({ email: 'new@studio.pt' }, { emailRedirectTo: location.origin + settingsPath('business', 'account') })
    const order = names(f.log)
    expect(order.indexOf('auth.signInWithPassword')).toBeLessThan(order.indexOf('auth.updateUser'))
    expect(f.rpc).toHaveBeenCalledWith('log_account_event', { p_event: 'account_email_change_requested' })

    history.replaceState(null, '', '/admin/settings/account')
    const s = fake()
    await createSupabaseAccount(s.sb).requestEmailChange('right', 'new@studio.pt')
    expect(s.auth.updateUser).toHaveBeenCalledWith({ email: 'new@studio.pt' }, { emailRedirectTo: location.origin + settingsPath('admin', 'account') })
    history.replaceState(null, '', '/')

    const taken = fake({ auth: { updateUser: () => ({ data: { user: null }, error: authError('email_exists') }) } })
    const t = await createSupabaseAccount(taken.sb).requestEmailChange('right', 'used@studio.pt')
    expect(!t.ok && t.error.reason).toBe('email_taken')
    const invalid = await createSupabaseAccount(fake().sb).requestEmailChange('right', 'nope')
    expect(!invalid.ok && invalid.error.reason).toBe('invalid_email')
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
    expect(await createSupabaseAccount(f.sb).getSecurityState()).toEqual({
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
    const r = await createSupabaseAccount(none.sb).getSecurityState()
    expect(r.ok && r.data).toMatchObject({ requires2fa: false, aal: 'aal1', hasVerifiedFactor: false, recoveryCodesLeft: null, pendingEmail: null, closure: null })

    // A database failure is reported, never replaced by defaults.
    const broken = fake({ rpc: { my_security_state: { error: { code: 'PGRST202', message: 'not found' } } } })
    const b = await createSupabaseAccount(broken.sb).getSecurityState()
    expect(!b.ok && b.error.reason).toBe('not_enabled')
  })

  it('startTotpEnrollment removes stale unverified factors before mfa.enroll; confirmTotpEnrollment uses challengeAndVerify and maps a wrong code to invalid_code', async () => {
    const stale = { id: 'old', factor_type: 'totp', status: 'unverified' }
    const f = fake({
      mfa: {
        listFactors: () => ({ data: { all: [stale, { id: 'keep', factor_type: 'totp', status: 'verified' }], totp: [], phone: [] }, error: null }),
        enroll: () => ({ data: { id: 'new', type: 'totp', totp: { qr_code: '<svg>qr</svg>', secret: 'SECRET', uri: 'otpauth://x' } }, error: null }),
      },
    })
    const a = createSupabaseAccount(f.sb)
    expect(await a.startTotpEnrollment()).toEqual({ ok: true, data: { factorId: 'new', qrSvg: '<svg>qr</svg>', secret: 'SECRET' } })
    expect(f.auth.mfa.unenroll).toHaveBeenCalledTimes(1)
    expect(f.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'old' })
    expect(f.auth.mfa.enroll).toHaveBeenCalledWith({ factorType: 'totp', friendlyName: 'Authenticator' })
    const order = names(f.log)
    expect(order.indexOf('mfa.unenroll')).toBeLessThan(order.indexOf('mfa.enroll'))

    expect((await a.confirmTotpEnrollment('new', '123456')).ok).toBe(true)
    expect(f.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'new', code: '123456' })

    const wrong = fake({ mfa: { challengeAndVerify: () => ({ data: null, error: authError('mfa_verification_failed') }) } })
    const r = await createSupabaseAccount(wrong.sb).confirmTotpEnrollment('new', '000000')
    expect(!r.ok && r.error.reason).toBe('invalid_code')

    const off = fake({ mfa: { enroll: () => ({ data: null, error: authError('mfa_totp_enroll_not_enabled') }) } })
    const o = await createSupabaseAccount(off.sb).startTotpEnrollment()
    expect(!o.ok && o.error.reason).toBe('mfa_not_enabled')
  })

  it('function-backed methods post { action, ... } to account-security and map { ok:false, error } to ServiceError.reason', async () => {
    const f = fake({ invoke: { data: { ok: true, sentTo: 'a•••@studio.pt' } } })
    const a = createSupabaseAccount(f.sb)
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
    expect(await createSupabaseAccount(codes.sb).generateRecoveryCodes()).toEqual({ ok: true, data: ['AAAAA-BBBBB'] })
    const closure = fake({ invoke: { data: { ok: true, kind: 'business' } } })
    expect(await createSupabaseAccount(closure.sb).requestClosure('123456')).toEqual({ ok: true, data: { kind: 'business' } })
    expect(closure.invoke).toHaveBeenCalledWith('account-security', { body: { action: 'request_closure', code: '123456' } })

    // Non-2xx: the reason comes from the JSON body; raw text is never shown.
    for (const [status, code] of [[400, 'invalid_code'], [400, 'code_expired'], [429, 'too_many_attempts'], [429, 'rate_limited'], [403, 'aal2_required'], [403, 'policy_requires_2fa'], [400, 'owner_cannot_close'], [502, 'email_failed']] as const) {
      const g = fake({ invoke: { error: httpError(status, { ok: false, error: code, message: 'raw provider text' }) } })
      const r = await createSupabaseAccount(g.sb).disable2fa('123456')
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.error.reason).toBe(code)
        expect(r.error.message).not.toContain('raw provider text')
      }
    }
    // A 200 answer that still says ok:false is a failure too.
    const soft = fake({ invoke: { data: { ok: false, error: 'not_allowed' } } })
    const s = await createSupabaseAccount(soft.sb).restoreClosure('u2')
    expect(!s.ok && s.error.reason).toBe('not_allowed')
    // An unknown code or an unreadable body is 'unknown'.
    const odd = fake({ invoke: { error: httpError(500, { ok: false, error: 'something_new' }) } })
    const o = await createSupabaseAccount(odd.sb).disable2fa('1')
    expect(!o.ok && o.error).toMatchObject({ code: 'UNKNOWN', reason: 'unknown' })
    const relay = fake({ invoke: { error: { name: 'FunctionsFetchError', context: new Error('offline') } } })
    const x = await createSupabaseAccount(relay.sb).disable2fa('1')
    expect(!x.ok && x.error.reason).toBe('unknown')

    // After 2FA is removed the session is refreshed, so the new assurance level is picked up.
    const ok = fake({ invoke: { data: { ok: true } } })
    await createSupabaseAccount(ok.sb).redeemRecoveryCode('ABCDE-FGHJK')
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
    const r = await createSupabaseAccount(f.sb).uploadAvatar(file)
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

    const big = await createSupabaseAccount(fake().sb).uploadAvatar(new Blob([new Uint8Array(512 * 1024 + 1)], { type: 'image/webp' }))
    expect(!big.ok && big.error.reason).toBe('invalid_avatar')
    const gif = await createSupabaseAccount(fake().sb).uploadAvatar(new Blob(['x'], { type: 'image/gif' }))
    expect(!gif.ok && gif.error.reason).toBe('invalid_avatar')

    // A failed profile write removes the object just uploaded and keeps the previous one.
    const g = fake({
      tables: { profiles: (calls) => (calls.some((c) => c[0] === 'upsert') ? { error: { code: '42501', message: 'denied' } } : { data: { ...PROFILE_ROW, avatar_path: `${UID}/previous.webp` } }) },
    })
    const failed = await createSupabaseAccount(g.sb).uploadAvatar(file)
    expect(failed.ok).toBe(false)
    const uploaded = (g.bucket.upload.mock.calls[0] as unknown as [string])[0]
    expect(g.bucket.remove).toHaveBeenCalledWith([uploaded])
    expect(g.bucket.remove).not.toHaveBeenCalledWith([`${UID}/previous.webp`])
  })

  it('updatePlatformSettings maps an RLS refusal at aal1 to aal2_required', async () => {
    // RLS hides the row from an update that fails the policy, so PostgREST answers with no rows.
    const f = fake({ tables: { platform_settings: () => ({ data: [] }) } })
    const r = await createSupabaseAccount(f.sb).updatePlatformSettings({ require2faStaff: true })
    expect(!r.ok && r.error.reason).toBe('aal2_required')

    const denied = fake({
      tables: { platform_settings: () => ({ error: { code: '42501', message: 'permission denied' } }) },
      mfa: { getAuthenticatorAssuranceLevel: () => ({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null }) },
    })
    const d = await createSupabaseAccount(denied.sb).updatePlatformSettings({ require2faStaff: true })
    expect(!d.ok && d.error.reason).toBe('not_allowed')

    const saved = fake({
      tables: { platform_settings: () => ({ data: [{ require_2fa_staff: true, require_2fa_business: false, updated_at: '2026-10-25T10:00:00Z' }] }) },
    })
    expect(await createSupabaseAccount(saved.sb).updatePlatformSettings({ require2faStaff: true })).toEqual({
      ok: true,
      data: { require2faStaff: true, require2faBusiness: false, updatedAt: '2026-10-25T10:00:00Z' },
    })
    const q = saved.queries.find((x) => x.table === 'platform_settings')
    expect(q?.calls).toContainEqual(['update', { require_2fa_staff: true }])
    expect(q?.calls).toContainEqual(['eq', 'id', true])
  })

  it('updateProfile writes profiles and keeps user_metadata.display_name in step', async () => {
    const f = fake({ tables: { profiles: (calls) => ({ data: { ...PROFILE_ROW, ...(calls.find((c) => c[0] === 'upsert')?.[1] as object) } }) } })
    const r = await createSupabaseAccount(f.sb).updateProfile({ displayName: '  Ana Silva ', clock: '12h' })
    expect(r.ok && r.data).toMatchObject({ userId: UID, displayName: 'Ana Silva', clock: '12h', avatarUrl: null })
    const q = f.queries.find((x) => x.table === 'profiles')
    expect(q?.calls.find((c) => c[0] === 'upsert')?.[1]).toEqual({ user_id: UID, display_name: 'Ana Silva', clock: '12h' })
    expect(f.auth.updateUser).toHaveBeenCalledWith({ data: { display_name: 'Ana Silva' } })

    const tooLong = await createSupabaseAccount(fake().sb).updateProfile({ displayName: 'x'.repeat(81) })
    expect(!tooLong.ok && tooLong.error.reason).toBe('invalid_name')
  })

  it('reads security events, closure requests and records sign-ins through the database functions', async () => {
    const f = fake({
      rpc: {
        list_my_security_events: { data: [{ id: 'e1', event_type: 'account_signed_in', created_at: '2026-10-25T09:00:00Z', metadata: { user_agent: 'Firefox', ip: '1.2.3.4' } }, { id: 'e2', event_type: 'account_password_changed', created_at: '2026-10-24T09:00:00Z', metadata: {} }] },
        admin_list_closure_requests: { data: [{ user_id: 'u2', email: 'b@x.pt', business_id: 'b2', business_name: 'Casa', requested_at: '2026-10-20T00:00:00Z' }] },
        cancel_account_closure: { data: { error: 'not_found' } },
        record_sign_in: { data: 'rate_limited' },
      },
    })
    const a = createSupabaseAccount(f.sb)
    expect(await a.listSecurityEvents()).toEqual({
      ok: true,
      data: [
        { id: 'e1', type: 'account_signed_in', at: '2026-10-25T09:00:00Z', userAgent: 'Firefox', ip: '1.2.3.4' },
        { id: 'e2', type: 'account_password_changed', at: '2026-10-24T09:00:00Z', userAgent: null, ip: null },
      ],
    })
    expect(await a.listClosureRequests()).toEqual({ ok: true, data: [{ userId: 'u2', email: 'b@x.pt', businessId: 'b2', businessName: 'Casa', requestedAt: '2026-10-20T00:00:00Z' }] })
    const c = await a.cancelClosure()
    expect(!c.ok && c.error.reason).toBe('not_found')
    expect((await a.recordSignIn()).ok).toBe(true)
    const [, args] = f.rpc.mock.calls.find((x) => x[0] === 'record_sign_in') as unknown as [string, { p_user_agent: string }]
    expect(args.p_user_agent.length).toBeLessThanOrEqual(200)
  })
})
