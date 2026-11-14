// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { clientIp, readJsonObject } from './http'

const req = (headers: Record<string, string>) => new Request('https://fn.test/x', { method: 'POST', headers })

describe('clientIp', () => {
  it('prefers the Cloudflare-set address over a client-supplied X-Forwarded-For', () => {
    expect(clientIp(req({ 'cf-connecting-ip': '198.51.100.4', 'x-forwarded-for': '1.1.1.1, 198.51.100.4' }))).toBe('198.51.100.4')
  })
  it('then X-Real-IP, then the first X-Forwarded-For entry, else unknown', () => {
    expect(clientIp(req({ 'x-real-ip': '198.51.100.5', 'x-forwarded-for': '1.1.1.1' }))).toBe('198.51.100.5')
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7')
    expect(clientIp(req({}))).toBe('unknown')
  })
  it('does not let a spoofed X-Forwarded-For change the key when the platform header is present', () => {
    const a = clientIp(req({ 'cf-connecting-ip': '198.51.100.4', 'x-forwarded-for': '9.9.9.9' }))
    const b = clientIp(req({ 'cf-connecting-ip': '198.51.100.4', 'x-forwarded-for': '8.8.8.8' }))
    expect(a).toBe(b)
  })
})

describe('readJsonObject', () => {
  const post = (body: string, headers: Record<string, string> = {}) => new Request('https://fn.test/x', { method: 'POST', body, headers })

  it('parses an object within the limit', async () => {
    expect(await readJsonObject(post('{"a":1}'), 100)).toEqual({ a: 1 })
  })
  it('returns null for arrays, scalars, invalid JSON and an empty body', async () => {
    for (const raw of ['[1]', '5', 'null', 'nope', '']) expect(await readJsonObject(post(raw), 100), raw).toBeNull()
  })
  it('refuses a body over the limit, counting bytes not characters', async () => {
    expect(await readJsonObject(post(JSON.stringify({ a: 'x'.repeat(200) })), 100)).toBeNull()
    expect(await readJsonObject(post(JSON.stringify({ a: 'é'.repeat(40) })), 60)).toBeNull()
    expect(await readJsonObject(post(JSON.stringify({ a: 'é'.repeat(20) })), 60)).toEqual({ a: 'é'.repeat(20) })
  })
  it('refuses on a large Content-Length without reading the body', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode('{}'))
        controller.close()
      },
    })
    const r = new Request('https://fn.test/x', { method: 'POST', body: stream, headers: { 'content-length': '5000' }, duplex: 'half' } as RequestInit)
    expect(await readJsonObject(r, 100)).toBeNull()
    // The body was never taken up by a reader (the stream itself may pre-fetch one chunk).
    expect(r.bodyUsed).toBe(false)
  })
  it('stops reading once the limit is passed (a stream with no Content-Length)', async () => {
    let chunks = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunks++
        controller.enqueue(new TextEncoder().encode('x'.repeat(40)))
        if (chunks > 1000) controller.close()
      },
    })
    const r = new Request('https://fn.test/x', { method: 'POST', body: stream, duplex: 'half' } as RequestInit)
    expect(await readJsonObject(r, 100)).toBeNull()
    expect(chunks).toBeLessThan(20)
  })
})
