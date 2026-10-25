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
    expect(await createSupabaseTeam(sb).listMembers()).toEqual({ ok: true, data: [row] })
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
})
