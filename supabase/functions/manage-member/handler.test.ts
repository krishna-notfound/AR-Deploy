// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { type ManageDeps, handleManageMember } from './handler'

const MEMBER = '00000000-0000-0000-0000-0000000000c1'
const USER = '00000000-0000-0000-0000-0000000000c2'

function deps(over: Partial<ManageDeps> = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = []
  const signedOut: string[] = []
  const d: ManageDeps = {
    userIdFromToken: async (t) => (t === 'owner-token' ? 'owner' : null),
    rpcAsCaller: async (_token, fn, args) => {
      calls.push({ fn, args })
      return fn === 'admin_deactivate_member' ? { ok: true, userId: USER } : { ok: true }
    },
    signOutUser: async (id) => void signedOut.push(id),
    ...over,
  }
  return { d, calls, signedOut }
}

const post = (body: unknown, token = 'owner-token') =>
  new Request('https://fn.test/manage-member', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) })

describe('manage-member (ADR-0029)', () => {
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
})
