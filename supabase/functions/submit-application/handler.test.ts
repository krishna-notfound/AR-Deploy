// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { NormalizedApplication } from '../_shared/application'
import type { EmailConfig, LogEntry } from '../_shared/email'
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
  const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
    const b = JSON.parse(String(init?.body)) as { to: string[]; subject: string }
    sends.push({ to: b.to[0]!, subject: b.subject })
    return new Response(JSON.stringify({ id: `msg-${sends.length}-abcdef` }), { status: 200 })
  })
  const d: SubmitDeps = {
    config: { ok: true, config: CONFIG },
    fetch: fetchFn as unknown as typeof fetch,
    salt: 'salt',
    findByKey: async (k) => rows.find((r) => r.key === k) ?? null,
    findOpenDuplicate: async (email, name) => rows.find((r) => r.app.applicantEmail === email && r.app.businessName.toLowerCase() === name.toLowerCase()) ?? null,
    countRecent: async (h) => rows.filter((r) => r.hash === h).length,
    insert: async (app, hash) => {
      const row = { id: `app-${rows.length + 1}`, reference: `REF${rows.length + 1}`, key: app.submissionKey, hash, app }
      rows.push(row)
      return { id: row.id, reference: row.reference }
    },
    audit: async (e) => void audits.push(e),
    log: async (e) => (logs.push(e), `log-${logs.length}`),
    staffAlertRecipients: async () => [],
    ...over,
  }
  return { d, rows, logs, audits, sends, fetchFn }
}

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

  it('stores the raw IP nowhere: only a salted hash', async () => {
    const { d, rows } = deps()
    await handleSubmitApplication(post(VALID), d)
    expect(rows[0]!.hash).toBe(await submitterHash('203.0.113.9', 'salt'))
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
    const stored = { id: 'app-9', reference: 'REF9' }
    let calls = 0
    const { d } = deps({ findByKey: async () => (calls++ ? stored : null), insert: async () => 'duplicate_key' })
    const res = await handleSubmitApplication(post(VALID), d)
    expect(await res.json()).toEqual(stored)
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
    const key = (i: number) => `${i}f1c1b1e-3c55-4a1c-9d47-0a3c1e2b9f10`.slice(-36)
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
