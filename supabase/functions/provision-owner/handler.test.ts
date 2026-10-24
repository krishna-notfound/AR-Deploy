// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { EmailConfig, LogEntry } from '../_shared/email'
import { MAX_INVITATION_ATTEMPTS, type ProvisionDeps, RESEND_COOLDOWN_SECONDS, handleProvisionOwner } from './handler'

const BIZ = '11111111-1111-4111-8111-111111111111'
const APP = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-10-20T10:00:00Z')
const CONFIG: EmailConfig = {
  apiKey: 're_test',
  from: 'Sanctus <onboarding@resend.dev>',
  appBaseUrl: 'https://preview.example.app',
  testRecipients: ['owner@shop.test'],
  adminNotificationEmail: 'team@account.test',
}
const CODE = '48213907'

function deps(over: Partial<ProvisionDeps> = {}) {
  let owner: { userId: string; email: string; acceptedAt: string | null } | null = null
  const logs: (LogEntry & { createdAt: string })[] = []
  const audits: { eventType: string; metadata?: Record<string, unknown> }[] = []
  const links: { type: string; email: string }[] = []
  const bodies: string[] = []
  const fetchFn = vi.fn(async (_u: string, init?: RequestInit) => {
    bodies.push(String(init?.body))
    return new Response(JSON.stringify({ id: `msg-${bodies.length}-abcdef` }), { status: 200 })
  })
  const d: ProvisionDeps = {
    config: { ok: true, config: CONFIG },
    fetch: fetchFn as unknown as typeof fetch,
    now: () => NOW,
    userIdFromToken: async (t) => (t === 'admin-token' ? 'admin-id' : t === 'owner-token' ? 'owner-id' : null),
    isPlatformAdmin: async (id) => id === 'admin-id',
    getBusiness: async (id) => (id === BIZ ? { id, name: 'Casa Lisboa' } : null),
    getOwner: async () => owner,
    accountByEmail: async (e) => (e === 'admin@platform.test' ? { id: 'admin-id', invited: false, ownsBusiness: false } : null),
    generateCode: async (type, email) => (links.push({ type, email }), { ok: true, code: CODE, userId: 'new-user' }),
    linkOwner: async (_b, userId) => {
      if (owner && owner.userId !== userId) return 'business_has_owner'
      if (owner) return 'already_linked'
      owner = { userId, email: links.at(-1)!.email, acceptedAt: null }
      return 'linked'
    },
    invitationAttempts: async () => ({ count: logs.length, lastAt: logs[0]?.createdAt ?? null }),
    audit: async (e) => void audits.push(e),
    log: async (e) => (logs.unshift({ ...e, createdAt: new Date(NOW.getTime() - 120_000).toISOString() }), `log-${logs.length}`),
    ...over,
  }
  return { d, logs, audits, links, bodies, fetchFn, setOwner: (o: typeof owner) => (owner = o) }
}

const post = (body: unknown, token = 'admin-token', origin?: string) =>
  new Request('https://fn.test/provision-owner', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  })

const provision = (over: Record<string, unknown> = {}) => ({ action: 'provision', businessId: BIZ, email: 'Owner@Shop.test', language: 'pt', applicationId: APP, ...over })

