// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { type EmailConfig, type LogEntry, readEmailConfig, recipientAllowed, sendAndLog, statusFromProviderEvent } from '../_shared/email'
import { renderEmail } from '../_shared/email-templates'
import { type TestEmailDeps, handleTestEmail } from './handler'

const CONFIG: EmailConfig = {
  apiKey: 're_test',
  from: 'Sanctus <onboarding@resend.dev>',
  appBaseUrl: 'https://preview.example.app',
  testRecipients: ['owner@account.test'],
  adminNotificationEmail: 'owner@account.test',
}

const resendOk = (id = 'abc12345-msg') => vi.fn(async () => new Response(JSON.stringify({ id }), { status: 200 }))
const resend403 = () => vi.fn(async () => new Response(JSON.stringify({ name: 'validation_error', message: 'You can only send testing emails to your own email address' }), { status: 403 }))

function deps(over: Partial<TestEmailDeps> = {}) {
  const logs: LogEntry[] = []
  const updates: [string, string][] = []
  const d: TestEmailDeps = {
    config: { ok: true, config: CONFIG },
    fetch: resendOk() as unknown as typeof fetch,
    userIdFromToken: async (t) => (t === 'admin-token' ? 'admin-id' : t === 'owner-token' ? 'owner-id' : null),
    isPlatformAdmin: async (id) => id === 'admin-id',
    log: async (e) => (logs.push(e), `log-${logs.length}`),
    updateStatus: async (id, s) => void updates.push([id, s]),
    ...over,
  }
  return { d, logs, updates }
}

