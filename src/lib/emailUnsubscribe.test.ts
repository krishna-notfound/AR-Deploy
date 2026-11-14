import { describe, expect, it } from 'vitest'
import { emailTypeOfToken } from './emailUnsubscribe'

const payload = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

describe('emailTypeOfToken', () => {
  it('reads the type from a signed token payload (the signature is the server\'s to check)', () => {
    expect(emailTypeOfToken(`v1.${payload('11111111-2222-4333-8444-555555555555|business_notices|20405')}.sig`)).toBe('business_notices')
  })
  it('reads demo tokens', () => {
    expect(emailTypeOfToken('demo.new_application')).toBe('new_application')
    expect(emailTypeOfToken('demo.expired')).toBeNull()
  })
  it('is null for anything unreadable or unknown', () => {
    for (const t of [null, undefined, '', 'abc', 'v1.a.b', 'v2.a.b.c', `v1.${payload('u|nope|1')}.sig`, `v1.!!!.sig`, 'x'.repeat(400)]) expect(emailTypeOfToken(t)).toBeNull()
  })
})