describe('provision-owner', () => {
  it('requires a signed-in platform admin', async () => {
    const { d } = deps()
    expect((await handleProvisionOwner(post(provision(), 'bad'), d)).status).toBe(401)
    expect((await handleProvisionOwner(post(provision(), 'owner-token'), d)).status).toBe(403)
  })

  it('links the owner, emails the invitation code and never returns or logs it', async () => {
    const { d, logs, audits, links, bodies } = deps()
    const res = await handleProvisionOwner(post(provision()), d)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual({ owner: 'linked', email: { status: 'accepted', attempt: 1 } })
    expect(JSON.stringify(json)).not.toContain(CODE)
    expect(links[0]).toEqual({ type: 'invite', email: 'owner@shop.test' })
    expect(bodies[0]).toContain(CODE) // the code goes into the email only
    expect(bodies[0]).toContain('https://preview.example.app/accept-invite?lang=pt') // a plain page link, no token
    expect(bodies[0]).not.toContain('/auth/v1/verify')
    expect(JSON.stringify(logs)).not.toContain(CODE)
    expect(JSON.stringify(audits)).not.toContain(CODE)
    expect(logs[0]).toMatchObject({ kind: 'owner_invitation', status: 'accepted', workflow: `invite:${BIZ}`, attempt: 1, applicationId: APP, businessId: BIZ, triggeredBy: 'admin-id' })
    expect(audits).toEqual([{ eventType: 'invitation_requested', actorId: 'admin-id', businessId: BIZ, applicationId: APP, metadata: { attempt: 1, email_status: 'accepted' } }])
  })

  it('keeps exactly one owner: a different email is refused', async () => {
    const { d, setOwner } = deps()
    setOwner({ userId: 'u1', email: 'first@shop.test', acceptedAt: null })
    const res = await handleProvisionOwner(post(provision({ email: 'second@shop.test' })), d)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'business_has_owner' })
  })

  it('refuses to make a platform admin an owner, and validates input', async () => {
    const { d } = deps()
    expect((await handleProvisionOwner(post(provision({ email: 'admin@platform.test' })), d)).status).toBe(409)
    expect((await handleProvisionOwner(post(provision({ email: 'nope' })), d)).status).toBe(400)
    expect((await handleProvisionOwner(post(provision({ businessId: 'x' })), d)).status).toBe(400)
    expect((await handleProvisionOwner(post(provision({ businessId: '33333333-3333-4333-8333-333333333333' })), d)).status).toBe(404)
    expect((await handleProvisionOwner(post({ action: 'other', businessId: BIZ }), d)).status).toBe(400)
  })

  it('refuses an existing account it did not invite (pre-registered email), without creating a link', async () => {
    const { d, links } = deps({ accountByEmail: async () => ({ id: 'squatter', invited: false, ownsBusiness: false }) })
    const res = await handleProvisionOwner(post(provision()), d)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'account_not_invited' })
    expect(links).toHaveLength(0)
  })

  it('refuses an email that already owns another business', async () => {
    const { d, links } = deps({ accountByEmail: async () => ({ id: 'owner-b', invited: true, ownsBusiness: true }) })
    const res = await handleProvisionOwner(post(provision()), d)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'email_owns_business' })
    expect(links).toHaveLength(0)
  })

  it('falls back to a sign-in code when the invited account is already confirmed', async () => {
    const { d, links } = deps({
      accountByEmail: async () => ({ id: 'existing', invited: true, ownsBusiness: false }),
      generateCode: async (type, email) => {
        links.push({ type, email })
        return type === 'invite' ? { ok: false, error: 'already registered' } : { ok: true, code: CODE, userId: 'existing' }
      },
    })
    const res = await handleProvisionOwner(post(provision()), d)
    expect(res.status).toBe(200)
    expect(links.map((l) => l.type)).toEqual(['invite', 'magiclink'])
  })

  it('audits and reports a failed code without linking anyone', async () => {
    const { d, audits, logs } = deps({ generateCode: async () => ({ ok: false, error: 'rate limited' }) })
    const res = await handleProvisionOwner(post(provision()), d)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'invite_link_failed' })
    expect(audits[0]).toMatchObject({ eventType: 'invitation_failed' })
    expect(logs).toHaveLength(0)
  })

  it('keeps the owner linked when the email cannot be sent', async () => {
    const { d, logs } = deps({ config: { ok: false, missing: ['RESEND_API_KEY'] } })
    const res = await handleProvisionOwner(post(provision(), 'admin-token', 'https://sanctus-preview.vercel.app'), d)
    expect(await res.json()).toEqual({ owner: 'linked', email: { status: 'blocked', error: 'email_not_configured', attempt: 1 } })
    expect(logs[0]).toMatchObject({ status: 'blocked', error: 'email_not_configured' })
  })

  it('uses the admin origin for the landing page only when APP_BASE_URL is unset and the origin is https', async () => {
    const a = deps({ config: { ok: true, config: { ...CONFIG, appBaseUrl: '' } } })
    await handleProvisionOwner(post(provision(), 'admin-token', 'https://sanctus-preview.vercel.app'), a.d)
    expect(a.bodies[0]).toContain('https://sanctus-preview.vercel.app/accept-invite?lang=pt')
    const b = deps({ config: { ok: false, missing: ['APP_BASE_URL'] } })
    expect((await handleProvisionOwner(post(provision(), 'admin-token', 'http://evil.test'), b.d)).status).toBe(503)
  })

  it('resends with a cooldown and an attempt limit, appending to the history', async () => {
    const { d, logs, setOwner, audits } = deps()
    setOwner({ userId: 'u1', email: 'owner@shop.test', acceptedAt: null })
    const first = await handleProvisionOwner(post({ action: 'resend', businessId: BIZ }), d)
    expect(await first.json()).toEqual({ owner: 'already_linked', email: { status: 'accepted', attempt: 1 } })
    expect(logs[0]).toMatchObject({ kind: 'invitation_resend', attempt: 1 })
    expect(audits.at(-1)).toMatchObject({ eventType: 'invitation_resent' })

    // A log entry from just now triggers the cooldown.
    logs[0]!.createdAt = new Date(NOW.getTime() - (RESEND_COOLDOWN_SECONDS - 5) * 1000).toISOString()
    const cooled = await handleProvisionOwner(post({ action: 'resend', businessId: BIZ }), d)
    expect(cooled.status).toBe(429)
    expect(await cooled.json()).toEqual({ error: 'cooldown' })

    const many = deps({ invitationAttempts: async () => ({ count: MAX_INVITATION_ATTEMPTS, lastAt: '2026-10-19T00:00:00Z' }) })
    many.setOwner({ userId: 'u1', email: 'owner@shop.test', acceptedAt: null })
    expect(await (await handleProvisionOwner(post({ action: 'resend', businessId: BIZ }), many.d)).json()).toEqual({ error: 'too_many_attempts' })
  })

  it('does not resend once the owner has accepted, or when there is no owner', async () => {
    const { d, setOwner } = deps()
    expect(await (await handleProvisionOwner(post({ action: 'resend', businessId: BIZ }), d)).json()).toEqual({ error: 'no_owner' })
    setOwner({ userId: 'u1', email: 'owner@shop.test', acceptedAt: '2026-10-19T00:00:00Z' })
    expect(await (await handleProvisionOwner(post({ action: 'resend', businessId: BIZ }), d)).json()).toEqual({ error: 'already_accepted' })
  })

  it('resends in the requested language (page link and template)', async () => {
    const { d, setOwner, bodies, logs } = deps()
    setOwner({ userId: 'u1', email: 'owner@shop.test', acceptedAt: null })
    await handleProvisionOwner(post({ action: 'resend', businessId: BIZ, language: 'pt' }), d)
    expect(bodies[0]).toContain('https://preview.example.app/accept-invite?lang=pt')
    expect(bodies[0]).toContain(CODE)
    expect(logs[0]!.subject).toMatch(/^Novo código de convite/)
  })

  it('treats provisioning the same owner again as a resend', async () => {
    const { d, setOwner, logs } = deps()
    setOwner({ userId: 'u1', email: 'owner@shop.test', acceptedAt: null })
    const res = await handleProvisionOwner(post(provision()), d)
    expect(await res.json()).toMatchObject({ owner: 'already_linked' })
    expect(logs[0]).toMatchObject({ kind: 'invitation_resend' })
  })
})
