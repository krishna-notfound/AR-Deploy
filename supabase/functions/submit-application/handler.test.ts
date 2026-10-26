// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { NormalizedApplication } from '../_shared/application'
import type { EmailConfig, LogEntry } from '../_shared/email'
import { renderEmail } from '../_shared/email-templates'
import { MAX_SUBMISSIONS_PER_HOUR, type StoredApplication, type SubmitDeps, handleSubmitApplication, submitterHash } from './handler'

const CONFIG: EmailConfig = {
  apiKey: 're_test',
  from: 'Sanctus <onboarding@resend.dev>',
  appBaseUrl: 'https://preview.example.app',
  testRecipients: ['team@account.test', 'ana@studio.test'],
  adminNotificationEmail: 'team@account.test',
}

const VALID = {
  businessName: 'Atelier Cão',
  website: 'atelier.example',
  description: 'Handmade oak furniture for small apartments.',
  category: 'furniture',
  country: 'Portugal',
  city: 'Porto',
  applicantName: 'Ana Silva',
  applicantRole: 'Founder',
  applicantEmail: 'ana@studio.test',
  applicantPhone: '',
  language: 'pt',
  productCount: '11-50',
  photoReadiness: 'some',
  modelReadiness: 'need_help',
  notes: '',
  consent: true,
  submissionKey: '6f1c1b1e-3c55-4a1c-9d47-0a3c1e2b9f10',
}

function deps(over: Partial<SubmitDeps> = {}) {
  const rows: (StoredApplication & { key: string; hash: string; app: NormalizedApplication })[] = []
  const logs: LogEntry[] = []
  const audits: { eventType: string; applicationId: string }[] = []
  const sends: { to: string; subject: string }[] = []
  /** Recorded attempts (service_application_attempt): the first hash of each allowed call. */
  const attempts: string[] = []
  const clock = { at: new Date('2026-10-26T12:00:00Z') }
  const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
    const b = JSON.parse(String(init?.body)) as { to: string[]; subject: string }
    sends.push({ to: b.to[0]!, subject: b.subject })
    return new Response(JSON.stringify({ id: `msg-${sends.length}-abcdef` }), { status: 200 })
  })
  const stored = (r: (typeof rows)[number]): StoredApplication => ({
    id: r.id,
    reference: r.reference,
    applicantEmail: r.applicantEmail,
    businessName: r.businessName,
    language: r.language,
    createdAt: r.createdAt,
  })
  const d: SubmitDeps = {
    config: { ok: true, config: CONFIG },
    fetch: fetchFn as unknown as typeof fetch,
    salt: 'salt',
    now: () => clock.at,
    findByKey: async (k) => {
      const r = rows.find((x) => x.key === k)
      return r ? stored(r) : null
    },
    findOpenDuplicate: async (email, name) => rows.find((r) => r.app.applicantEmail === email && r.app.businessName.toLowerCase() === name.toLowerCase()) ?? null,
    // The R-W2-10 rule: refused at MAX attempts in the hour under any of the hashes; otherwise the first hash is recorded.
    allowAttempt: async (hashes) => {
      if (attempts.filter((h) => hashes.includes(h)).length >= MAX_SUBMISSIONS_PER_HOUR) return false
      attempts.push(hashes[0]!)
      return true
    },
    insert: async (app, hash) => {
      const row = {
        id: `app-${rows.length + 1}`,
        reference: `REF${rows.length + 1}`,
        applicantEmail: app.applicantEmail,
        businessName: app.businessName,
        language: app.language,
        createdAt: clock.at.toISOString(),
        key: app.submissionKey,
        hash,
        app,
      }
      rows.push(row)
      return stored(row)
    },
    audit: async (e) => void audits.push(e),
    hasSubmittedAudit: async (id) => audits.some((a) => a.applicationId === id && a.eventType === 'application_submitted'),
    loggedWorkflows: async (id) => new Set(logs.filter((l) => l.applicationId === id).map((l) => l.workflow ?? '')),
    log: async (e) => (logs.push(e), `log-${logs.length}`),
    staffAlertRecipients: async () => [],
    ...over,
  }
  return { d, rows, logs, audits, sends, fetchFn, attempts, clock }
}