const post = (body: unknown, token = 'admin-token') =>
  new Request('https://fn.test/send-test-email', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('email config', () => {
  it('reports missing secret names, never values', () => {
    const r = readEmailConfig((n) => ({ RESEND_API_KEY: 're_x' })[n])
    expect(r).toEqual({ ok: false, missing: ['EMAIL_FROM', 'APP_BASE_URL'] })
  })
})

describe('recipient guard for the Resend test sender', () => {
  it('allows the account address and the simulation addresses only', () => {
    expect(recipientAllowed(CONFIG, 'OWNER@account.test').ok).toBe(true)
    expect(recipientAllowed(CONFIG, 'delivered+run1@resend.dev').ok).toBe(true)
    expect(recipientAllowed(CONFIG, 'someone@else.test')).toEqual({ ok: false, reason: 'test_sender_recipient_not_allowed' })
    expect(recipientAllowed(CONFIG, 'not-an-email')).toEqual({ ok: false, reason: 'invalid_recipient' })
  })
  it('allows any valid recipient once a real domain is the sender', () => {
    expect(recipientAllowed({ ...CONFIG, from: 'Sanctus <no-reply@mail.client.test>' }, 'someone@else.test').ok).toBe(true)
  })
})

describe('sendAndLog', () => {
  it('logs "accepted" with the provider id, never "delivered"', async () => {
    const logs: LogEntry[] = []
    const r = await sendAndLog({ config: CONFIG, fetch: resendOk('msg-1') as unknown as typeof fetch, log: async (e) => (logs.push(e), 'l1') }, { to: 'delivered@resend.dev', subject: 's', html: 'h', text: 't', kind: 'test' })
    expect(r).toEqual({ logId: 'l1', status: 'accepted', providerMessageId: 'msg-1' })
    expect(logs[0]!.status).toBe('accepted')
  })
  it('logs provider errors as "failed" and does not call Resend for blocked recipients', async () => {
    const fail = await sendAndLog({ config: { ...CONFIG, testRecipients: ['x@y.test'] }, fetch: resend403() as unknown as typeof fetch, log: async () => 'l2' }, { to: 'x@y.test', subject: 's', html: 'h', text: 't', kind: 'test' })
    expect(fail.status).toBe('failed')
    expect(fail.error).toMatch(/own email address/)
    const f = resendOk()
    const blocked = await sendAndLog({ config: CONFIG, fetch: f as unknown as typeof fetch, log: async () => 'l3' }, { to: 'someone@else.test', subject: 's', html: 'h', text: 't', kind: 'test' })
    expect(blocked.status).toBe('blocked')
    expect(f).not.toHaveBeenCalled()
  })
  it('treats a network failure as "failed" instead of throwing', async () => {
    const r = await sendAndLog({ config: CONFIG, fetch: (async () => { throw new Error('offline') }) as unknown as typeof fetch, log: async () => 'l4' }, { to: 'delivered@resend.dev', subject: 's', html: 'h', text: 't', kind: 'test' })
    expect(r.status).toBe('failed')
  })
  it('maps only explicit provider events to delivery outcomes', () => {
    expect(statusFromProviderEvent('delivered')).toBe('delivered')
    expect(statusFromProviderEvent('bounced')).toBe('bounced')
    expect(statusFromProviderEvent('sent')).toBe('sent')
    expect(statusFromProviderEvent('queued')).toBe('accepted')
    expect(statusFromProviderEvent(undefined)).toBe('accepted')
  })
})

describe('templates', () => {
  it('escapes inserted values and requires https links', () => {
    const e = renderEmail('owner_invitation', 'pt', { businessName: '<b>Casa</b>', actionUrl: 'https://x.test/a?b=1&c=2' })
    expect(e.html).not.toContain('<b>Casa</b>')
    expect(e.html).toContain('&lt;b&gt;Casa&lt;/b&gt;')
    expect(e.html).toContain('https://x.test/a?b=1&amp;c=2')
    expect(e.text).toContain('https://x.test/a?b=1&c=2')
    expect(() => renderEmail('owner_invitation', 'en', { actionUrl: 'javascript:alert(1)' })).toThrow()
  })
  it('has every kind in both languages', () => {
    for (const kind of ['owner_invitation', 'invitation_resend', 'application_confirmation', 'admin_notification', 'test'] as const)
      for (const lang of ['en', 'pt'] as const) expect(renderEmail(kind, lang, { businessName: 'B', actionUrl: 'https://x.test' }).subject.length).toBeGreaterThan(3)
  })
  it('puts no applicant-supplied text into the confirmation sent to the typed-in address', () => {
    for (const lang of ['en', 'pt'] as const) {
      const e = renderEmail('application_confirmation', lang, { businessName: 'Win a prize at evil.example' })
      expect(`${e.subject}${e.html}${e.text}`).not.toContain('evil.example')
    }
  })
})

describe('send-test-email handler', () => {
  it('rejects anonymous callers and non-admins', async () => {
    const { d } = deps()
    expect((await handleTestEmail(post({ action: 'send', to: 'delivered@resend.dev' }, 'bad'), d)).status).toBe(401)
    expect((await handleTestEmail(post({ action: 'send', to: 'delivered@resend.dev' }, 'owner-token'), d)).status).toBe(403)
  })
  it('says which secrets are missing, without values', async () => {
    const { d } = deps({ config: { ok: false, missing: ['RESEND_API_KEY'] } })
    const res = await handleTestEmail(post({ action: 'send', to: 'delivered@resend.dev' }), d)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'email_not_configured', missing: ['RESEND_API_KEY'] })
  })
  it('sends the test email, logs it as accepted, then records provider evidence', async () => {
    const { d, logs, updates } = deps()
    const sent = await (await handleTestEmail(post({ action: 'send', to: 'delivered@resend.dev', lang: 'pt' }), d)).json()
    expect(sent.status).toBe('accepted')
    expect(logs[0]).toMatchObject({ kind: 'test', triggeredBy: 'admin-id', subject: 'E-mail de teste Sanctus' })
    d.fetch = vi.fn(async () => new Response(JSON.stringify({ last_event: 'delivered' }), { status: 200 })) as unknown as typeof fetch
    const status = await (await handleTestEmail(post({ action: 'status', providerMessageId: sent.providerMessageId }), d)).json()
    expect(status).toEqual({ providerMessageId: 'abc12345-msg', lastEvent: 'delivered', status: 'delivered' })
    expect(updates).toEqual([['abc12345-msg', 'delivered']])
  })
})
