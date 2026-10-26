// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { type AcceptDeps, handleAcceptMemberInvite } from './handler'

const SECRET = 'A'.repeat(43)
const VALID = { state: 'valid', email: 'ana@studio.test', role: 'team', invitedBy: 'owner@sanctus.test', expiresAt: '2026-11-01T10:00:00Z', userExists: false }

function deps(over: Partial<AcceptDeps> = {}) {
  const accepted: { hash: string; userId: string; fullName?: string }[] = []
  const created: { email: string; password: string; fullName: string }[] = []
  const d: AcceptDeps = {
    inspect: async () => ({ ...VALID }),
    createUser: async (u) => (created.push(u), { ok: true, userId: 'new-user' }),
    accept: async (hash, userId, fullName) => (accepted.push({ hash, userId, fullName }), 'ok'),
    userFromToken: async (t) => (t === 'ana-token' ? { id: 'ana-user' } : null),
    allow: async () => true,
    ...over,
  }
  return { d, accepted, created }
}

const post = (body: unknown, token?: string) =>
  new Request('https://fn.test/accept-member-invite', {
    method: 'POST',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  })

describe('accept-member-invite (ADR-0030)', () => {
  it('inspect twice then create succeeds; only create uses the invitation', async () => {
    const { d, accepted, created } = deps()
    for (let i = 0; i < 2; i++) {
      const r = await handleAcceptMemberInvite(post({ action: 'inspect', token: SECRET }), d)
      expect(r.status).toBe(200)
      expect(await r.json()).toEqual({ state: 'valid', email: 'ana@studio.test', role: 'team', invitedBy: 'owner@sanctus.test', expiresAt: '2026-11-01T10:00:00Z', accountExists: false })
    }
    expect(accepted).toHaveLength(0)
    const res = await handleAcceptMemberInvite(post({ action: 'create', token: SECRET, fullName: 'Ana Lima', password: 'a-long-passphrase' }), d)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, email: 'ana@studio.test' })
    expect(created).toEqual([{ email: 'ana@studio.test', password: 'a-long-passphrase', fullName: 'Ana Lima' }])
    expect(accepted).toHaveLength(1)
    expect(accepted[0]!.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(accepted[0]).toMatchObject({ userId: 'new-user', fullName: 'Ana Lima' })
  })

  it('does not create a second login for an existing account', async () => {
    const { d, accepted } = deps({ createUser: async () => ({ ok: false, error: 'exists', message: 'already registered' }) })
    const res = await handleAcceptMemberInvite(post({ action: 'create', token: SECRET, fullName: 'Ana', password: 'a-long-passphrase' }), d)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'account_exists' })
    expect(accepted).toHaveLength(0)
  })

  it('returns the password rule from Auth', async () => {
    const { d } = deps({ createUser: async () => ({ ok: false, error: 'weak_password', message: 'Password is known to be weak' }) })
    const res = await handleAcceptMemberInvite(post({ action: 'create', token: SECRET, fullName: 'Ana', password: 'password1234' }), d)
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'weak_password', message: 'Password is known to be weak' })
  })

  it('an 11-character password gets 422 invalid_request; 12 passes; 73 gets 422', async () => {
    for (const [password, status] of [['a'.repeat(11), 422], ['a'.repeat(73), 422]] as const) {
      const { d, created } = deps()
      const res = await handleAcceptMemberInvite(post({ action: 'create', token: SECRET, fullName: 'Ana', password }), d)
      expect(res.status).toBe(status)
      expect(await res.json()).toEqual({ error: 'invalid_request' })
      expect(created).toHaveLength(0)
    }
    for (const password of ['a'.repeat(12), 'a'.repeat(72)]) {
      const { d, created } = deps()
      const res = await handleAcceptMemberInvite(post({ action: 'create', token: SECRET, fullName: 'Ana', password }), d)
      expect(res.status).toBe(200)
      expect(created).toHaveLength(1)
    }
  })

  it('refuses an expired invitation without creating anyone', async () => {
    const { d, created } = deps({ inspect: async () => ({ state: 'expired' }) })
    const res = await handleAcceptMemberInvite(post({ action: 'create', token: SECRET, fullName: 'Ana', password: 'a-long-passphrase' }), d)
    expect(res.status).toBe(410)
    expect(await res.json()).toEqual({ error: 'invite_expired' })
    expect(created).toHaveLength(0)
  })

  it('accepts for a signed-in account, and reports an email mismatch', async () => {
    const ok = deps()
    expect((await handleAcceptMemberInvite(post({ action: 'accept', token: SECRET }, 'ana-token'), ok.d)).status).toBe(200)
    expect(ok.accepted[0]!.userId).toBe('ana-user')
    const mismatch = deps({ accept: async () => 'email_mismatch' })
    const res = await handleAcceptMemberInvite(post({ action: 'accept', token: SECRET }, 'ana-token'), mismatch.d)
    expect(res.status).toBe(403)
    expect((await handleAcceptMemberInvite(post({ action: 'accept', token: SECRET }), ok.d)).status).toBe(401)
  })

  it('treats a missing or malformed token as invalid without asking the database', async () => {
    let asked = 0
    const { d } = deps({ inspect: async () => (asked++, { ...VALID }) })
    for (const token of [undefined, '', 'short', 'x'.repeat(101), 'A'.repeat(42) + '!']) {
      const res = await handleAcceptMemberInvite(post({ action: 'inspect', token }), d)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ state: 'invalid' })
    }
    expect(asked).toBe(0)
  })

  it('rate-limits per IP', async () => {
    const { d } = deps({ allow: async () => false })
    expect((await handleAcceptMemberInvite(post({ action: 'inspect', token: SECRET }), d)).status).toBe(429)
  })
})
