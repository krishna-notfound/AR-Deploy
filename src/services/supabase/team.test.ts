import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { mapDbError } from './supabaseCatalogService'
import { createSupabaseTeam } from './supabaseTeam'

/** supabase-js with recording rpc and functions.invoke, answering from the given maps. */
function stub(rpcAnswers: Record<string, unknown> = {}, invokeAnswer: { data?: unknown; error?: unknown } = {}) {
  const rpc = vi.fn(async (fn: string) => ({ data: rpcAnswers[fn] ?? null, error: null }))
  const invoke = vi.fn(async () => ({ data: invokeAnswer.data ?? null, error: invokeAnswer.error ?? null }))
  const sb = { rpc, functions: { invoke } } as unknown as SupabaseClient
  return { sb, rpc, invoke }
}

/** What supabase-js returns for a non-2xx function response: a FunctionsHttpError whose context is the Response. */
const httpError = (status: number, body: unknown) => ({ name: 'FunctionsHttpError', context: new Response(JSON.stringify(body), { status }) })

describe('Supabase team service', () => {
  it('reads the caller access from my_platform_access', async () => {
    const { sb } = stub({ my_platform_access: { role: 'team', permissions: ['products.view'] } })
    expect(await createSupabaseTeam(sb).getMyAccess()).toEqual({ ok: true, data: { role: 'team', permissions: ['products.view'] } })
  })

  it('maps the member list rows', async () => {
    const row = { id: 'm1', userId: null, email: 'ana@studio.test', fullName: null, role: 'team', status: 'invited', invitedBy: 'owner@x.test', createdAt: '2026-10-25T00:00:00Z', activatedAt: null, deactivatedAt: null, lastSignInAt: null, invite: { status: 'sent', expiresAt: '2026-11-01T00:00:00Z' } }
    const { sb } = stub({ admin_list_members: { members: [row] } })
    expect(await createSupabaseTeam(sb).listMembers()).toEqual({ ok: true, data: [{ ...row, avatarUrl: null }] })
  })

  it('adds photos and profile names from profiles, with one query for the listed users', async () => {
    const member = (id: string, userId: string | null, fullName: string | null) => ({ id, userId, email: `${id}@x.test`, fullName, role: 'team', status: userId ? 'active' : 'invited', invitedBy: null, createdAt: 'a', activatedAt: null, deactivatedAt: null, lastSignInAt: null, invite: null })
    const rows = [member('owner', 'u1', null), member('ana', 'u2', 'Ana Ribeiro'), member('marta', null, null)]
    const inFn = vi.fn(async () => ({ data: [{ user_id: 'u1', avatar_path: 'u1/p.webp', display_name: 'Owner Name' }, { user_id: 'u2', avatar_path: null, display_name: null }], error: null }))
    const select = vi.fn(() => ({ in: inFn }))
    const from = vi.fn(() => ({ select }))
    const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.test/avatars/${path}` } }))
    const sb = {
      rpc: vi.fn(async (fn: string) => ({ data: fn === 'admin_list_members' ? { members: rows } : { member: rows[0] }, error: null })),
      from,
      storage: { from: vi.fn(() => ({ getPublicUrl })) },
    } as unknown as SupabaseClient
    const r = await createSupabaseTeam(sb).listMembers()
    expect(from).toHaveBeenCalledWith('profiles')
    expect(select).toHaveBeenCalledWith('user_id, avatar_path, display_name')
    expect(inFn).toHaveBeenCalledWith('user_id', ['u1', 'u2'])
    expect(r.ok && r.data.map((m) => [m.id, m.fullName, m.avatarUrl])).toEqual([
      ['owner', 'Owner Name', 'https://cdn.test/avatars/u1/p.webp'],
      ['ana', 'Ana Ribeiro', null],
      ['marta', null, null],
    ])
    const one = await createSupabaseTeam(sb).getMember('owner')
    expect(one.ok && one.data.avatarUrl).toBe('https://cdn.test/avatars/u1/p.webp')
    expect(inFn).toHaveBeenLastCalledWith('user_id', ['u1'])
  })

  it('still lists the members, with initials, when the photo lookup fails', async () => {
    const row = { id: 'm1', userId: 'u1', email: 'ana@studio.test', fullName: 'Ana', role: 'team', status: 'active', invitedBy: null, createdAt: 'a', activatedAt: null, deactivatedAt: null, lastSignInAt: null, invite: null }
    const sb = {
      rpc: vi.fn(async () => ({ data: { members: [row] }, error: null })),
      from: () => ({ select: () => ({ in: async () => ({ data: null, error: { code: '42501', message: 'denied' } }) }) }),
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: 'x' } }) }) },
    } as unknown as SupabaseClient
    expect(await createSupabaseTeam(sb).listMembers()).toEqual({ ok: true, data: [{ ...row, avatarUrl: null }] })
  })

  it('turns {error} answers from the database into reasons', async () => {
    const { sb } = stub({ admin_list_members: { error: 'forbidden' } })
    const r = await createSupabaseTeam(sb).listMembers()
    expect(r).toEqual({ ok: false, error: { code: 'PERMISSION', reason: 'forbidden', message: "You don't have permission to do this." } })
  })

  it('invites through the invite-member function', async () => {
    const outcome = { memberId: 'm1', status: 'sent', sentAt: 'a', expiresAt: 'b' }
    const { sb, invoke } = stub({}, { data: outcome })
    expect(await createSupabaseTeam(sb).inviteMember({ email: 'ana@studio.test', role: 'team', note: 'Hi' })).toEqual({ ok: true, data: outcome })
    expect(invoke).toHaveBeenCalledWith('invite-member', { body: { action: 'invite', email: 'ana@studio.test', role: 'team', note: 'Hi' } })
  })

  it('reads the reason from a non-2xx function response', async () => {
    const { sb } = stub({}, { error: httpError(409, { error: 'already_member' }) })
    const r = await createSupabaseTeam(sb).inviteMember({ email: 'ana@studio.test', role: 'team' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatchObject({ code: 'CONFLICT', reason: 'already_member' })
  })

  it('maps the 2FA gate refusal of invite-member to the 2FA sentence (R-W1-1)', async () => {
    const { sb } = stub({}, { error: httpError(403, { error: 'aal2_required' }) })
    const r = await createSupabaseTeam(sb).resendMemberInvite('m1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toEqual({ code: 'PERMISSION', reason: 'aal2_required', message: 'This needs 2FA. Sign in with your authenticator code first.' })
  })

  it('passes the password rule message through', async () => {
    const { sb } = stub({}, { error: httpError(422, { error: 'weak_password', message: 'Password is known to be weak' }) })
    const r = await createSupabaseTeam(sb).acceptInviteCreate({ token: 't', fullName: 'Ana', password: 'password' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatchObject({ reason: 'weak_password', message: 'Password is known to be weak' })
  })

  it('inspects an invitation without a session', async () => {
    const { sb, invoke } = stub({}, { data: { state: 'valid', email: 'ana@studio.test', role: 'team', expiresAt: 'x', invitedBy: 'o', accountExists: false } })
    const r = await createSupabaseTeam(sb).inspectInvite('secret')
    expect(r.ok && r.data.state).toBe('valid')
    expect(invoke).toHaveBeenCalledWith('accept-member-invite', { body: { action: 'inspect', token: 'secret' } })
  })

  it('updates role permissions through the database function', async () => {
    const { sb, rpc } = stub({ admin_set_role_permissions: { ok: true } })
    expect((await createSupabaseTeam(sb).setRolePermissions('team', ['products.view'])).ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('admin_set_role_permissions', { p_role: 'team', p_permissions: ['products.view'] })
  })

  it('says plainly when the database update has not been applied yet', async () => {
    const sb = { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }) } as unknown as SupabaseClient
    const r = await createSupabaseTeam(sb).listMembers()
    expect(r).toEqual({ ok: false, error: { code: 'CONFIG', reason: 'not_enabled', message: "Team management isn't switched on yet: the database update has not been applied." } })
  })

  it('tells open pages to refresh after a successful change, and only then (review I3)', async () => {
    const notify = vi.fn()
    const okStub = stub({ admin_set_role_permissions: { ok: true } }, { data: { ok: true } })
    const team = createSupabaseTeam(okStub.sb, notify)
    await team.deactivateMember('m1')
    await team.setRolePermissions('team', ['products.view'])
    expect(notify).toHaveBeenCalledTimes(2)
    const failing = createSupabaseTeam(stub({}, { error: httpError(403, { error: 'forbidden' }) }).sb, notify)
    await failing.revokeMemberInvite('m1')
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it('reports a failed sign-out instead of claiming success (review)', async () => {
    const { sb } = stub({}, { data: { ok: true, signOut: 'failed' } })
    const r = await createSupabaseTeam(sb).deactivateMember('m1')
    expect(r).toEqual({ ok: true, data: { signOut: 'failed' } })
  })

  it('maps 42501 to forbidden', () => {
    expect(mapDbError({ code: '42501', message: 'permission denied for table products' })).toEqual({
      ok: false,
      error: { code: 'PERMISSION', reason: 'forbidden', message: "You don't have permission to do this." },
    })
  })

  // R-W6-4: a member's history is matched on exact ids; there is no ilike search on email.
  it('access history for one member filters on member_id, or access_denied by their login, with no ilike', async () => {
    const calls: [string, ...unknown[]][] = []
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'like', 'order', 'range', 'eq', 'neq', 'gte', 'lte', 'ilike', 'or']) {
      builder[m] = (...args: unknown[]) => (calls.push([m, ...args]), builder)
    }
    builder.then = (resolve: (v: unknown) => void) => resolve({ data: [], count: 0, error: null })
    const sb = { from: vi.fn(() => builder), rpc: vi.fn() } as unknown as SupabaseClient
    const team = createSupabaseTeam(sb)
    const MEMBER = '00000000-0000-4000-8000-0000000000c1'
    const USER = '00000000-0000-4000-8000-0000000000d1'

    expect(await team.getAccessEvents({ memberId: MEMBER, userId: USER })).toEqual({ ok: true, data: { items: [], total: 0 } })
    expect(calls).toContainEqual(['or', `metadata->>member_id.eq.${MEMBER},and(event_type.eq.access_denied,actor_id.eq.${USER})`])
    expect(calls.some(([m]) => m === 'ilike')).toBe(false)

    calls.length = 0
    await team.getAccessEvents({ memberId: MEMBER }) // invited: no login yet
    expect(calls).toContainEqual(['eq', 'metadata->>member_id', MEMBER])
    expect(calls.some(([m]) => m === 'ilike' || m === 'or')).toBe(false)

    // Anything that is not an id never reaches the filter string.
    calls.length = 0
    expect(await team.getAccessEvents({ memberId: 'x,or(id.neq.0)', userId: USER })).toEqual({ ok: true, data: { items: [], total: 0 } })
    expect(calls).toEqual([])
  })

  it('passes has2fa through from admin_list_members (R-W6-6)', async () => {
    const row = { id: 'm1', userId: null, email: 'ana@studio.test', fullName: null, role: 'team', status: 'invited', invitedBy: null, createdAt: 'a', activatedAt: null, deactivatedAt: null, lastSignInAt: null, invite: null, has2fa: false }
    const { sb } = stub({ admin_list_members: { members: [row, { ...row, id: 'm2', has2fa: true }] } })
    const r = await createSupabaseTeam(sb).listMembers()
    expect(r.ok && r.data.map((m) => m.has2fa)).toEqual([false, true])
  })
})
