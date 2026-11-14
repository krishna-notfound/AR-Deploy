// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { EmailConfig, LogEntry } from '../_shared/email'
import { type NotifyModelRequestDeps, type SentRequest, type StaffEmailDeps, handleNotifyModelRequest } from './handler'

const REQ = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-11-09T12:00:00Z')
const SENT: SentRequest = {
  businessName: 'Casa Lisboa',
  productName: { en: 'Oslo sofa', pt: 'Sofá Oslo' },
  requestedBy: 'owner-id',
  status: 'requested',
  createdAt: '2026-11-09T11:58:00Z',
}

function setup(request: Partial<SentRequest> | null = {}, over: Partial<NotifyModelRequestDeps> = {}) {
  const notify = vi.fn(async () => {})
  const loads: [string, string][] = []
  const d: NotifyModelRequestDeps = {
    now: () => NOW,
    userIdFromToken: async (t) => ({ 'owner-token': 'owner-id', 'other-token': 'other-id' })[t] ?? null,
    loadRequest: async (token, id) => (loads.push([token, id]), request === null ? null : { ...SENT, ...request }),
    notify,
    ...over,
  }
  return { d, notify, loads }
}

const post = (body: unknown, token = 'owner-token', method = 'POST') =>
  new Request('https://fn.test/notify-model-request', { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined })
const json = async (r: Response) => (await r.json()) as Record<string, unknown>

describe('notify-model-request (ADR-0056)', () => {
  it('the sender of a fresh request notifies staff with models.manage, once per request', async () => {
    const { d, notify, loads } = setup()
    const res = await handleNotifyModelRequest(post({ requestId: REQ }), d)
    expect([res.status, await json(res)]).toEqual([200, { ok: true, notified: true }])
    expect(loads).toEqual([['owner-token', REQ]])
    expect(notify).toHaveBeenCalledWith({
      audience: { staff: 'models.manage' },
      kind: 'new_model_request',
      title: { en: 'New 3D model request', pt: 'Novo pedido de modelo 3D' },
      body: { en: 'Casa Lisboa asked for a 3D model of Oslo sofa.', pt: 'Casa Lisboa pediu um modelo 3D de Sofá Oslo.' },
      link: `/admin/model-requests/${REQ}`,
      dedupeKey: `model_request:${REQ}:requested`,
    })
  })

  it('refuses callers without a session (401), bad input (400), other methods (405) and requests they cannot see (404)', async () => {
    const { d, notify } = setup()
    expect((await handleNotifyModelRequest(post({ requestId: REQ }, 'nobody'), d)).status).toBe(401)
    expect((await handleNotifyModelRequest(post({ requestId: 'nope' }), d)).status).toBe(400)
    expect((await handleNotifyModelRequest(post({}), d)).status).toBe(400)
    expect((await handleNotifyModelRequest(post(null, 'owner-token', 'GET'), d)).status).toBe(405)
    expect((await handleNotifyModelRequest(post(null, 'owner-token', 'OPTIONS'), d)).status).toBe(204)
    const hidden = setup(null)
    expect((await handleNotifyModelRequest(post({ requestId: REQ }), hidden.d)).status).toBe(404)
    expect(notify).not.toHaveBeenCalled()
    expect(hidden.notify).not.toHaveBeenCalled()
  })

  it('does nothing for a request someone else sent, one that moved on, or one older than 10 minutes', async () => {
    for (const request of [{ requestedBy: 'other-id' }, { status: 'in_progress' }, { createdAt: '2026-11-09T11:40:00Z' }, { requestedBy: null }]) {
      const { d, notify } = setup(request)
      const res = await handleNotifyModelRequest(post({ requestId: REQ }), d)
      expect([res.status, await json(res)]).toEqual([200, { ok: true, notified: false }])
      expect(notify).not.toHaveBeenCalled()
    }
  })
})

