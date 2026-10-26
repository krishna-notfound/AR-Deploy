// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EmailConfig, LogEntry } from '../_shared/email'
import { type ActOutcome, type EmailContext, type ReviewModelRequestDeps, handleReviewModelRequest } from './handler'

const REQ = '11111111-1111-4111-8111-111111111111'
const BIZ = '22222222-2222-4222-8222-222222222222'
const CONFIG: EmailConfig = {
  apiKey: 're_test',
  from: 'Sanctus <hello@sanctus.example>',
  appBaseUrl: 'https://preview.example.app',
  testRecipients: [],
  adminNotificationEmail: 'team@account.test',
}

const CTX: EmailContext = {
  businessId: BIZ,
  recipient: { email: 'owner@shop.test', language: 'en' },
  productName: { en: 'Oslo sofa', pt: 'Sofá Oslo' },
  productStatus: 'published',
}

type Sent = { to: string[]; subject: string; html: string; text: string }

function setup(over: Partial<ReviewModelRequestDeps> = {}, ctx: Partial<EmailContext> | null = {}, act: ActOutcome = { ok: true, status: 'delivered', productStatus: 'published', replacedPaths: ['old.glb'] }) {
  const logs: LogEntry[] = []
  const sent: Sent[] = []
  const acts: { token: string; id: string; action: string; reason: string | null }[] = []
  const fetchFn = vi.fn(async (_u: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)) as Sent)
    return new Response(JSON.stringify({ id: `msg-${sent.length}` }), { status: 200 })
  })
  const d: ReviewModelRequestDeps = {
    config: { ok: true, config: CONFIG },
    fetch: fetchFn as unknown as typeof fetch,
    userIdFromToken: async (t) => ({ 'staff-token': 'staff-id', 'aal1-token': 'staff-id', 'plain-token': 'plain-id' })[t] ?? null,
    gate: async (t) => (t === 'staff-token' ? 'ok' : t === 'aal1-token' ? 'aal2_required' : 'forbidden'),
    actAsCaller: async (token, id, action, reason) => (acts.push({ token, id, action, reason }), act),
    currentStatus: async () => 'delivered',
    emailContext: async () => (ctx === null ? null : { ...CTX, ...ctx }),
    alreadySent: async (w) => logs.some((l) => l.workflow === w),
    log: async (e) => (logs.push(e), `log-${logs.length}`),
    ...over,
  }
  return { d, logs, sent, acts, fetchFn }
}

