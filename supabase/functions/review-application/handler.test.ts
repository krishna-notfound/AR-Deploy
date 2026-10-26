// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { EmailConfig, LogEntry } from '../_shared/email'
import { REASON_MAX_LENGTH, type ReviewDeps, handleReviewApplication } from './handler'

const APP = '22222222-2222-4222-8222-222222222222'
const PT_APP = '33333333-3333-4333-8333-333333333333'
const BIZ = '11111111-1111-4111-8111-111111111111'
const CONFIG: EmailConfig = {
  apiKey: 're_test',
  from: 'Sanctus <hello@sanctus.example>',
  appBaseUrl: 'https://preview.example.app',
  testRecipients: [],
  adminNotificationEmail: 'team@account.test',
}

type Action = 'start_review' | 'approve' | 'reject'
const TARGET: Record<Action, string> = { start_review: 'under_review', approve: 'approved', reject: 'rejected' }

function deps(over: Partial<ReviewDeps> = {}, start: Record<string, string> = { [APP]: 'under_review', [PT_APP]: 'submitted' }) {
  const status = { ...start }
  const logs: LogEntry[] = []
  const sent: { to: string; subject: string; html: string; text: string }[] = []
  const calls: { action: Action; reason: string | null }[] = []
  const fetchFn = vi.fn(async (_u: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)) as { to: string; subject: string; html: string; text: string })
    return new Response(JSON.stringify({ id: `msg-${sent.length}` }), { status: 200 })
  })
  const d: ReviewDeps = {
    config: { ok: true, config: CONFIG },
    fetch: fetchFn as unknown as typeof fetch,
    userIdFromToken: async (t) => ({ 'staff-token': 'staff-id', 'aal1-token': 'staff-id', 'owner-token': 'owner-id' })[t] ?? null,
    gate: async (t) => (t === 'staff-token' ? 'ok' : t === 'aal1-token' ? 'aal2_required' : 'forbidden'),
    // A stand-in for admin_review_application: its transitions, the reason rule and a no-op repeat.
    reviewAsCaller: async (_t, id, action, reason) => {
      calls.push({ action, reason })
      const from = status[id]
      if (!from) return { error: 'application_not_found' }
      const to = TARGET[action]
      if (from === to) return { ok: true, status: to }
      if (from === 'approved' || (from === 'rejected' && to !== 'under_review')) return { error: 'invalid_transition' }
      if (to === 'rejected' && !reason?.trim()) return { error: 'reason_required' }
      status[id] = to
      return to === 'approved' ? { ok: true, status: to, businessId: BIZ } : { ok: true, status: to }
    },
    getApplicant: async (id) =>
      id === APP
        ? { businessName: 'Casa Lisboa', email: 'rita@shop.test', language: 'en', status: status[id]! }
        : id === PT_APP
          ? { businessName: 'Casa do Porto', email: 'joao@shop.test', language: 'pt', status: status[id]! }
          : null,
    log: async (e) => (logs.push(e), `log-${logs.length}`),
    ...over,
  }
  return { d, logs, sent, calls, fetchFn, status }
}

