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
