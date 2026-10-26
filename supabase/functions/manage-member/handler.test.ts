// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { type ManageDeps, handleManageMember } from './handler'

const MEMBER = '00000000-0000-0000-0000-0000000000c1'
const USER = '00000000-0000-0000-0000-0000000000c2'

function deps(over: Partial<ManageDeps> = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = []
  const signedOut: string[] = []
  const deleted: string[] = []
  const d: ManageDeps = {
    userIdFromToken: async (t) => ({ 'owner-token': 'owner', 'aal1-token': 'owner', 'team-token': 'team' })[t] ?? null,
    gate: async (t) => (t === 'owner-token' ? 'ok' : t === 'aal1-token' ? 'aal2_required' : 'forbidden'),
    rpcAsCaller: async (_token, fn, args) => {
      calls.push({ fn, args })
      if (fn === 'admin_remove_member') return { ok: true, user_id: USER }
      return fn === 'admin_deactivate_member' ? { ok: true, userId: USER } : { ok: true }
    },
    signOutUser: async (id) => void signedOut.push(id),
    deleteLoginIfUnused: async (id) => {
      deleted.push(id)
      return true
    },
    ...over,
  }
  return { d, calls, signedOut, deleted }
}

const post = (body: unknown, token = 'owner-token') =>
  new Request('https://fn.test/manage-member', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) })

describe('manage-member (ADR-0029)', () => {
  // Spec §10.3: the 2FA gate runs first, before any RPC.
  it('an Owner session at aal1 gets 403 aal2_required and no RPC runs', async () => {
    const { d, calls } = deps()
    const res = await handleManageMember(post({ action: 'deactivate', memberId: MEMBER }, 'aal1-token'), d)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'aal2_required' })
    expect(calls).toHaveLength(0)
  })

  it('a non-Owner gets 403 forbidden from the gate and no RPC runs', async () => {
    const { d, calls } = deps()
    const res = await handleManageMember(post({ action: 'remove', memberId: MEMBER }, 'team-token'), d)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
    expect(calls).toHaveLength(0)
  })

  it('deactivates, then signs the member out everywhere', async () => {
    const { d, calls, signedOut } = deps()
    const res = await handleManageMember(post({ action: 'deactivate', memberId: MEMBER }), d)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(calls[0]).toEqual({ fn: 'admin_deactivate_member', args: { p_member: MEMBER } })
    expect(signedOut).toEqual([USER])
  })

  it('still succeeds when the sign-out fails (the database already blocks access)', async () => {
    const { d } = deps({ signOutUser: async () => { throw new Error('auth down') } })
    const res = await handleManageMember(post({ action: 'deactivate', memberId: MEMBER }), d)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, signOut: 'failed' })
  })

  it('maps database refusals to HTTP statuses', async () => {
    const forbidden = deps({ rpcAsCaller: async () => ({ error: 'forbidden' }) })
    expect((await handleManageMember(post({ action: 'set_role', memberId: MEMBER, role: 'admin' }), forbidden.d)).status).toBe(403)
    const missing = deps({ rpcAsCaller: async () => ({ error: 'not_found' }) })
    expect((await handleManageMember(post({ action: 'reactivate', memberId: MEMBER }), missing.d)).status).toBe(404)
    const none = deps({ rpcAsCaller: async () => ({ error: 'no_live_invite' }) })
    expect((await handleManageMember(post({ action: 'revoke_invite', memberId: MEMBER }), none.d)).status).toBe(409)
  })

  it('validates the request', async () => {
    const { d } = deps()
    expect((await handleManageMember(post({ action: 'explode', memberId: MEMBER }), d)).status).toBe(400)
    expect((await handleManageMember(post({ action: 'set_role', memberId: MEMBER, role: 'owner' }), d)).status).toBe(400)
    expect((await handleManageMember(post({ action: 'deactivate', memberId: 'x' }), d)).status).toBe(400)
    expect((await handleManageMember(post({ action: 'deactivate', memberId: MEMBER }, 'nope'), d)).status).toBe(401)
  })

  it('passes the role to the database for set_role', async () => {
    const { d, calls } = deps()
    await handleManageMember(post({ action: 'set_role', memberId: MEMBER, role: 'team' }), d)
    expect(calls[0]).toEqual({ fn: 'admin_set_member_role', args: { p_member: MEMBER, p_role: 'team' } })
  })

  it('remove calls admin_remove_member with the caller token, then deletes the login only when unused; loginDeleted reported', async () => {
    const tokens: string[] = []
    const order: string[] = []
    const { d, calls, deleted } = deps({
      rpcAsCaller: async (token, fn, args) => {
        tokens.push(token)
        order.push(fn)
        calls.push({ fn, args })
        return { ok: true, user_id: USER }
      },
    })
    const removeDeps: ManageDeps = { ...d, deleteLoginIfUnused: async (id) => (order.push('deleteLoginIfUnused'), d.deleteLoginIfUnused(id)) }
    const res = await handleManageMember(post({ action: 'remove', memberId: MEMBER }), removeDeps)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, loginDeleted: true })
    expect(calls).toEqual([{ fn: 'admin_remove_member', args: { p_member: MEMBER } }])
    expect(tokens).toEqual(['owner-token'])
    expect(order).toEqual(['admin_remove_member', 'deleteLoginIfUnused'])
    expect(deleted).toEqual([USER])

    // The login is still used (a business or the Owner): kept, and said so.
    const used = deps({ deleteLoginIfUnused: async () => false })
    const kept = await handleManageMember(post({ action: 'remove', memberId: MEMBER }), used.d)
    expect(await kept.json()).toEqual({ ok: true, loginDeleted: false })

    // A member who never accepted has no login: nothing to delete.
    const never = deps({ rpcAsCaller: async () => ({ ok: true, user_id: null }) })
    const none = await handleManageMember(post({ action: 'remove', memberId: MEMBER }), never.d)
    expect(await none.json()).toEqual({ ok: true, loginDeleted: false })
    expect(never.deleted).toEqual([])

    // The row is gone even when deleting the login fails: reported, not an error.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const broken = deps({ deleteLoginIfUnused: async () => { throw new Error('auth down for gone@x.pt') } })
      const failed = await handleManageMember(post({ action: 'remove', memberId: MEMBER }), broken.d)
      expect(failed.status).toBe(200)
      expect(await failed.json()).toEqual({ ok: true, loginDeleted: false })
      // The failure leaves a trace: one fixed line, with no address and no token in it.
      expect(logged).toHaveBeenCalledTimes(1)
      const line = String(logged.mock.calls[0]![0])
      expect(line).toMatch(/^manage-member: delete login failed: /)
      expect(line).toContain('auth down')
      expect(line).not.toMatch(/[^\s@]+@[^\s@]+/)
      expect(line).not.toContain('owner-token')
    } finally {
      logged.mockRestore()
    }
  })

  it('remove: a refusal deletes nothing (not_deactivated 409, self 409, forbidden 403)', async () => {
    for (const [error, status] of [['not_deactivated', 409], ['self', 409], ['forbidden', 403], ['not_found', 404]] as const) {
      const r = deps({ rpcAsCaller: async () => ({ error }) })
      const res = await handleManageMember(post({ action: 'remove', memberId: MEMBER }), r.d)
      expect(res.status).toBe(status)
      expect(await res.json()).toEqual({ error })
      expect(r.deleted).toEqual([])
    }
  })
})
