import type { SupabaseClient } from '@supabase/supabase-js'
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { authMessage, createSupabaseAuthService } from './auth'

/** Just enough of supabase-js for getCurrentUser: auth.getUser, my_platform_access and the business lookup. */
function stub(getUser: () => unknown, roles: { admin?: boolean; platform?: { role: string | null; permissions: string[]; status?: string }; businessId?: string; acceptedAt?: string | null } = {}) {
  const query = (data: unknown) => {
    const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data, error: null }) }
    return q
  }
  const platform = roles.platform ?? (roles.admin ? { role: 'owner', permissions: ['products.view'] } : null)
  return {
    auth: { getUser: async () => getUser() },
    rpc: async () => ({ data: platform, error: null }),
    from: () => query(roles.businessId ? { business_id: roles.businessId, accepted_at: roles.acceptedAt === undefined ? '2026-10-20T10:00:00Z' : roles.acceptedAt } : null),
  } as unknown as SupabaseClient
}
const user = (meta: Record<string, unknown> = {}) => ({ data: { user: { id: 'u1', email: 'owner@test', user_metadata: meta } }, error: null })

/** supabase-js auth with updateUser answering `updateError` and a recording signOut. */
function passwordStub(updateError: unknown) {
  const signOut = vi.fn(async () => ({ error: null }))
  const updateUser = vi.fn(async () => ({ data: {}, error: updateError }))
  return { sb: { auth: { updateUser, signOut } } as unknown as SupabaseClient, signOut, updateUser }
}

describe('Supabase auth: getCurrentUser', () => {
  it('returns a signed-in account without a role', async () => {
    const fresh = await createSupabaseAuthService(stub(() => user())).getCurrentUser()
    expect(fresh).toEqual({ ok: true, data: { email: 'owner@test', user: null } })
  })

  it('uses the display name in the dashboard and takes the role from the tables, never the metadata', async () => {
    const r = await createSupabaseAuthService(stub(() => user({ display_name: '  Ana  ', role: 'super_admin' }), { businessId: 'b1' })).getCurrentUser()
    expect(r.ok && r.data?.user).toEqual({ id: 'u1', name: 'Ana', email: 'owner@test', role: 'business_admin', businessId: 'b1', invitationPending: false })
  })

  it('marks an owner whose membership is not accepted yet as invitationPending (R-W1-9)', async () => {
    const r = await createSupabaseAuthService(stub(() => user(), { businessId: 'b1', acceptedAt: null })).getCurrentUser()
    expect(r.ok && r.data?.user).toMatchObject({ role: 'business_admin', businessId: 'b1', invitationPending: true })
  })

  it('before the team-roles migration is applied, an Owner still signs in (falls back to platform_admins)', async () => {
    const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: { user_id: 'u1' }, error: null }) }
    const sb = {
      auth: { getUser: async () => user() },
      rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.my_platform_access' } }),
      from: (table: string) => (table === 'platform_admins' ? q : { ...q, maybeSingle: async () => ({ data: null, error: null }) }),
    } as unknown as SupabaseClient
    const r = await createSupabaseAuthService(sb).getCurrentUser()
    expect(r.ok && r.data?.user).toMatchObject({ role: 'super_admin', platform: { role: 'owner' } })
  })

  it('a platform Team member signs in as a platform user with their role and permissions', async () => {
    const r = await createSupabaseAuthService(stub(() => user(), { platform: { role: 'team', permissions: ['products.view', 'products.edit'] } })).getCurrentUser()
    expect(r.ok && r.data?.user).toEqual({ id: 'u1', name: 'owner@test', email: 'owner@test', role: 'super_admin', platform: { role: 'team', permissions: ['products.view', 'products.edit'], status: 'active' } })
  })

  it('S1.5 Task 9: a deactivated platform member is signed in with no role, marked deactivated', async () => {
    const r = await createSupabaseAuthService(stub(() => user(), { platform: { role: null, permissions: [], status: 'deactivated' } })).getCurrentUser()
    expect(r).toEqual({ ok: true, data: { email: 'owner@test', user: null, deactivated: true } })
  })

  it('treats a network or server failure as an error, not as signed out', async () => {
    const offline = await createSupabaseAuthService(stub(() => ({ data: { user: null }, error: new AuthRetryableFetchError('offline', 0) }))).getCurrentUser()
    expect(offline.ok).toBe(false)
    const down = await createSupabaseAuthService(stub(() => ({ data: { user: null }, error: new AuthApiError('boom', 500, 'unexpected_failure') }))).getCurrentUser()
    expect(down.ok).toBe(false)
  })

  it('treats a missing or rejected session as signed out', async () => {
    const missing = await createSupabaseAuthService(stub(() => ({ data: { user: null }, error: new AuthSessionMissingError() }))).getCurrentUser()
    expect(missing).toEqual({ ok: true, data: null })
    const rejected = await createSupabaseAuthService(stub(() => ({ data: { user: null }, error: new AuthApiError('bad jwt', 401, 'bad_jwt') }))).getCurrentUser()
    expect(rejected).toEqual({ ok: true, data: null })
  })
})

