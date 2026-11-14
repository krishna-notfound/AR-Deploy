// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { MAX_SUBMISSIONS_PER_HOUR, MAX_UPLOADS_PER_HOUR, submitterHash } from '../_shared/attempts'
import { type UploadDeps, handleApplicationUpload } from './handler'

const KEY = '6f1c1b1e-3c55-4a1c-9d47-0a3c1e2b9f10'
const MB = 1024 * 1024
const BODY = { submissionKey: KEY, size: 3 * MB, contentType: 'application/pdf' }

function deps(over: Partial<UploadDeps> = {}) {
  const attempts: string[] = []
  const created: string[] = []
  /** Submission keys that already have a stored application. */
  const submitted = new Set<string>()
  const d: UploadDeps = {
    salt: 'salt',
    now: () => new Date('2026-11-05T12:00:00Z'),
    // The same rule as service_application_attempt: refused at `max` attempts in the hour, otherwise recorded.
    allowAttempt: async (hashes, max) => {
      if (attempts.filter((h) => hashes.includes(h)).length >= max) return false
      attempts.push(hashes[0]!)
      return true
    },
    submissionExists: async (key) => submitted.has(key),
    createUpload: async (path) => (created.push(path), { path, signedUrl: `https://project.supabase.co/storage/v1/object/upload/sign/application-files/${path}?token=t0k`, token: 't0k' }),
    ...over,
  }
  return { d, attempts, created, submitted }
}

const post = (body: unknown, ip = '203.0.113.9') =>
  new Request('https://fn.test/application-upload', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) })