const STORED_9: StoredApplication = { id: 'app-9', reference: 'REF9', applicantEmail: 'ana@studio.test', businessName: 'Atelier Cão', language: 'pt', createdAt: '2026-10-26T11:00:00.000Z' }
const key = (i: number) => `${i}f1c1b1e-3c55-4a1c-9d47-0a3c1e2b9f10`.slice(-36)

const post = (body: unknown, ip = '203.0.113.9') =>
  new Request('https://fn.test/submit-application', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) })

describe('submit-application', () => {
  it('stores a valid application, audits it and sends both emails', async () => {
    const { d, rows, logs, audits, sends } = deps()
    const res = await handleSubmitApplication(post(VALID), d)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'app-1', reference: 'REF1' })
    expect(rows[0]!.app).toMatchObject({ businessName: 'Atelier Cão', website: 'https://atelier.example', language: 'pt' })
    expect(audits).toEqual([{ eventType: 'application_submitted', applicationId: 'app-1', toStatus: 'submitted' }])
    expect(sends.map((s) => s.to)).toEqual(['ana@studio.test', 'team@account.test'])
    expect(logs.map((l) => [l.kind, l.status, l.applicationId, l.workflow])).toEqual([
      ['application_confirmation', 'accepted', 'app-1', 'application:app-1:application_confirmation'],
      ['admin_notification', 'accepted', 'app-1', 'application:app-1:admin_notification'],
    ])
  })

  it('stores the raw IP nowhere: only a salted hash of the UTC day', async () => {
    const { d, rows } = deps()
    await handleSubmitApplication(post(VALID), d)
    // R-W2-10: the stored hash is today's (UTC) hash.
    expect(rows[0]!.hash).toBe(await submitterHash('203.0.113.9', 'salt', '2026-10-26'))
    expect(rows[0]!.hash).not.toContain('203.0.113.9')
  })

  it('returns field codes for invalid answers and stores nothing', async () => {
    const { d, rows, sends } = deps()
    const res = await handleSubmitApplication(post({ ...VALID, applicantEmail: 'nope', description: 'short', consent: false }), d)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_application', fields: { applicantEmail: 'invalid_email', description: 'too_short', consent: 'consent_required' } })
    expect(rows).toHaveLength(0)
    expect(sends).toHaveLength(0)
  })

  it('refuses honeypot submissions, non-JSON and other methods', async () => {
    const { d, rows } = deps()
    expect((await handleSubmitApplication(post({ ...VALID, hp: 'http://spam' }), d)).status).toBe(400)
    expect((await handleSubmitApplication(new Request('https://fn.test', { method: 'POST', body: 'not json' }), d)).status).toBe(400)
    expect((await handleSubmitApplication(new Request('https://fn.test', { method: 'GET' }), d)).status).toBe(405)
    expect((await handleSubmitApplication(new Request('https://fn.test', { method: 'OPTIONS' }), d)).status).toBe(204)
    expect(rows).toHaveLength(0)
  })

  it('is idempotent per submission key: a retry returns the same row and sends no new email', async () => {
    const { d, rows, sends } = deps()
    await handleSubmitApplication(post(VALID), d)
    const again = await handleSubmitApplication(post(VALID), d)
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ id: 'app-1', reference: 'REF1' })
    expect(rows).toHaveLength(1)
    expect(sends).toHaveLength(2)
  })

  it('handles a concurrent duplicate insert by returning the stored row', async () => {
    let calls = 0
    const { d } = deps({ findByKey: async () => (calls++ ? STORED_9 : null), insert: async () => 'duplicate_key' })
    const res = await handleSubmitApplication(post(VALID), d)
    expect(await res.json()).toEqual({ id: 'app-9', reference: 'REF9' })
  })

  it('refuses a second open application for the same business and email', async () => {
    const { d } = deps()
    await handleSubmitApplication(post(VALID), d)
    const res = await handleSubmitApplication(post({ ...VALID, businessName: 'atelier cão', submissionKey: '7f1c1b1e-3c55-4a1c-9d47-0a3c1e2b9f10' }), d)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'duplicate_application' })
  })

  it(`rate-limits after ${MAX_SUBMISSIONS_PER_HOUR} submissions per hour from one connection`, async () => {
    const { d } = deps()
    for (let i = 0; i < MAX_SUBMISSIONS_PER_HOUR; i++) {
      const r = await handleSubmitApplication(post({ ...VALID, businessName: `Studio ${i}`, submissionKey: key(i) }), d)
      expect(r.status).toBe(200)
    }
    const blocked = await handleSubmitApplication(post({ ...VALID, businessName: 'One more', submissionKey: key(8) }), d)
    expect(blocked.status).toBe(429)
    const other = await handleSubmitApplication(post({ ...VALID, businessName: 'Elsewhere', submissionKey: key(9) }, '198.51.100.1'), d)
    expect(other.status).toBe(200)
  })

  it('keeps the application when email is not configured and logs the emails as blocked', async () => {
    const { d, rows, logs, fetchFn } = deps({ config: { ok: false, missing: ['RESEND_API_KEY'] } })
    const res = await handleSubmitApplication(post(VALID), d)
    expect(res.status).toBe(200)
    expect(rows).toHaveLength(1)
    expect(fetchFn).not.toHaveBeenCalled()
    expect(logs.map((l) => [l.status, l.error])).toEqual([
      ['blocked', 'email_not_configured'],
      ['blocked', 'email_not_configured'],
    ])
  })

  it('keeps the application when the provider fails or logging throws', async () => {
    const failing = vi.fn(async () => new Response(JSON.stringify({ message: 'boom' }), { status: 500 }))
    const a = deps({ fetch: failing as unknown as typeof fetch })
    expect((await handleSubmitApplication(post(VALID), a.d)).status).toBe(200)
    expect(a.logs.map((l) => l.status)).toEqual(['failed', 'failed'])

    const b = deps({ log: async () => Promise.reject(new Error('db down')) })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await handleSubmitApplication(post(VALID), b.d)).status).toBe(200)
    spy.mockRestore()
  })

  it('blocks recipients the test sender cannot reach, without calling the provider', async () => {
    const { d, logs, sends } = deps({ config: { ok: true, config: { ...CONFIG, testRecipients: ['team@account.test'] } } })
    await handleSubmitApplication(post(VALID), d)
    expect(logs[0]).toMatchObject({ kind: 'application_confirmation', status: 'blocked', error: 'test_sender_recipient_not_allowed' })
    expect(sends.map((s) => s.to)).toEqual(['team@account.test'])
  })

  it('emails opted-in staff with applications.view once each, without duplicating the admin inbox', async () => {
    const recipients = vi.fn(async () => ['Team@Account.test', 'ana.staff@account.test', 'ana.staff@account.test', 'bo@account.test'])
    const { d, logs, sends } = deps({
      staffAlertRecipients: recipients,
      config: { ok: true, config: { ...CONFIG, testRecipients: [...CONFIG.testRecipients, 'ana.staff@account.test', 'bo@account.test'] } },
    })
    expect((await handleSubmitApplication(post(VALID), d)).status).toBe(200)
    expect(recipients).toHaveBeenCalledTimes(1)
    expect(sends.map((s) => s.to)).toEqual(['ana@studio.test', 'team@account.test', 'ana.staff@account.test', 'bo@account.test'])
    expect(logs.filter((l) => l.kind === 'admin_notification').map((l) => l.status)).toEqual(['accepted', 'accepted', 'accepted'])
    expect(new Set(logs.map((l) => l.workflow)).size).toBe(4)
  })

  it('keeps the application when the staff lookup fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { d, sends } = deps({ staffAlertRecipients: async () => Promise.reject(new Error('db down')) })
    expect((await handleSubmitApplication(post(VALID), d)).status).toBe(200)
    expect(sends.map((s) => s.to)).toEqual(['ana@studio.test', 'team@account.test'])
    spy.mockRestore()
  })

  it('fails closed without a salt', async () => {
    const { d } = deps({ salt: '' })
    expect((await handleSubmitApplication(post(VALID), d)).status).toBe(500)
  })
})