describe('Supabase auth: updatePassword', () => {
  it('signs out the other sessions after the password is set', async () => {
    const { sb, signOut } = passwordStub(null)
    expect(await createSupabaseAuthService(sb).updatePassword('a-long-password')).toEqual({ ok: true, data: undefined })
    expect(signOut).toHaveBeenCalledWith({ scope: 'others' })
  })

  it('treats re-entering the current password (same_password) as success', async () => {
    const { sb, signOut } = passwordStub(new AuthApiError('New password should be different from the old password.', 422, 'same_password'))
    expect(await createSupabaseAuthService(sb).updatePassword('a-long-password')).toEqual({ ok: true, data: undefined })
    expect(signOut).toHaveBeenCalledWith({ scope: 'others' })
  })

  it('does not block the user when signing out the other sessions fails', async () => {
    const { sb, signOut } = passwordStub(null)
    signOut.mockRejectedValueOnce(new Error('offline'))
    expect((await createSupabaseAuthService(sb).updatePassword('a-long-password')).ok).toBe(true)
  })

  it('reports other errors with the Supabase code for translation, and keeps the other sessions', async () => {
    const { sb, signOut } = passwordStub(new AuthApiError('Password is known to be weak', 422, 'weak_password'))
    const r = await createSupabaseAuthService(sb).updatePassword('password1234')
    expect(r).toEqual({ ok: false, error: { code: 'VALIDATION', message: 'Choose a stronger password.', reason: 'weak_password' } })
    expect(signOut).not.toHaveBeenCalled()
    const offline = await createSupabaseAuthService(passwordStub(new AuthRetryableFetchError('offline', 0)).sb).updatePassword('a-long-password')
    expect(!offline.ok && offline.error.reason).toBe('network')
  })
})

