// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { LogEntry } from '../_shared/email'
import { type InviteDeps, handleInviteMember } from './handler'

const OWNER = '00000000-0000-0000-0000-0000000000a1'
const MEMBER = '00000000-0000-0000-0000-0000000000c1'
const NOW = new Date('2026-10-25T10:00:00Z')
const CONFIG = { apiKey: 'k', from: 'Sanctus <x@y.test>', appBaseUrl: 'https://preview.example.app', testRecipients: [] as string[], adminEmail: '' }

function deps(over: Partial<InviteDeps> = {}) {
  const logs: LogEntry[] = []
  const bodies: string[] = []
  const audits: unknown[] = []
  const denied: string[] = []
  const created: { hash: string; expiresAt: string }[] = []
  const recorded: { ok: boolean; detail: string }[] = []
  const d: InviteDeps = {
    config: { ok: true, config: CONFIG as never },
    fetch: (async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body))
      return new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 })
    }) as never,
    now: () => NOW,
    userIdFromToken: async (t) => (t === 'owner-token' || t === 'owner-aal1-token' ? OWNER : t === 'admin-token' ? 'someone-else' : null),
    // The 2FA gate (R-W1-1): the Owner at aal2 passes, at aal1 needs the second step; anyone else is not the Owner.
    gate: async (t) => (t === 'owner-token' ? 'ok' : t === 'owner-aal1-token' ? 'aal2_required' : 'forbidden'),
    inviteMember: async () => ({ ok: true, memberId: MEMBER }),
    getMember: async () => ({ id: MEMBER, email: 'ana@studio.test', role: 'team', status: 'invited' }),
    createInvite: async (_m, hash, expiresAt) => (created.push({ hash, expiresAt }), { ok: true, inviteId: 'inv_1' }),
    recordEmail: async (_i, ok, detail) => void recorded.push({ ok, detail }),
    inviterName: async () => 'Platform Owner',
    logDenied: async (_a, action) => void denied.push(action),
    log: async (e) => (logs.push(e), 'log_1'),
    ...over,
  }
  return { d, logs, bodies, audits, denied, created, recorded }
}

const post = (body: unknown, token = 'owner-token') =>
  new Request('https://fn.test/invite-member', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('invite-member (ADR-0030)', () => {
  it('refuses a non-owner, logs the attempt and sends nothing', async () => {
    const { d, bodies, denied } = deps()
    const res = await handleInviteMember(post({ action: 'invite', email: 'ana@studio.test', role: 'team' }, 'admin-token'), d)
    expect(res.status).toBe(403)
    expect(denied).toEqual(['invite_member'])
    expect(bodies).toHaveLength(0)
  })

  it('invite and resend both return 403 aal2_required at aal1', async () => {
    const inviteMember = vi.fn<InviteDeps['inviteMember']>()
    const createInvite = vi.fn<InviteDeps['createInvite']>()
    const { d, bodies, denied } = deps({ inviteMember, createInvite })
    for (const body of [{ action: 'invite', email: 'ana@studio.test', role: 'team' }, { action: 'resend', memberId: MEMBER }]) {
      const res = await handleInviteMember(post(body, 'owner-aal1-token'), d)
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'aal2_required' })
    }
    expect(inviteMember).not.toHaveBeenCalled()
    expect(createInvite).not.toHaveBeenCalled()
    expect(bodies).toHaveLength(0)
    // The Owner is not refused a permission, only asked for the second step: not an access-denied event.
    expect(denied).toEqual([])
  })

  it('refuses a non-owner on resend too', async () => {
    const { d, denied, created } = deps()
    const res = await handleInviteMember(post({ action: 'resend', memberId: MEMBER }, 'admin-token'), d)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
    expect(denied).toEqual(['resend_member_invite'])
    expect(created).toHaveLength(0)
  })

  it('emails a /join link and never returns, logs or stores the secret', async () => {
    const { d, bodies, logs, created } = deps()
    const res = await handleInviteMember(post({ action: 'invite', email: 'ana@studio.test', role: 'team', note: 'Welcome' }), d)
    const json = (await res.json()) as Record<string, unknown>
    expect(res.status).toBe(200)
    expect(json).toEqual({ memberId: MEMBER, status: 'sent', sentAt: NOW.toISOString(), expiresAt: '2026-11-01T10:00:00.000Z' })
    const secret = /\/join#t=([A-Za-z0-9_-]{43})/.exec(bodies[0]!)?.[1]
    expect(secret).toBeDefined()
    expect(JSON.stringify(json)).not.toContain(secret!)
    expect(JSON.stringify(logs)).not.toContain(secret!)
    expect(created[0]!.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(created[0]!.hash).not.toContain(secret!)
    expect(created[0]!.expiresAt).toBe('2026-11-01T10:00:00.000Z')
    expect(logs[0]).toMatchObject({ kind: 'team_invitation', workflow: `team_invite:${MEMBER}`, status: 'accepted' })
  })

  it('reports a provider failure as email_failed, not as sent', async () => {
    const { d, recorded } = deps({ fetch: (async () => new Response('down', { status: 500 })) as never })
    const res = await handleInviteMember(post({ action: 'invite', email: 'ana@studio.test', role: 'admin' }), d)
    const json = (await res.json()) as Record<string, unknown>
    expect(res.status).toBe(200)
    expect(json.status).toBe('email_failed')
    expect(recorded[0]!.ok).toBe(false)
  })

  it('passes database refusals through', async () => {
    const { d } = deps({ inviteMember: async () => ({ error: 'already_member' }) })
    const res = await handleInviteMember(post({ action: 'invite', email: 'ana@studio.test', role: 'team' }), d)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'already_member' })
  })

  it('validates the request', async () => {
    const { d } = deps()
    expect((await handleInviteMember(post({ action: 'invite', email: 'ana@studio.test', role: 'owner' }), d)).status).toBe(422)
    expect((await handleInviteMember(post({ action: 'invite', email: 'ana@studio.test', role: 'team', note: 'x'.repeat(501) }), d)).status).toBe(422)
    expect((await handleInviteMember(post({ action: 'nope' }), d)).status).toBe(400)
    expect((await handleInviteMember(post({ action: 'invite' }, 'bad-token'), d)).status).toBe(401)
  })

  it('resends only to someone still invited, and respects the rate limit', async () => {
    const active = deps({ getMember: async () => ({ id: MEMBER, email: 'ana@studio.test', role: 'team', status: 'active' }) })
    expect((await handleInviteMember(post({ action: 'resend', memberId: MEMBER }), active.d)).status).toBe(409)
    const limited = deps({ createInvite: async () => ({ error: 'rate_limited' }) })
    const res = await handleInviteMember(post({ action: 'resend', memberId: MEMBER }), limited.d)
    expect(res.status).toBe(429)
    expect(limited.bodies).toHaveLength(0)
  })
})