describe('notify-model-request staff email (ADR-0078)', () => {
  const ANA = '11111111-2222-4333-8444-555555555551'
  const BO = '11111111-2222-4333-8444-555555555552'
  const CONFIG: EmailConfig = { apiKey: 're_test', from: 'Sanctus <hello@sanctus.test>', appBaseUrl: 'https://app.sanctus.test', testRecipients: [], adminNotificationEmail: '', unsubscribeSecret: 'unsub-secret' }

  function withEmail(over: Partial<StaffEmailDeps> = {}) {
    const logs: LogEntry[] = []
    const bodies: { to: string[]; subject: string; html: string; text: string; headers?: Record<string, string> }[] = []
    const fetchFn = vi.fn(async (_u: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ id: `msg-${bodies.length}` }), { status: 200 })
    })
    const email: StaffEmailDeps = {
      config: { ok: true, config: CONFIG },
      fetch: fetchFn as unknown as typeof fetch,
      staff: async () => [{ userId: ANA, email: 'ana@team.test' }, { userId: BO, email: 'bo@team.test' }],
      alreadySent: async (w) => logs.some((l) => l.workflow === w),
      log: async (e) => (logs.push(e), `log-${logs.length}`),
      ...over,
    }
    return { email, logs, bodies, fetchFn }
  }

  it('emails each staff member with models.manage once, with the footer, Unsubscribe and headers', async () => {
    const { email, bodies, logs } = withEmail()
    const { d } = setup({}, {})
    const res = await handleNotifyModelRequest(post({ requestId: REQ }), { ...d, email })
    expect(await json(res)).toEqual({ ok: true, notified: true })
    expect(bodies.map((b) => b.to[0])).toEqual(['ana@team.test', 'bo@team.test'])
    expect(bodies[0]!.subject).toBe('New 3D model request: Oslo sofa')
    expect(bodies[0]!.text).toContain('Casa Lisboa asked for a 3D model of Oslo sofa.')
    expect(bodies[0]!.html).toContain(`https://app.sanctus.test/admin/model-requests/${REQ}`)
    expect(bodies[0]!.html).toContain('>Unsubscribe</a>')
    expect(bodies[0]!.html).toContain('https://app.sanctus.test/privacy')
    expect(bodies[0]!.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(logs.map((l) => [l.kind, l.status])).toEqual([['model_request_staff', 'accepted'], ['model_request_staff', 'accepted']])
    // A second call (a retry) sends nothing new.
    await handleNotifyModelRequest(post({ requestId: REQ }), { ...d, email })
    expect(bodies).toHaveLength(2)
  })

  it('skips a staff member who switched the email off: nothing to Resend, nothing logged for them', async () => {
    const emailPref = vi.fn(async (id: string) => id !== ANA)
    const { email, bodies, logs } = withEmail({ emailPref })
    const { d, notify } = setup({}, {})
    await handleNotifyModelRequest(post({ requestId: REQ }), { ...d, email })
    expect(emailPref).toHaveBeenCalledWith(ANA, 'new_model_request')
    expect(bodies.map((b) => b.to[0])).toEqual(['bo@team.test'])
    expect(logs.map((l) => l.recipient)).toEqual(['bo@team.test'])
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('sends no email for an old or foreign request, and a failing email never fails the request', async () => {
    const stale = withEmail()
    await handleNotifyModelRequest(post({ requestId: REQ }), { ...setup({ createdAt: '2026-11-09T09:00:00Z' }).d, email: stale.email })
    expect(stale.bodies).toHaveLength(0)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = withEmail({ staff: async () => Promise.reject(new Error('db down for ana@team.test')) })
    const res = await handleNotifyModelRequest(post({ requestId: REQ }), { ...setup().d, email: broken.email })
    expect(await json(res)).toEqual({ ok: true, notified: true })
    expect(String(spy.mock.calls[0]?.[0])).not.toContain('ana@team.test')
    spy.mockRestore()
  })

  it('logs a blocked row, not an email, when email is not configured', async () => {
    const { email, bodies, logs } = withEmail({ config: { ok: false, missing: ['RESEND_API_KEY'] } })
    await handleNotifyModelRequest(post({ requestId: REQ }), { ...setup().d, email })
    expect(bodies).toHaveLength(0)
    expect(logs.map((l) => l.status)).toEqual(['blocked', 'blocked'])
  })
})