const post = (body: unknown, token = 'staff-token') =>
  new Request('https://fn.test/review-application', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const json = async (r: Response) => (await r.json()) as Record<string, unknown>

describe('review-application (R-W2-1)', () => {
  it('reject unticked → one email_log row (kind application_decision, workflow application:<id>:decision, application_id set) and no "Reason:" in text or html', async () => {
    const { d, logs, sent } = deps()
    const res = await handleReviewApplication(post({ applicationId: APP, action: 'reject', reason: 'Outside our region' }), d)
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ ok: true, status: 'rejected', email: { status: 'accepted' } })
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      kind: 'application_decision',
      workflow: `application:${APP}:decision`,
      applicationId: APP,
      recipient: 'rita@shop.test',
      subject: 'Your Sanctus application for Casa Lisboa',
      status: 'accepted',
      triggeredBy: 'staff-id',
    })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.text).toContain('Thank you for applying to list Casa Lisboa on Sanctus. After review, we are not able to approve this application.')
    expect(sent[0]!.text).toContain('You are welcome to apply again if your situation changes.')
    for (const part of [sent[0]!.text, sent[0]!.html]) {
      expect(part).not.toContain('Reason:')
      expect(part).not.toContain('Outside our region')
    }
  })

  it('reject ticked → text includes "Reason: {reason}"', async () => {
    const { d, sent } = deps()
    const res = await handleReviewApplication(post({ applicationId: APP, action: 'reject', reason: '  Outside our region  ', includeReason: true }), d)
    expect(res.status).toBe(200)
    expect(sent[0]!.text).toContain('Reason: Outside our region')
    expect(sent[0]!.html).toContain('Reason: Outside our region')
  })

  it("PT application → PT subject 'A sua candidatura à Sanctus para {businessName}' and 'Motivo:'", async () => {
    const { d, sent, logs } = deps()
    await handleReviewApplication(post({ applicationId: PT_APP, action: 'reject', reason: 'Fora da nossa região', includeReason: true }), d)
    expect(sent[0]!.subject).toBe('A sua candidatura à Sanctus para Casa do Porto')
    expect(logs[0]!.subject).toBe('A sua candidatura à Sanctus para Casa do Porto')
    expect(sent[0]!.text).toContain('Obrigado pela sua candidatura para apresentar Casa do Porto na Sanctus. Após análise, não nos é possível aprovar esta candidatura.')
    expect(sent[0]!.text).toContain('Motivo: Fora da nossa região')
    expect(sent[0]!.text).toContain('Pode candidatar-se novamente se a sua situação mudar.')
    expect(sent[0]!.html).toContain('lang="pt"')
  })

  it('approve and start_review send nothing', async () => {
    const { d, logs, fetchFn } = deps()
    const started = await handleReviewApplication(post({ applicationId: PT_APP, action: 'start_review' }), d)
    expect(await json(started)).toEqual({ ok: true, status: 'under_review' })
    const approved = await handleReviewApplication(post({ applicationId: APP, action: 'approve' }), d)
    expect(await json(approved)).toEqual({ ok: true, status: 'approved', businessId: BIZ })
    expect(logs).toHaveLength(0)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('a repeated reject (double click) is a no-op and sends nothing again', async () => {
    const { d, logs } = deps()
    await handleReviewApplication(post({ applicationId: APP, action: 'reject', reason: 'No' }), d)
    const again = await handleReviewApplication(post({ applicationId: APP, action: 'reject', reason: 'No' }), d)
    expect(await json(again)).toEqual({ ok: true, status: 'rejected' })
    expect(logs).toHaveLength(1)
  })

  it('an email failure keeps the rejection (200 ok:true, email.status failed)', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ message: 'provider down' }), { status: 500 }))
    const { d, logs, status } = deps({ fetch: fetchFn as unknown as typeof fetch })
    const res = await handleReviewApplication(post({ applicationId: APP, action: 'reject', reason: 'No' }), d)
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ ok: true, status: 'rejected', email: { status: 'failed', error: 'provider down' } })
    expect(status[APP]).toBe('rejected')
    expect(logs[0]).toMatchObject({ kind: 'application_decision', status: 'failed' })
  })

  it('an email_log failure after the rejection still answers ok, with the send outcome and the log failure', async () => {
    const { d, status } = deps({ log: async () => Promise.reject(new Error('insert failed')) })
    const res = await handleReviewApplication(post({ applicationId: APP, action: 'reject', reason: 'No' }), d)
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ ok: true, status: 'rejected', email: { status: 'accepted', error: 'email_log_failed' } })
    expect(status[APP]).toBe('rejected')
  })

  it('without email settings the rejection stands and the attempt is logged as blocked', async () => {
    const { d, logs, fetchFn } = deps({ config: { ok: false, missing: ['RESEND_API_KEY'] } })
    const res = await handleReviewApplication(post({ applicationId: APP, action: 'reject', reason: 'No' }), d)
    expect(await json(res)).toEqual({ ok: true, status: 'rejected', email: { status: 'blocked', error: 'email_not_configured' } })
    expect(logs[0]).toMatchObject({ kind: 'application_decision', status: 'blocked', workflow: `application:${APP}:decision`, applicationId: APP })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('aal2_required at aal1', async () => {
    const { d, calls } = deps()
    const res = await handleReviewApplication(post({ applicationId: APP, action: 'reject', reason: 'No' }, 'aal1-token'), d)
    expect(res.status).toBe(403)
    expect(await json(res)).toEqual({ error: 'aal2_required' })
    expect(calls).toHaveLength(0)
  })

  it('needs a signed-in caller, and staff', async () => {
    const { d } = deps()
    expect((await handleReviewApplication(post({ applicationId: APP, action: 'approve' }, 'nobody'), d)).status).toBe(401)
    const res = await handleReviewApplication(post({ applicationId: APP, action: 'approve' }, 'owner-token'), d)
    expect(res.status).toBe(403)
    expect(await json(res)).toEqual({ error: 'forbidden' })
  })

  it('reopen → 400 invalid_request', async () => {
    const { d, calls } = deps()
    const res = await handleReviewApplication(post({ applicationId: APP, action: 'reopen' }), d)
    expect(res.status).toBe(400)
    expect(await json(res)).toEqual({ error: 'invalid_request' })
    expect(calls).toHaveLength(0)
  })

  it('rejects a malformed request', async () => {
    const { d } = deps()
    for (const body of [{ applicationId: 'nope', action: 'approve' }, { applicationId: APP }, { applicationId: APP, action: 'reject', reason: 5 }])
      expect((await handleReviewApplication(post(body), d)).status).toBe(400)
  })

  it('maps the database errors: reason_required and invalid_transition 422, application_not_found 404, forbidden 403', async () => {
    const { d } = deps({}, { [APP]: 'approved', [PT_APP]: 'submitted' })
    const noReason = await handleReviewApplication(post({ applicationId: PT_APP, action: 'reject', reason: '   ' }), d)
    expect(noReason.status).toBe(422)
    expect(await json(noReason)).toMatchObject({ error: 'reason_required' })
    const late = await handleReviewApplication(post({ applicationId: APP, action: 'reject', reason: 'Too late' }), d)
    expect(late.status).toBe(422)
    expect(await json(late)).toEqual({ error: 'invalid_transition' })
    const missing = await handleReviewApplication(post({ applicationId: '44444444-4444-4444-8444-444444444444', action: 'approve' }), d)
    expect(missing.status).toBe(404)
    expect(await json(missing)).toEqual({ error: 'application_not_found' })
    const { d: d2 } = deps({ reviewAsCaller: async () => ({ error: 'forbidden' }) })
    const denied = await handleReviewApplication(post({ applicationId: APP, action: 'reject', reason: 'No' }), d2)
    expect(denied.status).toBe(403)
    expect(await json(denied)).toEqual({ error: 'forbidden' })
  })

  it('reason with markup and newlines is escaped in html and kept in text', async () => {
    const { d, sent } = deps()
    const reason = 'Line one <script>alert("x")</script>\nLine two & <b>bold</b>'
    await handleReviewApplication(post({ applicationId: APP, action: 'reject', reason, includeReason: true }), d)
    const mail = sent[0]!
    expect(mail.text).toContain(`Reason: ${reason}`)
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).not.toContain('<b>bold</b>')
    expect(mail.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;')
    expect(mail.html).toContain('Line two &amp; &lt;b&gt;bold&lt;/b&gt;')
    expect(mail.html).toContain('white-space:pre-line')
  })

  it(`a reason over ${REASON_MAX_LENGTH} characters is refused before the review and before any email`, async () => {
    const { d, calls, logs, fetchFn } = deps()
    const res = await handleReviewApplication(post({ applicationId: APP, action: 'reject', reason: 'x'.repeat(REASON_MAX_LENGTH + 1), includeReason: true }), d)
    expect(res.status).toBe(400)
    expect(await json(res)).toMatchObject({ error: 'invalid_request', fields: { reason: expect.any(String) } })
    expect(calls).toHaveLength(0)
    expect(logs).toHaveLength(0)
    expect(fetchFn).not.toHaveBeenCalled()
    // Exactly the limit is fine.
    const at = await handleReviewApplication(post({ applicationId: APP, action: 'reject', reason: 'x'.repeat(REASON_MAX_LENGTH), includeReason: true }), d)
    expect(at.status).toBe(200)
  })
})
