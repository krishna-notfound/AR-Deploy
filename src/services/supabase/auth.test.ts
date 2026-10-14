import type { SupabaseClient } from '@supabase/supabase-js'
import { AuthRetryableFetchError } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
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

describe('Supabase auth: getCurrentUser', () => {
  it('reports onboarding state from the user metadata for an account without a role', async () => {
    const fresh = await createSupabaseAuthService(stub(() => user())).getCurrentUser()
    expect(fresh).toEqual({ ok: true, data: { email: 'owner@test', user: null, displayName: undefined, displayNameSkipped: false } })
    const named = await createSupabaseAuthService(stub(() => user({ display_name: '  Ana  ' }))).getCurrentUser()
    expect(named.ok && named.data?.displayName).toBe('Ana')
    const skipped = await createSupabaseAuthService(stub(() => user({ display_name: null, display_name_skipped: true }))).getCurrentUser()
    expect(skipped.ok && skipped.data?.displayNameSkipped).toBe(true)
  })

  it('uses the display name in the dashboard and takes the role from the tables, never the metadata', async () => {
    const r = await createSupabaseAuthService(stub(() => user({ display_name: 'Ana', role: 'super_admin' }), { businessId: 'b1' })).getCurrentUser()
    expect(r.ok && r.data?.user).toEqual({ id: 'u1', name: 'Ana', email: 'owner@test', role: 'business_admin', businessId: 'b1' })
  })

  it('treats a network failure as an error, not as signed out', async () => {
    const r = await createSupabaseAuthService(stub(() => ({ data: { user: null }, error: new AuthRetryableFetchError('offline', 0) }))).getCurrentUser()
    expect(r.ok).toBe(false)
  })
})

describe('authMessage', () => {
  it('turns project-setting errors into plain words and keeps unknown messages', () => {
    expect(authMessage({ code: 'signup_disabled', message: 'Signups not allowed for this instance' })).toBe('New accounts are not open yet. Ask the platform team for access.')
    expect(authMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('Wrong email or password.')
    expect(authMessage({ message: 'Something else' })).toBe('Something else')
  })
})
