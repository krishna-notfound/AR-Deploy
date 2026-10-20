// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { type RecordResult, type TrackEventDeps, handleTrackEvent, visitorKey, visitorNetwork } from './handler'

const P = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-10-13T10:00:00Z')

const post = (body: unknown, ip = '203.0.113.7') =>
  new Request('https://x.supabase.co/functions/v1/track-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1` },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

function deps(results: RecordResult[] = ['recorded']) {
  const calls: Parameters<TrackEventDeps['record']>[0][] = []
  let i = 0
  const d: TrackEventDeps = {
    salt: 'test-salt',
    now: () => NOW,
    record: vi.fn(async (args) => {
      calls.push(args)
      return results[Math.min(i++, results.length - 1)]!
    }),
  }
  return { d, calls }
}

describe('track-event handler', () => {
  it('records a valid view and AR event (204)', async () => {
    const { d, calls } = deps()
    expect((await handleTrackEvent(post({ productId: P, businessId: B, type: 'view' }), d)).status).toBe(204)
    expect((await handleTrackEvent(post({ productId: P, businessId: B, type: 'ar_activation' }), d)).status).toBe(204)
    expect(calls.map((c) => c.eventType)).toEqual(['view', 'ar_activation'])
    expect(calls[0]).toMatchObject({ productId: P, businessId: B })
  })

  it('never passes the raw IP on: only a 64-char hex digest', async () => {
    const { d, calls } = deps()
    await handleTrackEvent(post({ productId: P, businessId: B, type: 'view' }), d)
    const key = calls[0]!.visitorKey
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(calls)).not.toContain('203.0.113.7')
    expect(key).toBe(await visitorKey('203.0.113.7', 'test-salt', NOW))
  })

  it('gives repeated requests from one visitor the same key, and other visitors / days / salts a different one', async () => {
    const a = await visitorKey('203.0.113.7', 's', NOW)
    expect(await visitorKey('203.0.113.7', 's', NOW)).toBe(a)
    expect(await visitorKey('198.51.100.9', 's', NOW)).not.toBe(a)
    expect(await visitorKey('203.0.113.7', 's', new Date('2026-10-14T10:00:00Z'))).not.toBe(a)
    expect(await visitorKey('203.0.113.7', 'other-salt', NOW)).not.toBe(a)
  })

  it('treats every address in one IPv6 /64 as the same visitor (OWN-04)', async () => {
    expect(visitorNetwork('2001:db8:abcd:12:1::7')).toBe('2001:db8:abcd:12::/64')
    expect(visitorNetwork('2001:0db8:abcd:0012:ffff:1:2:3')).toBe('2001:db8:abcd:12::/64')
    expect(visitorNetwork('2001:db8::1')).toBe('2001:db8:0:0::/64')
    expect(visitorNetwork('203.0.113.7')).toBe('203.0.113.7')
    expect(await visitorKey('2001:db8:abcd:12::1', 's', NOW)).toBe(await visitorKey('2001:db8:abcd:12:9:8:7:6', 's', NOW))
    expect(await visitorKey('2001:db8:abcd:12::1', 's', NOW)).not.toBe(await visitorKey('2001:db8:abcd:13::1', 's', NOW))
  })

  it('returns 429 with Retry-After once the database reports the limit', async () => {
    const { d } = deps(['recorded', 'recorded', 'rate_limited'])
    const statuses = []
    for (let i = 0; i < 3; i++) statuses.push((await handleTrackEvent(post({ productId: P, businessId: B, type: 'view' }), d)).status)
    expect(statuses).toEqual([204, 204, 429])
    const limited = await handleTrackEvent(post({ productId: P, businessId: B, type: 'view' }), d)
    expect(limited.headers.get('Retry-After')).toBe('60')
  })

  it.each([
    ['unknown event type', { productId: P, businessId: B, type: 'purchase' }],
    ['non-uuid product', { productId: 'abc', businessId: B, type: 'view' }],
    ['missing business', { productId: P, type: 'view' }],
    ['extra trust in client fields', { productId: P, businessId: B, type: 'view ' }],
  ])('rejects %s with 400 without touching the database', async (_, body) => {
    const { d } = deps()
    expect((await handleTrackEvent(post(body), d)).status).toBe(400)
    expect(d.record).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON, oversized bodies and wrong methods', async () => {
    const { d } = deps()
    expect((await handleTrackEvent(post('{nope'), d)).status).toBe(400)
    expect((await handleTrackEvent(post('x'.repeat(5000)), d)).status).toBe(413)
    expect((await handleTrackEvent(new Request('https://x/f', { method: 'GET' }), d)).status).toBe(405)
    expect(d.record).not.toHaveBeenCalled()
  })

  it('maps a not-recordable event (draft, wrong business) to 422', async () => {
    const { d } = deps(['invalid'])
    expect((await handleTrackEvent(post({ productId: P, businessId: B, type: 'view' }), d)).status).toBe(422)
  })

  it('answers CORS preflight and fails closed without a salt or on DB errors', async () => {
    const { d } = deps()
    const pre = await handleTrackEvent(new Request('https://x/f', { method: 'OPTIONS' }), d)
    expect(pre.status).toBe(204)
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect((await handleTrackEvent(post({ productId: P, businessId: B, type: 'view' }), { ...d, salt: '' })).status).toBe(500)
    const broken: TrackEventDeps = { salt: 's', record: async () => Promise.reject(new Error('db down')) }
    expect((await handleTrackEvent(post({ productId: P, businessId: B, type: 'view' }), broken)).status).toBe(500)
  })
})
