// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { EMAIL_PREF_COLUMN, EMAIL_PREF_TYPES, UNSUBSCRIBE_TOKEN_DAYS, emailPrefScope, emailWanted, signUnsubscribeToken, verifyUnsubscribeToken } from './emailPrefs'

const SECRET = 'test-unsubscribe-secret'
const USER = '11111111-2222-4333-8444-555555555555'
const NOW = new Date('2026-11-14T10:00:00Z')
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000)

describe('unsubscribe token (ADR-0078)', () => {
  it('signs and verifies user id and type', async () => {
    const token = await signUnsubscribeToken(SECRET, USER, 'new_application', NOW)
    expect(await verifyUnsubscribeToken(SECRET, token, NOW)).toEqual({ ok: true, userId: USER, type: 'new_application' })
  })

  it('is stable for the same day, so a retried email carries the same link', async () => {
    const a = await signUnsubscribeToken(SECRET, USER, 'business_notices', NOW)
    const b = await signUnsubscribeToken(SECRET, USER, 'business_notices', new Date('2026-11-14T23:59:00Z'))
    expect(a).toBe(b)
  })

  it('is valid for one year and then expired', async () => {
    const token = await signUnsubscribeToken(SECRET, USER, 'company_updates', NOW)
    expect((await verifyUnsubscribeToken(SECRET, token, days(UNSUBSCRIBE_TOKEN_DAYS))).ok).toBe(true)
    expect(await verifyUnsubscribeToken(SECRET, token, days(UNSUBSCRIBE_TOKEN_DAYS + 1))).toEqual({ ok: false, reason: 'expired_token' })
  })

  it('rejects a changed type, user, signature or secret', async () => {
    const token = await signUnsubscribeToken(SECRET, USER, 'new_application', NOW)
    const [v, payload, sig] = token.split('.') as [string, string, string]
    const forged = btoa(`${USER}|new_model_request|${Math.floor(NOW.getTime() / 86_400_000)}`).replace(/=+$/, '')
    expect((await verifyUnsubscribeToken(SECRET, `${v}.${forged}.${sig}`, NOW)).ok).toBe(false)
    expect((await verifyUnsubscribeToken(SECRET, `${v}.${payload}.${sig.slice(0, -2)}AA`, NOW)).ok).toBe(false)
    expect((await verifyUnsubscribeToken('another-secret', token, NOW)).ok).toBe(false)
    expect((await verifyUnsubscribeToken('', token, NOW)).ok).toBe(false)
  })

  it('rejects junk without throwing', async () => {
    for (const junk of ['', 'abc', 'v1.a.b', 'v2.a.b', 'v1..', 'x'.repeat(400), '🙂.🙂.🙂']) {
      expect(await verifyUnsubscribeToken(SECRET, junk, NOW)).toEqual({ ok: false, reason: 'invalid_token' })
    }
  })

  it('refuses to sign without a secret', async () => {
    await expect(signUnsubscribeToken('', USER, 'new_application', NOW)).rejects.toThrow()
  })
})

describe('email preference types', () => {
  it('has one notification_prefs column per type', () => {
    expect(EMAIL_PREF_TYPES.map((t) => EMAIL_PREF_COLUMN[t]).sort()).toEqual([
      'email_business_notices',
      'email_company_updates',
      'email_model_request_updates',
      'email_new_application',
      'email_new_model_request',
    ])
  })

  it('sends staff types to the console settings and owner types to the dashboard settings', () => {
    expect(emailPrefScope('new_application')).toBe('admin')
    expect(emailPrefScope('new_model_request')).toBe('admin')
    expect(emailPrefScope('company_updates')).toBe('admin')
    expect(emailPrefScope('model_request_updates')).toBe('business')
    expect(emailPrefScope('business_notices')).toBe('business')
  })
})

describe('the optional-email gate', () => {
  it('skips an email when the person turned that type off', async () => {
    const reader = vi.fn(async () => false)
    expect(await emailWanted(reader, USER, 'business_notices')).toBe(false)
    expect(reader).toHaveBeenCalledWith(USER, 'business_notices')
  })

  it('sends when the type is on, when there is no reader and when there is no user', async () => {
    expect(await emailWanted(async () => true, USER, 'new_application')).toBe(true)
    expect(await emailWanted(undefined, USER, 'new_application')).toBe(true)
    expect(await emailWanted(async () => false, null, 'new_application')).toBe(true)
  })

  it('lets a failed read reach the caller instead of guessing', async () => {
    await expect(emailWanted(async () => { throw new Error('prefs lookup failed') }, USER, 'new_application')).rejects.toThrow('prefs lookup failed')
  })
})
