// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { EmailConfig, LogEntry } from '../_shared/email'
import { type NotifyDeps, handleNotifyBusinessOwner } from './handler'

const BIZ = '11111111-1111-4111-8111-111111111111'
const PT_BIZ = '22222222-2222-4222-8222-222222222222'
const OWNER_ID = '33333333-3333-4333-8333-333333333333'
const PT_OWNER_ID = '44444444-4444-4444-8444-444444444444'
const NOW = new Date('2026-10-26T12:00:00Z')
const CONFIG: EmailConfig = {
  apiKey: 're_test',
  from: 'Sanctus <hello@sanctus.example>',
  appBaseUrl: 'https://preview.example.app',
  testRecipients: [],
  adminNotificationEmail: 'team@account.test',
  unsubscribeSecret: 'unsub-secret',
}

type Row = { id: string; eventType: string; metadata: Record<string, unknown> }

function deps(rows: Row[], over: Partial<NotifyDeps> = {}) {
  const logs: LogEntry[] = []
  const sent: { to: string[]; subject: string; html: string; text: string }[] = []
  const recentCalls: [string, string, string][] = []
  const fetchFn = vi.fn(async (_u: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)) as { to: string[]; subject: string; html: string; text: string })
    return new Response(JSON.stringify({ id: `msg-${sent.length}` }), { status: 200 })
  })
  const d: NotifyDeps = {
    config: { ok: true, config: CONFIG },
    fetch: fetchFn as unknown as typeof fetch,
    now: () => NOW,
    userIdFromToken: async (t) => ({ 'staff-token': 'staff-id', 'aal1-token': 'staff-id', 'owner-token': 'owner-id' })[t] ?? null,
    gate: async (t) => (t === 'staff-token' ? 'ok' : t === 'aal1-token' ? 'aal2_required' : 'forbidden'),
    recentRows: async (businessId, actorId, sinceIso) => (recentCalls.push([businessId, actorId, sinceIso]), rows),
    recipient: async (businessId) =>
      businessId === BIZ
        ? { userId: OWNER_ID, email: 'owner@shop.test', language: 'en', businessName: 'Casa Lisboa' }
        : businessId === PT_BIZ
          ? { userId: PT_OWNER_ID, email: 'dono@shop.test', language: 'pt', businessName: 'Casa do Porto' }
          : null,
    alreadySent: async (workflow) => logs.some((l) => l.workflow === workflow),
    log: async (e) => (logs.push(e), `log-${logs.length}`),
    ...over,
  }
  return { d, logs, sent, recentCalls, fetchFn }
}