const post = (body: unknown, token = 'staff-token') =>
  new Request('https://fn.test/review-model-request', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
const json = async (r: Response) => (await r.json()) as Record<string, unknown>

afterEach(() => vi.restoreAllMocks())

describe('S4 Task 7: review-model-request (R-S4-15)', () => {
  it('aal2_required (403) comes before forbidden, and neither calls actAsCaller', async () => {
    const { d, acts } = setup()
    const aal1 = await handleReviewModelRequest(post({ requestId: REQ, action: 'start' }, 'aal1-token'), d)
    expect([aal1.status, await json(aal1)]).toEqual([403, { error: 'aal2_required' }])
    const plain = await handleReviewModelRequest(post({ requestId: REQ, action: 'start' }, 'plain-token'), d)
    expect([plain.status, await json(plain)]).toEqual([403, { error: 'forbidden' }])
    const anon = await handleReviewModelRequest(post({ requestId: REQ, action: 'start' }, 'nobody'), d)
    expect(anon.status).toBe(401)
    expect(acts).toEqual([])
  })

  it('start → 200 {status: in_progress} and no email', async () => {
    const { d, acts, sent, logs } = setup({}, {}, { ok: true, status: 'in_progress' })
    const res = await handleReviewModelRequest(post({ requestId: REQ, action: 'start' }), d)
    expect([res.status, await json(res)]).toEqual([200, { ok: true, status: 'in_progress' }])
    expect(acts).toEqual([{ token: 'staff-token', id: REQ, action: 'start', reason: null }])
    expect(sent).toEqual([])
    expect(logs).toEqual([])
  })

  it('deliver for a published product → the published body, logged as model_request_update with the workflow', async () => {
    const { d, sent, logs } = setup()
    const res = await handleReviewModelRequest(post({ requestId: REQ, action: 'deliver' }), d)
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ ok: true, status: 'delivered', replacedPaths: ['old.glb'], email: { status: 'accepted' } })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.to).toEqual(['owner@shop.test'])
    expect(sent[0]!.subject).toBe('The 3D model for Oslo sofa is ready')
    expect(sent[0]!.text).toContain('It is now attached to the product, and customers can view it in 3D and in AR on the product page.')
    expect(logs).toMatchObject([{ kind: 'model_request_update', businessId: BIZ, workflow: `model_request:${REQ}:delivered`, status: 'accepted', triggeredBy: 'staff-id' }])
  })

  it('deliver for a draft product → the draft body (the SQL result wins over the stored status)', async () => {
    const { d, sent } = setup({}, { productStatus: 'published' }, { ok: true, status: 'delivered', productStatus: 'draft' })
    await handleReviewModelRequest(post({ requestId: REQ, action: 'deliver' }), d)
    expect(sent[0]!.text).toContain("Publish the product when you're ready")
  })

  it("reject → the declined body with 'Reason: {reason}', and stagedPaths in the answer", async () => {
    const { d, sent, acts, logs } = setup({}, { reason: 'Photos too dark' }, { ok: true, status: 'rejected', stagedPaths: ['a.glb'] })
    const res = await handleReviewModelRequest(post({ requestId: REQ, action: 'reject', reason: '  Photos too dark ' }), d)
    expect(await json(res)).toEqual({ ok: true, status: 'rejected', stagedPaths: ['a.glb'], email: { status: 'accepted' } })
    expect(acts[0]!.reason).toBe('Photos too dark')
    expect(sent[0]!.subject).toBe('Your 3D model request for Oslo sofa')
    expect(sent[0]!.text).toContain('Reason: Photos too dark.')
    expect(logs[0]!.workflow).toBe(`model_request:${REQ}:rejected`)
  })

  it('a PT recipient → PT subject and body with the PT product and option names, falling back to EN', async () => {
    const pt = setup({}, { recipient: { email: 'dono@shop.test', language: 'pt' }, optionName: { en: 'Walnut', pt: 'Nogueira' } })
    await handleReviewModelRequest(post({ requestId: REQ, action: 'deliver' }), pt.d)
    expect(pt.sent[0]!.subject).toBe('O modelo 3D de Sofá Oslo está pronto')
    expect(pt.sent[0]!.text).toContain('A equipa Sanctus terminou o modelo 3D de Sofá Oslo (Nogueira).')

    const fallback = setup({}, { recipient: { email: 'dono@shop.test', language: 'pt' }, productName: { en: 'Oslo sofa' }, optionName: { en: 'Walnut' } })
    await handleReviewModelRequest(post({ requestId: REQ, action: 'deliver' }), fallback.d)
    expect(fallback.sent[0]!.subject).toBe('O modelo 3D de Oslo sofa está pronto')
    expect(fallback.sent[0]!.text).toContain('modelo 3D de Oslo sofa (Walnut).')
  })

  it("an email failure → 200 ok with email.status 'failed' and the status unchanged", async () => {
    const { d, logs } = setup({ fetch: (async () => new Response(JSON.stringify({ message: 'secret provider text' }), { status: 500 })) as unknown as typeof fetch })
    const res = await handleReviewModelRequest(post({ requestId: REQ, action: 'deliver' }), d)
    const body = await json(res)
    expect([res.status, body.status, body.email]).toEqual([200, 'delivered', { status: 'failed' }])
    expect(logs[0]).toMatchObject({ status: 'failed' })
  })

  it('an email setup problem is reported as a fixed reason code', async () => {
    const { d, logs } = setup({ config: { ok: false, missing: ['RESEND_API_KEY'] } })
    const res = await handleReviewModelRequest(post({ requestId: REQ, action: 'deliver' }), d)
    expect((await json(res)).email).toEqual({ status: 'blocked', error: 'email_not_configured' })
    expect(logs[0]).toMatchObject({ status: 'blocked', error: 'email_not_configured' })
  })

  it("no owner → email {status: 'skipped'}, and nothing is sent or logged", async () => {
    const { d, sent, logs } = setup({}, { recipient: null })
    const res = await handleReviewModelRequest(post({ requestId: REQ, action: 'deliver' }), d)
    expect((await json(res)).email).toEqual({ status: 'skipped' })
    expect([sent, logs]).toEqual([[], []])
  })

  it('a workflow already in email_log is not sent again', async () => {
    const { d, sent, logs } = setup()
    logs.push({ kind: 'model_request_update', recipient: 'owner@shop.test', subject: 'S', status: 'failed', workflow: `model_request:${REQ}:delivered` })
    const res = await handleReviewModelRequest(post({ requestId: REQ, action: 'deliver' }), d)
    expect(res.status).toBe(200)
    expect(sent).toEqual([])
    expect(logs).toHaveLength(1)
  })

  it('deliver retried after the request is already delivered: 200 ok, status delivered, one email_log row for the workflow', async () => {
    let calls = 0
    const { d, sent, logs } = setup({
      actAsCaller: async () => (++calls === 1 ? { ok: true, status: 'delivered', productStatus: 'published' } : { error: 'invalid_transition' }),
      currentStatus: async () => 'delivered',
    })
    const first = await handleReviewModelRequest(post({ requestId: REQ, action: 'deliver' }), d)
    const retry = await handleReviewModelRequest(post({ requestId: REQ, action: 'deliver' }), d)
    expect([first.status, retry.status]).toEqual([200, 200])
    expect(await json(retry)).toEqual({ ok: true, status: 'delivered' })
    expect(sent).toHaveLength(1)
    expect(logs.filter((l) => l.workflow === `model_request:${REQ}:delivered`)).toHaveLength(1)
  })

  it('a retry whose first email was never sent sends it now', async () => {
    const { d, sent } = setup({ actAsCaller: async () => ({ error: 'invalid_transition' }), currentStatus: async () => 'delivered' })
    const res = await handleReviewModelRequest(post({ requestId: REQ, action: 'deliver' }), d)
    expect((await json(res)).email).toEqual({ status: 'accepted' })
    expect(sent).toHaveLength(1)
  })

  it('invalid_transition with another status → 422', async () => {
    const { d, sent } = setup({ actAsCaller: async () => ({ error: 'invalid_transition' }), currentStatus: async () => 'requested' })
    const res = await handleReviewModelRequest(post({ requestId: REQ, action: 'deliver' }), d)
    expect([res.status, await json(res)]).toEqual([422, { error: 'invalid_transition' }])
    expect(sent).toEqual([])
  })

  it.each([
    ['reason_required', 422, 'reject'],
    ['model_request_needs_glb', 422, 'deliver'],
    ['model_request_not_found', 404, 'start'],
    ['forbidden', 403, 'start'],
  ])('%s → %s', async (key, status, action) => {
    const { d } = setup({ actAsCaller: async () => ({ error: key }) })
    const res = await handleReviewModelRequest(post({ requestId: REQ, action, reason: 'x' }), d)
    expect(res.status).toBe(status)
    expect((await json(res)).error).toBe(key)
  })

  it('a missing requestId or unknown action → 400 invalid_request, before the database is touched', async () => {
    const { d, acts } = setup()
    for (const body of [{ action: 'start' }, { requestId: 'nope', action: 'start' }, { requestId: REQ, action: 'approve' }, { requestId: REQ }, { requestId: REQ, action: 'reject', reason: 5 }]) {
      const res = await handleReviewModelRequest(post(body), d)
      expect([res.status, await json(res)]).toEqual([400, { error: 'invalid_request' }])
    }
    const long = await handleReviewModelRequest(post({ requestId: REQ, action: 'reject', reason: 'x'.repeat(1001) }), d)
    expect(long.status).toBe(400)
    expect(acts).toEqual([])
  })

  it('an unexpected error → 500 unknown, with nothing secret logged', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { d } = setup({ actAsCaller: async () => { throw new Error('admin_deliver_model_request failed: XX000') } })
    const res = await handleReviewModelRequest(post({ requestId: REQ, action: 'deliver' }), d)
    expect([res.status, await json(res)]).toEqual([500, { error: 'unknown' }])
    const logged = spy.mock.calls.flat().join(' ')
    expect(logged).toContain('XX000')
    expect(logged).not.toContain('staff-token')
    expect(logged).not.toContain('owner@shop.test')
  })

  it('an unknown database error key is a 500, not echoed to the client', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { d } = setup({ actAsCaller: async () => ({ error: 'something internal' }) })
    const res = await handleReviewModelRequest(post({ requestId: REQ, action: 'deliver' }), d)
    expect([res.status, await json(res)]).toEqual([500, { error: 'unknown' }])
  })
})
