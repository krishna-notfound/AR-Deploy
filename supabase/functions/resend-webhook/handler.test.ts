// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { TOLERANCE_SECONDS, type WebhookDeps, handleResendWebhook, signPayload } from './handler'

const SECRET = `whsec_${btoa('a-test-signing-secret-32-bytes!!')}`
const NOW = new Date('2026-10-20T10:00:00Z')
const TS = String(Math.floor(NOW.getTime() / 1000))

async function signed(body: unknown, { id = 'msg_svix_1', ts = TS, secret = SECRET } = {}) {
  const raw = JSON.stringify(body)
  const sig = await signPayload(secret, id, ts, raw)
  return new Request('https://fn.test/resend-webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,bogus v1,${sig}` },
    body: raw,
  })
}

function deps(over: Partial<WebhookDeps> = {}) {
  const seen = new Set<string>()
  const recorded: [string, string, string, string?][] = []
  const d: WebhookDeps = {
    secret: SECRET,
    now: () => NOW,
    record: async (svix, msg, type, error) => {
      if (seen.has(svix)) return false
      seen.add(svix)
      recorded.push(error === undefined ? [svix, msg, type] : [svix, msg, type, error])
      return true
    },
    ...over,
  }
  return { d, recorded }
}

const EVENT = { type: 'email.delivered', created_at: '2026-10-20T09:59:59Z', data: { email_id: '4ef9a417-02e9-4d39-ad75-9611e0fcc33c' } }

describe('resend-webhook', () => {
  it('records a correctly signed event once; a redelivery changes nothing', async () => {
    const { d, recorded } = deps()
    const first = await handleResendWebhook(await signed(EVENT), d)
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ processed: true })
    const again = await handleResendWebhook(await signed(EVENT), d)
    expect(await again.json()).toEqual({ processed: false, reason: 'duplicate' })
    expect(recorded).toEqual([['msg_svix_1', '4ef9a417-02e9-4d39-ad75-9611e0fcc33c', 'email.delivered']])
  })

  it('email.suppressed → bounced, error suppressed', async () => {
    const { d, recorded } = deps()
    const res = await handleResendWebhook(await signed({ ...EVENT, type: 'email.suppressed' }), d)
    expect(await res.json()).toEqual({ processed: true })
    expect(recorded).toEqual([['msg_svix_1', '4ef9a417-02e9-4d39-ad75-9611e0fcc33c', 'email.bounced', 'suppressed']])
  })

  it('refuses unsigned, tampered, wrongly keyed and stale requests', async () => {
    const { d, recorded } = deps()
    const unsigned = new Request('https://fn.test', { method: 'POST', body: JSON.stringify(EVENT) })
    expect((await handleResendWebhook(unsigned, d)).status).toBe(401)

    const good = await signed(EVENT)
    const tampered = new Request('https://fn.test', { method: 'POST', headers: good.headers, body: JSON.stringify({ ...EVENT, type: 'email.bounced' }) })
    expect((await handleResendWebhook(tampered, d)).status).toBe(401)

    expect((await handleResendWebhook(await signed(EVENT, { secret: `whsec_${btoa('another-secret-another-secret!!!')}` }), d)).status).toBe(401)
    expect((await handleResendWebhook(await signed(EVENT, { ts: String(Number(TS) - TOLERANCE_SECONDS - 1) }), d)).status).toBe(401)
    expect(recorded).toHaveLength(0)
  })

  it('acknowledges signed events it does not track', async () => {
    const { d, recorded } = deps()
    const res = await handleResendWebhook(await signed({ type: 'contact.created', data: { id: 'x' } }), d)
    expect(await res.json()).toEqual({ processed: false, reason: 'ignored' })
    expect(recorded).toHaveLength(0)
  })

  it('fails closed without a secret and only accepts POST', async () => {
    const { d } = deps({ secret: '' })
    expect((await handleResendWebhook(await signed(EVENT), d)).status).toBe(503)
    expect((await handleResendWebhook(new Request('https://fn.test', { method: 'GET' }), deps().d)).status).toBe(405)
  })
})
