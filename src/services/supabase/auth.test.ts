import type { SupabaseClient } from '@supabase/supabase-js'
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { authMessage, createSupabaseAuthService } from './auth'

/** Just enough of supabase-js for getCurrentUser: auth.getUser and the two role lookups. */
function stub(getUser: () => unknown, roles: { admin?: boolean; businessId?: string } = {}) {
  const query = (data: unknown) => {
    const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data, error: null }) }
    return q
  }
  return {
    auth: { getUser: async () => getUser() },
    from: (table: string) =>
      table === 'platform_admins' ? query(roles.admin ? { user_id: 'u1' } : null) : query(roles.businessId ? { business_id: roles.businessId } : null),
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
    expect(r.ok && r.data?.user).toEqual({ id: 'u1', name: 'Ana', email: 'owner@test', role: 'business_admin', businessId: 'b1' })
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