describe('authMessage', () => {
  it('turns project-setting errors into plain words and keeps unknown messages', () => {
    expect(authMessage({ code: 'email_not_confirmed', message: 'Email not confirmed' })).toBe('This account has not confirmed its email address yet. Ask the platform team for help.')
    expect(authMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('Wrong email or password.')
    expect(authMessage({ message: 'Something else' })).toBe('Something else')
  })
})

// ADR-0077: the platform Owner can sign in, and reset the password, with a sign-in alias.
describe('Supabase auth: owner sign-in aliases', () => {
  const SESSION = { access_token: 'at', refresh_token: 'rt', expires_in: 3600, token_type: 'bearer' }
  const invalid = { name: 'AuthApiError', code: 'invalid_credentials', status: 400, message: 'raw: Invalid login credentials' }
  const httpError = (status: number, body: unknown) => ({ name: 'FunctionsHttpError', context: new Response(JSON.stringify(body), { status }) })

  function aliasStub(over: { signIn?: unknown; verify?: unknown; reset?: unknown; invoke?: { data?: unknown; error?: unknown } | (() => never); setSession?: unknown } = {}) {
    const invoke = vi.fn(async () => {
      if (typeof over.invoke === 'function') return over.invoke()
      return { data: null, error: null, ...(over.invoke ?? {}) }
    })
    const auth = {
      signInWithPassword: vi.fn(async () => ({ data: {}, error: over.signIn ?? null })),
      resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: over.reset ?? null })),
      verifyOtp: vi.fn(async () => ({ data: {}, error: over.verify ?? null })),
      setSession: vi.fn(async () => ({ data: {}, error: over.setSession ?? null })),
    }
    return { sb: { auth, functions: { invoke } } as unknown as SupabaseClient, auth, invoke }
  }

  describe('sign in', () => {
    it('a normal sign-in that works never calls the alias function', async () => {
      const f = aliasStub()
      expect(await createSupabaseAuthService(f.sb).signInWithPassword('owner@test', 'pw')).toEqual({ ok: true, data: undefined })
      expect(f.invoke).not.toHaveBeenCalled()
    })

    it('after invalid_credentials only, sends the typed email and password to alias_sign_in and sets the returned session', async () => {
      const f = aliasStub({ signIn: invalid, invoke: { data: { ok: true, session: SESSION } } })
      expect(await createSupabaseAuthService(f.sb).signInWithPassword('client@test.pt', 'pw')).toEqual({ ok: true, data: undefined })
      expect(f.invoke).toHaveBeenCalledWith('account-security', { body: { action: 'alias_sign_in', email: 'client@test.pt', password: 'pw' } })
      expect(f.auth.setSession).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' })
    })

    it('any other sign-in error (unconfirmed, rate limited, network) never reaches the alias function', async () => {
      for (const code of ['email_not_confirmed', 'over_request_rate_limit', 'unexpected_failure']) {
        const f = aliasStub({ signIn: { name: 'AuthApiError', code, status: 400, message: 'raw' }, invoke: { data: { ok: true, session: SESSION } } })
        const r = await createSupabaseAuthService(f.sb).signInWithPassword('client@test.pt', 'pw')
        expect(!r.ok && r.error.reason).toBe(code)
        expect(f.invoke).not.toHaveBeenCalled()
      }
    })

    it('keeps the normal wrong-email-or-password failure when the alias function says no, is unreachable or answers nonsense', async () => {
      const answers: { data?: unknown; error?: unknown }[] = [
        { error: httpError(400, { ok: false, error: 'invalid_credentials' }) },
        { error: httpError(500, { ok: false, error: 'unknown' }) },
        { error: { name: 'FunctionsFetchError', context: new Error('offline') } },
        { data: { ok: true } },
        { data: { ok: true, session: { access_token: 5 } } },
        { data: { ok: false, error: 'invalid_credentials' } },
      ]
      for (const invoke of answers) {
        const f = aliasStub({ signIn: invalid, invoke })
        const r = await createSupabaseAuthService(f.sb).signInWithPassword('client@test.pt', 'pw')
        expect(r).toMatchObject({ ok: false, error: { reason: 'invalid_credentials', message: 'Wrong email or password.' } })
        expect(f.auth.setSession).not.toHaveBeenCalled()
      }
      const thrown = aliasStub({ signIn: invalid, invoke: () => { throw new TypeError('Failed to fetch') } })
      expect(await createSupabaseAuthService(thrown.sb).signInWithPassword('client@test.pt', 'pw')).toMatchObject({ ok: false, error: { reason: 'invalid_credentials' } })
      // A session the browser cannot adopt is a failure too.
      const refused = aliasStub({ signIn: invalid, invoke: { data: { ok: true, session: SESSION } }, setSession: { name: 'AuthApiError', code: 'bad_jwt', status: 400, message: 'raw' } })
      expect(await createSupabaseAuthService(refused.sb).signInWithPassword('client@test.pt', 'pw')).toMatchObject({ ok: false, error: { reason: 'invalid_credentials' } })
    })

    it('a rate-limited alias attempt is the "too many attempts" failure; text that is not an email never goes to the function', async () => {
      const f = aliasStub({ signIn: invalid, invoke: { error: httpError(429, { ok: false, error: 'rate_limited' }) } })
      const r = await createSupabaseAuthService(f.sb).signInWithPassword('client@test.pt', 'pw')
      expect(r).toMatchObject({ ok: false, error: { reason: 'over_request_rate_limit' } })
      const g = aliasStub({ signIn: invalid })
      await createSupabaseAuthService(g.sb).signInWithPassword('not an email', 'pw')
      expect(g.invoke).not.toHaveBeenCalled()
    })
  })

  describe('forgot password', () => {
    it('asks Supabase and the alias function in the same request; the answer is the normal one', async () => {
      const f = aliasStub({ invoke: { data: { ok: true } } })
      expect(await createSupabaseAuthService(f.sb).requestPasswordReset('client@test.pt', 'https://app.test/reset-password')).toEqual({ ok: true, data: undefined })
      expect(f.auth.resetPasswordForEmail).toHaveBeenCalledWith('client@test.pt', { redirectTo: 'https://app.test/reset-password' })
      expect(f.invoke).toHaveBeenCalledWith('account-security', { body: { action: 'alias_reset_request', email: 'client@test.pt' } })
    })

    it('a failing or unreachable alias function changes nothing about the answer; a Supabase error is still reported', async () => {
      const down = aliasStub({ invoke: () => { throw new TypeError('Failed to fetch') } })
      expect(await createSupabaseAuthService(down.sb).requestPasswordReset('client@test.pt', 'https://app.test/r')).toEqual({ ok: true, data: undefined })
      const limited = aliasStub({ reset: { name: 'AuthApiError', code: 'over_request_rate_limit', status: 429, message: 'raw' }, invoke: { data: { ok: true } } })
      const r = await createSupabaseAuthService(limited.sb).requestPasswordReset('client@test.pt', 'https://app.test/r')
      expect(!r.ok && r.error.reason).toBe('over_request_rate_limit')
    })

    it('a reset code typed with an alias: tried on the typed email first, then through alias_reset_verify, which returns the session', async () => {
      const f = aliasStub({ verify: { name: 'AuthApiError', code: 'otp_expired', status: 403, message: 'raw' }, invoke: { data: { ok: true, session: SESSION } } })
      expect(await createSupabaseAuthService(f.sb).verifyEmailCode('client@test.pt', '12345678', 'recovery')).toEqual({ ok: true, data: undefined })
      expect(f.auth.verifyOtp).toHaveBeenCalledWith({ email: 'client@test.pt', token: '12345678', type: 'recovery' })
      expect(f.invoke).toHaveBeenCalledWith('account-security', { body: { action: 'alias_reset_verify', email: 'client@test.pt', code: '12345678' } })
      expect(f.auth.setSession).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' })
    })

    it('a wrong code stays the normal otp_expired failure; an invitation code never goes to the alias function; a right code needs no second call', async () => {
      const wrong = aliasStub({ verify: { name: 'AuthApiError', code: 'otp_expired', status: 403, message: 'raw' }, invoke: { error: httpError(400, { ok: false, error: 'invalid_code' }) } })
      const r = await createSupabaseAuthService(wrong.sb).verifyEmailCode('ana@test.pt', '00000000', 'recovery')
      expect(!r.ok && r.error.reason).toBe('otp_expired')
      const invite = aliasStub({ verify: { name: 'AuthApiError', code: 'otp_expired', status: 403, message: 'raw' } })
      await createSupabaseAuthService(invite.sb).verifyEmailCode('ana@test.pt', '00000000', 'invite')
      expect(invite.invoke).not.toHaveBeenCalled()
      const right = aliasStub()
      expect((await createSupabaseAuthService(right.sb).verifyEmailCode('ana@test.pt', '12345678', 'recovery')).ok).toBe(true)
      expect(right.invoke).not.toHaveBeenCalled()
      const net = aliasStub({ verify: new AuthRetryableFetchError('Failed to fetch', 0) })
      const n = await createSupabaseAuthService(net.sb).verifyEmailCode('ana@test.pt', '12345678', 'recovery')
      expect(!n.ok && n.error.reason).toBe('network')
      expect(net.invoke).not.toHaveBeenCalled()
    })
  })
})
