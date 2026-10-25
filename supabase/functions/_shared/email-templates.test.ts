// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { renderEmail } from './email-templates'

describe('invitation email with a code (ADR-0027)', () => {
  it('shows the code in the HTML and text, in both languages, with a plain page link', () => {
    for (const lang of ['en', 'pt'] as const) {
      const e = renderEmail('owner_invitation', lang, { businessName: 'Casa', actionUrl: 'https://app.test/accept-invite?lang=' + lang, code: '48213907' })
      expect(e.html).toContain('48213907')
      expect(e.text).toContain('48213907')
      expect(e.text).toContain(lang === 'en' ? 'Your code: 48213907' : 'Seu código: 48213907')
      expect(e.html).not.toContain('/auth/v1/verify')
    }
  })

  it('refuses a code that is not 6 to 10 digits', () => {
    expect(() => renderEmail('owner_invitation', 'en', { code: '12ab5678' })).toThrow()
    expect(() => renderEmail('owner_invitation', 'en', { code: '<b>1</b>' })).toThrow()
  })
})

describe('team invitation email (ADR-0030)', () => {
  const data = { role: 'admin' as const, actionUrl: 'https://x.app/join#t=abc', expiresAt: '2026-11-01T12:00:00Z', note: '<b>hi</b>', inviterName: 'Owner' }

  it('names the role, lists what it can do, escapes the note and gives the expiry', () => {
    const e = renderEmail('team_invitation', 'en', data)
    expect(e.subject).toBe("You're invited to Sanctus")
    expect(e.html).toContain('as <strong>Admin</strong>')
    expect(e.html).toContain('Review and approve business applications')
    expect(e.html).toContain('&lt;b&gt;hi&lt;/b&gt;')
    expect(e.html).not.toContain('<b>hi</b>')
    expect(e.html).toContain('Accept invitation')
    expect(e.html).toContain('1 November 2026')
    expect(e.html).toContain('contact the platform owner')
    expect(e.text).toContain('https://x.app/join#t=abc')
  })

  it('refuses a note over 500 characters', () => {
    expect(() => renderEmail('team_invitation', 'en', { ...data, note: 'x'.repeat(501) })).toThrow()
  })
})
