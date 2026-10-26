// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { EmailConfig, LogEntry } from '../_shared/email'
import { type ProvisionDeps, handleProvisionOwner } from './handler'

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
  /** Reservations granted (R-W2-4), each with the outcome it was finished with. */
  const reservations: { businessId: string; recipient: string; actorId: string; attempt: number; outcome?: string }[] = []
  const deleted: string[] = []
  const fetchFn = vi.fn(async (_u: string, init?: RequestInit) => {
    bodies.push(String(init?.body))
    return new Response(JSON.stringify({ id: `msg-${bodies.length}-abcdef` }), { status: 200 })
  })
  const d: ProvisionDeps = {
    config: { ok: true, config: CONFIG },
    fetch: fetchFn as unknown as typeof fetch,
    userIdFromToken: async (t) => ({ 'admin-token': 'admin-id', 'admin-aal1-token': 'admin-id', 'team-token': 'team-id', 'owner-token': 'owner-id' })[t] ?? null,
    // The 2FA gate (R-W1-1): an aal2 admin with owners.manage passes; aal1 needs the second step; others lack the permission.
    gate: async (t) => (t === 'admin-token' ? 'ok' : t === 'admin-aal1-token' ? 'aal2_required' : 'forbidden'),
    isTeamEmail: async (e) => e === 'team@platform.test' || e === 'rita@x.pt',
    isPlatformStaff: async (id) => id === 'admin-id' || id === 'team-id',
    getBusiness: async (id) => (id === BIZ ? { id, name: 'Casa Lisboa' } : null),
    getOwner: async () => owner,
    accountByEmail: async (e) =>
      e === 'admin@platform.test' ? { id: 'admin-id', invited: false, ownsBusiness: false } : e === 'team@platform.test' ? { id: 'team-id', invited: true, ownsBusiness: false } : null,
    generateCode: async (type, email) => (links.push({ type, email }), { ok: true, code: CODE, userId: 'new-user' }),
    linkOwner: async (_b, userId) => {
      if (owner && owner.userId !== userId) return 'business_has_owner'
      if (owner) return 'already_linked'
      owner = { userId, email: links.at(-1)!.email, acceptedAt: null }
      return 'linked'
    },
    reserveInvite: async (businessId, recipient, actorId) => {
      reservations.push({ businessId, recipient, actorId, attempt: reservations.length + 1 })
      return { reservationId: `res-${reservations.length}`, attempt: reservations.length }
    },
    finishInvite: async (id, outcome) => void (reservations[Number(id.slice(4)) - 1]!.outcome = outcome),
    deleteAuthUser: async (id) => void deleted.push(id),
    audit: async (e) => void audits.push(e),
    log: async (e) => (logs.unshift({ ...e, createdAt: new Date(NOW.getTime() - 120_000).toISOString() }), `log-${logs.length}`),
    ...over,
  }
  return { d, logs, audits, links, bodies, fetchFn, reservations, deleted, setOwner: (o: typeof owner) => (owner = o) }
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

  it('aal1 caller under the staff policy gets 403 aal2_required; no linkOwner, generateCode or email', async () => {
    const linkOwner = vi.fn<ProvisionDeps['linkOwner']>()
    const { d, links, logs, fetchFn, audits } = deps({ linkOwner })
    for (const body of [provision(), { action: 'resend', businessId: BIZ }]) {
      const res = await handleProvisionOwner(post(body, 'admin-aal1-token'), d)
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'aal2_required' })
    }
    expect(linkOwner).not.toHaveBeenCalled()
    expect(links).toHaveLength(0)
    expect(logs).toHaveLength(0)
    expect(audits).toHaveLength(0)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('aal2 without owners.manage gets 403 forbidden', async () => {
    const { d, links, fetchFn } = deps()
    const res = await handleProvisionOwner(post(provision(), 'team-token'), d)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
    expect(links).toHaveLength(0)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('an email with a pending platform_members row gets 409 email_is_admin before generateCode is called', async () => {
    // Rita was invited to the team (no login yet, so no account to find): the email alone is enough to refuse (R-W1-8).
    const accountByEmail = vi.fn<ProvisionDeps['accountByEmail']>(async () => null)
    const { d, links, fetchFn } = deps({ accountByEmail })
    const res = await handleProvisionOwner(post(provision({ email: 'Rita@X.pt' })), d)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'email_is_admin' })
    expect(accountByEmail).not.toHaveBeenCalled()
    expect(links).toHaveLength(0)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('a link refused by the database for a team email (a race) is 409 email_is_admin; the login this request created is deleted', async () => {
    const { d, deleted, reservations, fetchFn } = deps({ linkOwner: async () => 'email_is_admin' })
    const res = await handleProvisionOwner(post(provision()), d)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'email_is_admin' })
    expect(deleted).toEqual(['new-user'])
    expect(reservations.map((r) => r.outcome)).toEqual(['blocked'])
    expect(fetchFn).not.toHaveBeenCalled()
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

  it("the 11th attempt → 429 {error:'too_many_invitations', retryAt}; no generateCode", async () => {
    const retryAt = '2026-10-21T09:00:00.000+00:00'
    const { d, links, fetchFn, logs } = deps({ reserveInvite: async () => ({ error: 'too_many_invitations', retryAt }) })
    const res = await handleProvisionOwner(post(provision()), d)
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'too_many_invitations', retryAt })
    expect(links).toHaveLength(0)
    expect(fetchFn).not.toHaveBeenCalled()
    expect(logs).toHaveLength(0)
  })

  it("cooldown → 429 {error:'cooldown', retryAt}; no generateCode", async () => {
    const retryAt = '2026-10-20T10:00:30.000+00:00'
    const { d, links, fetchFn, setOwner } = deps({ reserveInvite: async () => ({ error: 'cooldown', retryAt }) })
    const res = await handleProvisionOwner(post(provision()), d)
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'cooldown', retryAt })
    setOwner({ userId: 'u1', email: 'owner@shop.test', acceptedAt: null })
    const resend = await handleProvisionOwner(post({ action: 'resend', businessId: BIZ }), d)
    expect(resend.status).toBe(429)
    expect(await resend.json()).toEqual({ error: 'cooldown', retryAt })
    expect(links).toHaveLength(0)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('provision reserves before generateCode and finishes with the email status; the Idempotency-Key is invite:<business>:<reserved attempt>', async () => {
    const { d, reservations, fetchFn, logs } = deps()
    const order: string[] = []
    const { reserveInvite, generateCode, finishInvite } = d
    // The database numbers the attempt (here 7: earlier invitations were logged before the reservations table).
    d.reserveInvite = async (...a) => (order.push('reserve'), { ...((await reserveInvite(...a)) as { reservationId: string }), attempt: 7 })
    d.generateCode = async (...a) => (order.push('code'), generateCode(...a))
    d.finishInvite = async (id, outcome) => (order.push(`finish:${outcome}`), finishInvite(id, outcome))
    const res = await handleProvisionOwner(post(provision()), d)
    expect(await res.json()).toEqual({ owner: 'linked', email: { status: 'accepted', attempt: 7 } })
    expect(order).toEqual(['reserve', 'code', 'finish:accepted'])
    expect(reservations).toEqual([{ businessId: BIZ, recipient: 'owner@shop.test', actorId: 'admin-id', attempt: 1, outcome: 'accepted' }])
    expect(new Headers((fetchFn.mock.calls[0]![1] as RequestInit).headers).get('Idempotency-Key')).toBe(`invite:${BIZ}:7`)
    expect(logs[0]).toMatchObject({ attempt: 7, workflow: `invite:${BIZ}` })

    // An email that could not be sent finishes the reservation as blocked.
    const blocked = deps({ config: { ok: false, missing: ['RESEND_API_KEY'] } })
    await handleProvisionOwner(post(provision(), 'admin-token', 'https://sanctus-preview.vercel.app'), blocked.d)
    expect(blocked.reservations.map((r) => r.outcome)).toEqual(['blocked'])
  })

  it('a failed code finishes the reservation as blocked', async () => {
    const { d, reservations, deleted } = deps({ generateCode: async () => ({ ok: false, error: 'rate limited' }) })
    expect((await handleProvisionOwner(post(provision()), d)).status).toBe(502)
    expect(reservations.map((r) => r.outcome)).toEqual(['blocked'])
    expect(deleted).toEqual([])
  })

  it('a link refused with business_has_owner after this request created the account → 409, finishInvite blocked and deleteAuthUser(userId) called; for an account that existed before, deleteAuthUser is not called', async () => {
    // A parallel provision with another email linked first (the reservation was granted: R-W2-7 with R-W2-4).
    const created = deps({ linkOwner: async () => 'business_has_owner' })
    const res = await handleProvisionOwner(post(provision()), created.d)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'business_has_owner' })
    expect(created.reservations.map((r) => r.outcome)).toEqual(['blocked'])
    expect(created.deleted).toEqual(['new-user'])
    expect(created.fetchFn).not.toHaveBeenCalled()

    const existed = deps({
      linkOwner: async () => 'business_has_owner',
      accountByEmail: async () => ({ id: 'existing', invited: true, ownsBusiness: false }),
      generateCode: async () => ({ ok: true, code: CODE, userId: 'existing' }),
    })
    expect((await handleProvisionOwner(post(provision()), existed.d)).status).toBe(409)
    expect(existed.reservations.map((r) => r.outcome)).toEqual(['blocked'])
    expect(existed.deleted).toEqual([])

    // A failing finishInvite still deletes the login this request created.
    const finishFails = deps({ linkOwner: async () => 'business_has_owner', finishInvite: async () => Promise.reject(new Error('reservation update failed: 08006')) })
    await expect(handleProvisionOwner(post(provision()), finishFails.d)).rejects.toThrow('reservation update failed')
    expect(finishFails.deleted).toEqual(['new-user'])

    // A link that fails outright cleans up the same way, then reports the error.
    const thrown = deps({ linkOwner: async () => Promise.reject(new Error('link failed: timeout')) })
    await expect(handleProvisionOwner(post(provision()), thrown.d)).rejects.toThrow('link failed')
    expect(thrown.deleted).toEqual(['new-user'])
    expect(thrown.reservations.map((r) => r.outcome)).toEqual(['blocked'])
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
    // A Team member without owners.manage is still platform staff: refused the same way (ADR-0029 separation).
    const team = await handleProvisionOwner(post(provision({ email: 'team@platform.test' })), d)
    expect(team.status).toBe(409)
    expect(await team.json()).toEqual({ error: 'email_is_admin' })
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

  // R-W2-4: the cooldown and the limit are the database reservation's, per recipient over a rolling 24 h.
  it('resends through a reservation (cooldown and the rolling limit come from the database), appending to the history', async () => {
    const { d, logs, setOwner, audits, reservations } = deps()
    setOwner({ userId: 'u1', email: 'owner@shop.test', acceptedAt: null })
    const first = await handleProvisionOwner(post({ action: 'resend', businessId: BIZ }), d)
    expect(await first.json()).toEqual({ owner: 'already_linked', email: { status: 'accepted', attempt: 1 } })
    expect(logs[0]).toMatchObject({ kind: 'invitation_resend', attempt: 1 })
    expect(audits.at(-1)).toMatchObject({ eventType: 'invitation_resent' })
    expect(reservations).toEqual([{ businessId: BIZ, recipient: 'owner@shop.test', actorId: 'admin-id', attempt: 1, outcome: 'accepted' }])

    const retryAt = '2026-10-21T08:00:00.000+00:00'
    const many = deps({ reserveInvite: async () => ({ error: 'too_many_invitations', retryAt }) })
    many.setOwner({ userId: 'u1', email: 'owner@shop.test', acceptedAt: null })
    const refused = await handleProvisionOwner(post({ action: 'resend', businessId: BIZ }), many.d)
    expect(refused.status).toBe(429)
    expect(await refused.json()).toEqual({ error: 'too_many_invitations', retryAt })
    expect(many.links).toHaveLength(0)

    // A failed code on a resend finishes the reservation as blocked.
    const noCode = deps({ generateCode: async () => ({ ok: false, error: 'rate limited' }) })
    noCode.setOwner({ userId: 'u1', email: 'owner@shop.test', acceptedAt: null })
    expect((await handleProvisionOwner(post({ action: 'resend', businessId: BIZ }), noCode.d)).status).toBe(502)
    expect(noCode.reservations.map((r) => r.outcome)).toEqual(['blocked'])
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