describe('submit-application: rate limit first, daily hash (R-W2-10)', () => {
  it('five attempts answered 409 duplicate_application, then a sixth → 429 rate_limited, and findOpenDuplicate is not called for the sixth', async () => {
    const { d, rows } = deps()
    const app = { applicantEmail: 'ana@studio.test', businessName: 'Atelier Cão' } as NormalizedApplication
    rows.push({ ...STORED_9, id: 'app-0', reference: 'REF0', key: 'seeded', hash: 'seeded', app })
    const findOpenDuplicate = vi.fn(d.findOpenDuplicate)
    d.findOpenDuplicate = findOpenDuplicate
    for (let i = 0; i < 5; i++) {
      const r = await handleSubmitApplication(post({ ...VALID, submissionKey: key(i) }), d)
      expect(r.status).toBe(409)
      expect(await r.json()).toEqual({ error: 'duplicate_application' })
    }
    expect(findOpenDuplicate).toHaveBeenCalledTimes(5)
    const sixth = await handleSubmitApplication(post({ ...VALID, submissionKey: key(6) }), d)
    expect(sixth.status).toBe(429)
    expect(await sixth.json()).toEqual({ error: 'rate_limited' })
    expect(findOpenDuplicate).toHaveBeenCalledTimes(5)
  })

  it('the same IP hashes differently on 2026-10-26 and 2026-10-27', async () => {
    const a = await submitterHash('203.0.113.9', 'salt', '2026-10-26')
    const b = await submitterHash('203.0.113.9', 'salt', '2026-10-27')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(b).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })

  it("at 00:20 UTC allowAttempt receives today's and yesterday's hash; at 12:00 only today's", async () => {
    const { d, clock } = deps()
    const allowAttempt = vi.fn(async (_hashes: string[]) => true)
    d.allowAttempt = allowAttempt
    clock.at = new Date('2026-10-27T00:20:00Z')
    await handleSubmitApplication(post({ ...VALID, submissionKey: key(1) }), d)
    expect(allowAttempt).toHaveBeenLastCalledWith([await submitterHash('203.0.113.9', 'salt', '2026-10-27'), await submitterHash('203.0.113.9', 'salt', '2026-10-26')])
    clock.at = new Date('2026-10-27T12:00:00Z')
    await handleSubmitApplication(post({ ...VALID, businessName: 'Noon Studio', submissionKey: key(2) }), d)
    expect(allowAttempt).toHaveBeenLastCalledWith([await submitterHash('203.0.113.9', 'salt', '2026-10-27')])
  })

  it('five attempts at 23:40–23:56 UTC, then one at 00:20 UTC → 429', async () => {
    const { d, clock } = deps()
    for (let i = 0; i < 5; i++) {
      clock.at = new Date(Date.UTC(2026, 9, 26, 23, 40 + i * 4))
      expect((await handleSubmitApplication(post({ ...VALID, businessName: `Late ${i}`, submissionKey: key(i) }), d)).status).toBe(200)
    }
    clock.at = new Date('2026-10-27T00:20:00Z')
    expect((await handleSubmitApplication(post({ ...VALID, businessName: 'After midnight', submissionKey: key(7) }), d)).status).toBe(429)
  })

  it('a key replay after five attempts → 200 with the stored row, and allowAttempt is not called', async () => {
    const { d } = deps()
    const allowAttempt = vi.fn(d.allowAttempt)
    d.allowAttempt = allowAttempt
    expect((await handleSubmitApplication(post(VALID), d)).status).toBe(200)
    for (let i = 1; i < 5; i++) expect((await handleSubmitApplication(post({ ...VALID, submissionKey: key(i) }), d)).status).toBe(409)
    expect(allowAttempt).toHaveBeenCalledTimes(5)
    const replay = await handleSubmitApplication(post(VALID), d)
    expect(replay.status).toBe(200)
    expect(await replay.json()).toEqual({ id: 'app-1', reference: 'REF1' })
    expect(allowAttempt).toHaveBeenCalledTimes(5)
  })
})

