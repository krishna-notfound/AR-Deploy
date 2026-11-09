// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { type NotifyModelRequestDeps, type SentRequest, handleNotifyModelRequest } from './handler'

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