describe('application-upload', () => {
  it('answers the CORS preflight and refuses other methods', async () => {
    const { d } = deps()
    const pre = await handleApplicationUpload(new Request('https://fn.test/x', { method: 'OPTIONS' }), d)
    expect(pre.status).toBe(204)
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect((await handleApplicationUpload(new Request('https://fn.test/x', { method: 'GET' }), d)).status).toBe(405)
  })

  it('returns a signed upload URL for pending/<submissionKey>/catalogue.pdf', async () => {
    const { d, created } = deps()
    const res = await handleApplicationUpload(post(BODY), d)
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const body = (await res.json()) as { path: string; signedUrl: string; token: string }
    expect(body.path).toBe(`pending/${KEY}/catalogue.pdf`)
    expect(body.token).toBe('t0k')
    expect(body.signedUrl).toContain(`pending/${KEY}/catalogue.pdf`)
    expect(created).toEqual([`pending/${KEY}/catalogue.pdf`])
  })

  it('uses the lower-case folder for an upper-case key', async () => {
    const { d, created } = deps()
    await handleApplicationUpload(post({ ...BODY, submissionKey: KEY.toUpperCase() }), d)
    expect(created).toEqual([`pending/${KEY}/catalogue.pdf`])
  })

  it('accepts exactly 20 MB and refuses 20 MB + 1, an empty file, a non-integer size and a missing size', async () => {
    const { d, created } = deps()
    expect((await handleApplicationUpload(post({ ...BODY, size: 20 * MB }), d)).status).toBe(200)
    for (const size of [20 * MB + 1, 0, -5, 1.5, '3', null, undefined]) {
      const res = await handleApplicationUpload(post({ ...BODY, size }), d)
      expect(res.status, String(size)).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_request' })
    }
    expect(created).toHaveLength(1)
  })

  it('refuses anything but a PDF', async () => {
    const { d, created } = deps()
    for (const contentType of ['image/png', 'application/octet-stream', 'application/pdf; charset=x', '', undefined, 5]) {
      const res = await handleApplicationUpload(post({ ...BODY, contentType }), d)
      expect(res.status, String(contentType)).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_request' })
    }
    expect(created).toHaveLength(0)
  })

  it('refuses a missing, malformed or non-text submission key, and a body that is not a JSON object', async () => {
    const { d, created, attempts } = deps()
    for (const submissionKey of [undefined, '', 'not-a-uuid', `${KEY}/../x`, 7, null]) {
      const res = await handleApplicationUpload(post({ ...BODY, submissionKey }), d)
      expect(res.status, String(submissionKey)).toBe(400)
    }
    const raw = (b: string) => new Request('https://fn.test/x', { method: 'POST', body: b })
    expect((await handleApplicationUpload(raw('nope'), d)).status).toBe(400)
    expect((await handleApplicationUpload(raw('[1]'), d)).status).toBe(400)
    // A refused request is not an attempt: validation comes first, so garbage cannot use up an address's allowance.
    expect(attempts).toHaveLength(0)
    expect(created).toHaveLength(0)
  })

  it('gives no upload URL once an application with this submission key is stored (the catalogue cannot be replaced after submitting)', async () => {
    const { d, created, submitted, attempts } = deps()
    expect((await handleApplicationUpload(post(BODY), d)).status).toBe(200)
    submitted.add(KEY)
    const res = await handleApplicationUpload(post({ ...BODY, submissionKey: KEY.toUpperCase() }), d)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'already_submitted' })
    expect(created).toHaveLength(1)
    // A refused replacement is not an allowed attempt either.
    expect(attempts).toHaveLength(1)
  })

  it('answers 500 unknown when the submission lookup fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const { d, created } = deps({ submissionExists: async () => { throw new Error('db down') } })
      const res = await handleApplicationUpload(post(BODY), d)
      expect(res.status).toBe(500)
      expect(created).toHaveLength(0)
    } finally {
      spy.mockRestore()
    }
  })

  it('keys the limit on the platform-set address, not on a spoofed X-Forwarded-For', async () => {
    const { d } = deps()
    const spoofed = (xff: string) =>
      new Request('https://fn.test/application-upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.30', 'x-forwarded-for': xff },
        body: JSON.stringify(BODY),
      })
    for (let i = 0; i < MAX_UPLOADS_PER_HOUR; i++) expect((await handleApplicationUpload(spoofed(`10.0.0.${i}`), d)).status).toBe(200)
    expect((await handleApplicationUpload(spoofed('10.9.9.9'), d)).status).toBe(429)
  })

  it('answers 500 not_configured without a salt', async () => {
    const { d } = deps({ salt: '' })
    const res = await handleApplicationUpload(post(BODY), d)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'not_configured' })
  })

  it('counts against the same per-IP limiter as submit-application: the same salted daily hash, one less than the applications allowance', async () => {
    const { d, attempts } = deps()
    await handleApplicationUpload(post(BODY, '198.51.100.7'), d)
    expect(attempts).toEqual([await submitterHash('198.51.100.7', 'salt', '2026-11-05')])
    expect(MAX_UPLOADS_PER_HOUR).toBe(MAX_SUBMISSIONS_PER_HOUR - 1)
  })

  it('answers 429 rate_limited after the allowance and creates no URL; another address is not affected', async () => {
    const { d, created } = deps()
    for (let i = 0; i < MAX_UPLOADS_PER_HOUR; i++) expect((await handleApplicationUpload(post(BODY), d)).status).toBe(200)
    const res = await handleApplicationUpload(post(BODY), d)
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'rate_limited' })
    expect(created).toHaveLength(MAX_UPLOADS_PER_HOUR)
    expect((await handleApplicationUpload(post(BODY, '198.51.100.8'), d)).status).toBe(200)
  })

  it('passes the upload allowance to the limiter and includes yesterday\'s hash in the first hour after midnight UTC', async () => {
    const seen: { hashes: string[]; max: number }[] = []
    const { d } = deps({ now: () => new Date('2026-11-05T00:20:00Z'), allowAttempt: async (hashes, max) => (seen.push({ hashes, max }), true) })
    await handleApplicationUpload(post(BODY), d)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.max).toBe(MAX_UPLOADS_PER_HOUR)
    expect(seen[0]!.hashes).toEqual([await submitterHash('203.0.113.9', 'salt', '2026-11-05'), await submitterHash('203.0.113.9', 'salt', '2026-11-04')])
  })

  it('answers 500 unknown when the limiter or storage fails, without leaking the message', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      for (const over of [
        { allowAttempt: async () => { throw new Error('db down for ana@studio.test') } },
        { createUpload: async () => { throw new Error('storage down') } },
      ] satisfies Partial<UploadDeps>[]) {
        const res = await handleApplicationUpload(post(BODY), deps(over).d)
        expect(res.status).toBe(500)
        expect(await res.json()).toEqual({ error: 'unknown' })
      }
      expect(spy.mock.calls.flat().join(' ')).not.toContain('ana@studio.test')
    } finally {
      spy.mockRestore()
    }
  })
})