describe('submit-application: nothing lost after the insert (R-W2-11)', () => {
  const FIVE_MIN = 5 * 60_000
  /** VALID stored as app-1 with no audit or email rows, as if the first request died right after the insert. */
  function storedWithoutFollowUp() {
    const t = deps()
    const app = { applicantEmail: 'ana@studio.test', businessName: 'Atelier Cão' } as NormalizedApplication
    t.rows.push({ ...STORED_9, id: 'app-1', reference: 'REF1', createdAt: t.clock.at.toISOString(), key: VALID.submissionKey, hash: 'h', app })
    return t
  }

  it('audit throws → 200, the confirmation and the admin alert are both sent, and console.error has no email address', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { d, sends } = deps({ audit: async () => Promise.reject(new Error('audit insert failed: ana@studio.test')) })
    const res = await handleSubmitApplication(post(VALID), d)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'app-1', reference: 'REF1' })
    expect(sends.map((s) => s.to)).toEqual(['ana@studio.test', 'team@account.test'])
    expect(spy).toHaveBeenCalled()
    for (const args of spy.mock.calls) expect(args.map(String).join(' ')).not.toMatch(/@|203\.0\.113\.9/)
    spy.mockRestore()
  })

  it('a replay 5 minutes after the insert with no email_log rows sends the confirmation (stored language) and the admin alert once each, and writes the missing application_submitted', async () => {
    const { d, sends, audits, clock } = storedWithoutFollowUp()
    clock.at = new Date(clock.at.getTime() + FIVE_MIN)
    const res = await handleSubmitApplication(post({ ...VALID, language: 'en' }), d)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'app-1', reference: 'REF1' })
    expect(sends).toEqual([
      { to: 'ana@studio.test', subject: renderEmail('application_confirmation', 'pt', { businessName: 'Atelier Cão' }).subject },
      { to: 'team@account.test', subject: renderEmail('admin_notification', 'en', { businessName: 'Atelier Cão' }).subject },
    ])
    expect(audits).toEqual([{ eventType: 'application_submitted', applicationId: 'app-1', toStatus: 'submitted' }])
    // Another replay finds both workflows logged and the audit row written: nothing more.
    expect((await handleSubmitApplication(post(VALID), d)).status).toBe(200)
    expect(sends).toHaveLength(2)
    expect(audits).toHaveLength(1)
  })

  it('a replay with the confirmation logged sends only the admin alert', async () => {
    const { d, sends, logs, clock } = storedWithoutFollowUp()
    // A failed row counts as present: a replay never retries a failed send.
    logs.push({ kind: 'application_confirmation', recipient: 'ana@studio.test', subject: 'S', status: 'failed', applicationId: 'app-1', workflow: 'application:app-1:application_confirmation' })
    clock.at = new Date(clock.at.getTime() + FIVE_MIN)
    expect((await handleSubmitApplication(post(VALID), d)).status).toBe(200)
    expect(sends.map((s) => s.to)).toEqual(['team@account.test'])
  })

  it('a replay 10 seconds after the insert sends nothing', async () => {
    const { d, sends, audits, clock } = storedWithoutFollowUp()
    clock.at = new Date(clock.at.getTime() + 10_000)
    const res = await handleSubmitApplication(post(VALID), d)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'app-1', reference: 'REF1' })
    expect(sends).toHaveLength(0)
    expect(audits).toHaveLength(0)
  })

  it('a replay whose body has another email sends to the stored address', async () => {
    const { d, sends, clock } = storedWithoutFollowUp()
    clock.at = new Date(clock.at.getTime() + FIVE_MIN)
    expect((await handleSubmitApplication(post({ ...VALID, applicantEmail: 'someone.else@studio.test', businessName: 'Other Co' }), d)).status).toBe(200)
    expect(sends.map((s) => s.to)).toEqual(['ana@studio.test', 'team@account.test'])
    expect(sends.some((s) => s.subject.includes('Other Co'))).toBe(false)
  })

  it('the duplicate_key path sends nothing', async () => {
    let calls = 0
    const { d, sends, audits, logs } = deps({ findByKey: async () => (calls++ ? STORED_9 : null), insert: async () => 'duplicate_key' })
    const res = await handleSubmitApplication(post(VALID), d)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'app-9', reference: 'REF9' })
    expect(sends).toHaveLength(0)
    expect(audits).toHaveLength(0)
    expect(logs).toHaveLength(0)
  })
})