const post = (body: unknown, token = 'staff-token') =>
  new Request('https://fn.test/notify-business-owner', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const json = async (r: Response) => (await r.json()) as Record<string, unknown>

const PAUSE: Row = { id: 'aud-1', eventType: 'business_status_changed', metadata: { to_status: 'inactive', actor_label: 'Admin', business_name: 'Casa Lisboa' } }

describe('notify-business-owner (R-W7-2)', () => {
  it('an Admin pause → one business_notice to the owner; a second call sends 0 (skipped 1)', async () => {
    const { d, logs, sent } = deps([PAUSE])
    const first = await handleNotifyBusinessOwner(post({ businessId: BIZ }), d)
    expect(first.status).toBe(200)
    expect(await json(first)).toEqual({ ok: true, sent: 1, skipped: 0 })
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      kind: 'business_notice',
      recipient: 'owner@shop.test',
      subject: 'Your Sanctus catalog has been paused',
      status: 'accepted',
      businessId: BIZ,
      workflow: 'business_notice:aud-1',
      triggeredBy: 'staff-id',
    })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.to).toEqual(['owner@shop.test'])
    expect(sent[0]!.text).toContain('The Sanctus team paused the public catalog of Casa Lisboa.')

    const second = await handleNotifyBusinessOwner(post({ businessId: BIZ }), d)
    expect(await json(second)).toEqual({ ok: true, sent: 0, skipped: 1 })
    expect(sent).toHaveLength(1)
    expect(logs).toHaveLength(1)
  })

  it("only the caller's own rows from the last 10 minutes", async () => {
    const { d, recentCalls } = deps([])
    const res = await handleNotifyBusinessOwner(post({ businessId: BIZ }), d)
    expect(await json(res)).toEqual({ ok: true, sent: 0, skipped: 0 })
    expect(recentCalls).toEqual([[BIZ, 'staff-id', '2026-10-26T11:50:00.000Z']])
  })

  it('sends one notice per row: live, product unpublished and product deleted; a draft status or another type sends nothing', async () => {
    const { d, sent } = deps([
      { id: 'a', eventType: 'business_status_changed', metadata: { to_status: 'active', actor_label: 'Owner' } },
      { id: 'b', eventType: 'product_unpublished', metadata: { name: 'Oslo sofa', actor_label: 'Team' } },
      { id: 'c', eventType: 'product_deleted', metadata: { name: 'Porto chair', actor_label: 'Admin' } },
      { id: 'd', eventType: 'business_status_changed', metadata: { to_status: 'draft', actor_label: 'Admin' } },
      { id: 'e', eventType: 'product_published', metadata: { name: 'Oslo sofa', actor_label: 'Admin' } },
      { id: 'f', eventType: 'product_deleted', metadata: { name: 'Owner own delete', actor_label: 'Business owner' } },
    ])
    expect(await json(await handleNotifyBusinessOwner(post({ businessId: BIZ }), d))).toEqual({ ok: true, sent: 3, skipped: 0 })
    expect(sent.map((s) => s.subject)).toEqual([
      'Your Sanctus catalog is live',
      'A product was unpublished from your catalog',
      'A product was removed from your catalog',
    ])
    expect(sent[1]!.text).toContain('The Sanctus team unpublished Oslo sofa.')
    expect(sent[2]!.text).toContain('The Sanctus team deleted Porto chair, with its photos and 3D files.')
  })

  it("PT application → PT subject 'O seu catálogo Sanctus foi pausado'", async () => {
    const { d, sent, logs } = deps([PAUSE])
    await handleNotifyBusinessOwner(post({ businessId: PT_BIZ }), d)
    expect(sent[0]!.subject).toBe('O seu catálogo Sanctus foi pausado')
    expect(sent[0]!.text).toContain('A equipa Sanctus pausou o catálogo público de Casa do Porto.')
    expect(logs[0]).toMatchObject({ recipient: 'dono@shop.test', subject: 'O seu catálogo Sanctus foi pausado' })
  })

  it('aal2_required at aal1', async () => {
    const { d, logs, recentCalls } = deps([PAUSE])
    const res = await handleNotifyBusinessOwner(post({ businessId: BIZ }, 'aal1-token'), d)
    expect(res.status).toBe(403)
    expect(await json(res)).toEqual({ error: 'aal2_required' })
    expect(recentCalls).toEqual([])
    expect(logs).toEqual([])
  })

  it('an owner (non-staff) → 403 forbidden', async () => {
    const { d, logs, recentCalls } = deps([PAUSE])
    const res = await handleNotifyBusinessOwner(post({ businessId: BIZ }, 'owner-token'), d)
    expect(res.status).toBe(403)
    expect(await json(res)).toEqual({ error: 'forbidden' })
    expect(recentCalls).toEqual([])
    expect(logs).toEqual([])
  })

  it('no token → 401; a bad business id → 400', async () => {
    const { d } = deps([PAUSE])
    expect((await handleNotifyBusinessOwner(post({ businessId: BIZ }, 'nobody'), d)).status).toBe(401)
    expect((await handleNotifyBusinessOwner(post({ businessId: 'x' }), d)).status).toBe(400)
  })

  it('a business without an owner sends nothing; email not configured logs a blocked attempt', async () => {
    const none = deps([PAUSE])
    expect(await json(await handleNotifyBusinessOwner(post({ businessId: '33333333-3333-4333-8333-333333333333' }), none.d))).toEqual({ ok: true, sent: 0, skipped: 1 })
    expect(none.logs).toEqual([])
    const blocked = deps([PAUSE], { config: { ok: false, missing: ['RESEND_API_KEY'] } })
    expect(await json(await handleNotifyBusinessOwner(post({ businessId: BIZ }), blocked.d))).toEqual({ ok: true, sent: 0, skipped: 0 })
    expect(blocked.logs).toEqual([expect.objectContaining({ kind: 'business_notice', status: 'blocked', error: 'email_not_configured', workflow: 'business_notice:aud-1' })])
    expect(blocked.fetchFn).not.toHaveBeenCalled()
  })
})


