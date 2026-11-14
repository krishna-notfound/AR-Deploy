// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { type EmailPrefType, signUnsubscribeToken } from '../_shared/emailPrefs'
import { type UnsubscribeDeps, UNSUBSCRIBES_PER_HOUR, handleEmailUnsubscribe } from './handler'

const SECRET = 'unsub-secret'
const USER = '11111111-2222-4333-8444-555555555555'
const NOW = new Date('2026-11-14T10:00:00Z')
const URL_ = 'https://proj.supabase.co/functions/v1/email-unsubscribe'

function setup(over: Partial<UnsubscribeDeps> = {}) {
  const store = new Map<string, boolean>()
  const setPref = vi.fn(async (userId: string, type: EmailPrefType) => void store.set(`${userId}:${type}`, false))
  const allowAttempt = vi.fn(async () => true)
  const deps: UnsubscribeDeps = { secret: SECRET, salt: 'salt', now: () => NOW, allowAttempt, setPref, ...over }
  return { deps, store, setPref, allowAttempt }
}
const token = (type: EmailPrefType = 'new_application', at = NOW) => signUnsubscribeToken(SECRET, USER, type, at)
const post = (qs: string, body?: BodyInit, headers: Record<string, string> = {}) => new Request(`${URL_}${qs}`, { method: 'POST', body, headers: { 'cf-connecting-ip': '203.0.113.9', ...headers } })

describe('email-unsubscribe (ADR-0078)', () => {
  it('only accepts POST (a link scanner opening the URL changes nothing)', async () => {
    const { deps, setPref } = setup()
    const res = await handleEmailUnsubscribe(new Request(`${URL_}?t=${await token()}`, { method: 'GET' }), deps)
    expect(res.status).toBe(405)
    expect(setPref).not.toHaveBeenCalled()
  })

  it('answers the CORS preflight', async () => {
    expect((await handleEmailUnsubscribe(new Request(URL_, { method: 'OPTIONS' }), setup().deps)).status).toBe(204)
  })

  it('turns that one type off for the person in the token: the mail provider one-click POST (token in the URL)', async () => {
    const { deps, setPref } = setup()
    const res = await handleEmailUnsubscribe(post(`?t=${await token('business_notices')}`, 'List-Unsubscribe=One-Click', { 'content-type': 'application/x-www-form-urlencoded' }), deps)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, type: 'business_notices' })
    expect(setPref).toHaveBeenCalledExactlyOnceWith(USER, 'business_notices')
  })

  it('also takes the token in a JSON body: the page button', async () => {
    const { deps, setPref } = setup()
    const res = await handleEmailUnsubscribe(post('', JSON.stringify({ t: await token('new_model_request') }), { 'content-type': 'application/json' }), deps)
    expect(await res.json()).toEqual({ ok: true, type: 'new_model_request' })
    expect(setPref).toHaveBeenCalledWith(USER, 'new_model_request')
  })

  it('is idempotent: a second call still says ok', async () => {
    const { deps, store } = setup()
    const t = await token()
    for (let i = 0; i < 2; i++) expect((await handleEmailUnsubscribe(post(`?t=${t}`), deps)).status).toBe(200)
    expect(store.get(`${USER}:new_application`)).toBe(false)
  })

  it('rejects a tampered token with a safe reason code and changes nothing', async () => {
    const { deps, setPref } = setup()
    const t = await token()
    const res = await handleEmailUnsubscribe(post(`?t=${t.slice(0, -3)}abc`), deps)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_token' })
    expect(setPref).not.toHaveBeenCalled()
  })

  it('rejects an expired token (older than a year)', async () => {
    const { deps, setPref } = setup()
    const res = await handleEmailUnsubscribe(post(`?t=${await token('new_application', new Date('2025-10-01T00:00:00Z'))}`), deps)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'expired_token' })
    expect(setPref).not.toHaveBeenCalled()
  })

  it('rejects a missing token and a token signed with another secret', async () => {
    const { deps } = setup()
    expect((await handleEmailUnsubscribe(post(''), deps)).status).toBe(400)
    const other = await signUnsubscribeToken('other', USER, 'new_application', NOW)
    expect(await (await handleEmailUnsubscribe(post(`?t=${other}`), deps)).json()).toEqual({ error: 'invalid_token' })
  })

  it('is rate limited per caller, and every attempt counts, valid or not', async () => {
    const { deps, setPref, allowAttempt } = setup({ allowAttempt: vi.fn(async () => false) })
    const res = await handleEmailUnsubscribe(post(`?t=${await token()}`), deps)
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'rate_limited' })
    expect(setPref).not.toHaveBeenCalled()
    const ok = setup()
    await handleEmailUnsubscribe(post('?t=junk'), ok.deps)
    expect(ok.allowAttempt).toHaveBeenCalledTimes(1)
    expect(UNSUBSCRIBES_PER_HOUR).toBeGreaterThan(0)
    expect(allowAttempt).not.toHaveBeenCalled()
  })

  it('hashes the caller address instead of storing it', async () => {
    const { deps, allowAttempt } = setup()
    await handleEmailUnsubscribe(post('?t=junk'), deps)
    const hashes = (allowAttempt.mock.calls[0] as unknown as [string[]])[0]
    expect(hashes[0]).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(hashes)).not.toContain('203.0.113.9')
  })

  it('answers 500 with a fixed code when the preference cannot be saved, never database text', async () => {
    const { deps } = setup({ setPref: async () => { throw new Error('connection to db.internal refused') } })
    const res = await handleEmailUnsubscribe(post(`?t=${await token()}`), deps)
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('{"error":"unknown"}')
  })

  it('answers 500 not_configured without a secret', async () => {
    const res = await handleEmailUnsubscribe(post('?t=x'), setup({ secret: '' }).deps)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'not_configured' })
  })
})