describe('notify-business-owner notifications (ADR-0056)', () => {
  it('an Admin pause → a company_update for the business members, in the owner language when none is saved', async () => {
    const notify = vi.fn(async () => {})
    const { d } = deps([PAUSE], { notify })
    await handleNotifyBusinessOwner(post({ businessId: BIZ }), d)
    expect(notify).toHaveBeenCalledWith({
      audience: { business: BIZ },
      kind: 'company_update',
      title: { en: 'Your catalog was paused', pt: 'O seu catálogo foi pausado' },
      body: { en: 'The Sanctus team paused the public catalog of Casa Lisboa.', pt: 'A equipa Sanctus pausou o catálogo público de Casa Lisboa.' },
      link: '/dashboard',
      dedupeKey: 'business_notice:aud-1',
      fallbackLang: 'en',
    })
    notify.mockClear()
    const pt = deps([PAUSE], { notify })
    await handleNotifyBusinessOwner(post({ businessId: PT_BIZ }), pt.d)
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ fallbackLang: 'pt', audience: { business: PT_BIZ } }))
  })

  it('product events link to the products page and name the product; email not configured does not stop the notification', async () => {
    const notify = vi.fn(async () => {})
    const rows: Row[] = [{ id: 'aud-2', eventType: 'product_deleted', metadata: { actor_label: 'Owner', name: 'Oslo sofa' } }]
    const { d } = deps(rows, { notify, config: { ok: false, missing: ['RESEND_API_KEY'] } })
    await handleNotifyBusinessOwner(post({ businessId: BIZ }), d)
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ link: '/dashboard/products', body: expect.objectContaining({ en: 'The Sanctus team deleted Oslo sofa.' }), dedupeKey: 'business_notice:aud-2' }))
  })

  it('a failing notifier does not change the email result, and no rows or no owner means no notification', async () => {
    const failing = deps([PAUSE], { notify: async () => Promise.reject(new Error('down')) })
    expect(await json(await handleNotifyBusinessOwner(post({ businessId: BIZ }), failing.d))).toEqual({ ok: true, sent: 1, skipped: 0 })
    const notify = vi.fn(async () => {})
    await handleNotifyBusinessOwner(post({ businessId: BIZ }), deps([], { notify }).d)
    await handleNotifyBusinessOwner(post({ businessId: '33333333-3333-4333-8333-333333333333' }), deps([PAUSE], { notify }).d)
    expect(notify).not.toHaveBeenCalled()
  })
})
describe('email switch "platform notices about their company" (ADR-0078)', () => {
  it('sends when the owner keeps it on: footer, Unsubscribe link and List-Unsubscribe headers', async () => {
    const emailPref = vi.fn(async () => true)
    const { d, sent } = deps([PAUSE], { emailPref })
    expect(await json(await handleNotifyBusinessOwner(post({ businessId: BIZ }), d))).toEqual({ ok: true, sent: 1, skipped: 0 })
    expect(emailPref).toHaveBeenCalledWith(OWNER_ID, 'business_notices')
    const body = sent[0] as unknown as { html: string; headers: Record<string, string> }
    expect(body.html).toContain('>Unsubscribe</a>')
    expect(body.html).toContain('https://preview.example.app/privacy')
    expect(body.headers['List-Unsubscribe']).toMatch(/^<https:\/\/preview\.example\.app\/email\/unsubscribe\?t=v1\./)
    expect(body.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
  })

  it('sends nothing to Resend and logs nothing when the owner switched it off, but still writes the bell entry', async () => {
    const notify = vi.fn(async () => {})
    const { d, sent, logs, fetchFn } = deps([PAUSE], { emailPref: async () => false, notify })
    expect(await json(await handleNotifyBusinessOwner(post({ businessId: BIZ }), d))).toEqual({ ok: true, sent: 0, skipped: 1 })
    expect(fetchFn).not.toHaveBeenCalled()
    expect(sent).toHaveLength(0)
    expect(logs).toHaveLength(0)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('does not send the email against a switch it could not read', async () => {
    const { d, sent } = deps([PAUSE], { emailPref: async () => { throw new Error('prefs lookup failed') } })
    await expect(handleNotifyBusinessOwner(post({ businessId: BIZ }), d)).rejects.toThrow('prefs lookup failed')
    expect(sent).toHaveLength(0)
  })

  it('blocks and logs the email when the unsubscribe secret is not set', async () => {
    const { d, sent, logs } = deps([PAUSE], { config: { ok: true, config: { ...CONFIG, unsubscribeSecret: '' } } })
    expect(await json(await handleNotifyBusinessOwner(post({ businessId: BIZ }), d))).toEqual({ ok: true, sent: 0, skipped: 0 })
    expect(sent).toHaveLength(0)
    expect(logs[0]).toMatchObject({ status: 'blocked', error: 'unsubscribe_not_configured' })
  })
})
