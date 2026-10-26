// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { applicationDecisionEmail, renderEmail } from './email-templates'

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

describe('application emails (S1.5 Task 4, R-W2-1, §11.2)', () => {
  it("the confirmation email says 'If we approve it, you will receive an invitation to set up your catalog. If we can't, we will tell you by email.' (EN) and the PT line", () => {
    const en = renderEmail('application_confirmation', 'en')
    expect(en.text).toContain("If we approve it, you will receive an invitation to set up your catalog. If we can't, we will tell you by email.")
    expect(en.text).not.toContain('We will email you when')
    const pt = renderEmail('application_confirmation', 'pt')
    expect(pt.text).toContain('Se for aprovada, receberá um convite para configurar o seu catálogo. Se não for possível, informamos por email.')
    expect(pt.text).not.toContain('Enviaremos um e-mail quando')
  })

  it('the decision email has the §11.2 copy in both languages, and the reason line only when given', () => {
    const en = applicationDecisionEmail('en', 'Casa')
    expect(en.subject).toBe('Your Sanctus application for Casa')
    expect(en.text).toContain('Thank you for applying to list Casa on Sanctus. After review, we are not able to approve this application.')
    expect(en.text).toContain('You are welcome to apply again if your situation changes.')
    expect(en.text).not.toContain('Reason:')
    expect(applicationDecisionEmail('en', 'Casa', 'Too small').text).toContain('Reason: Too small')
    const pt = applicationDecisionEmail('pt', 'Casa', 'Pequena')
    expect(pt.subject).toBe('A sua candidatura à Sanctus para Casa')
    expect(pt.text).toContain('Motivo: Pequena')
    expect(pt.text).toContain('Pode candidatar-se novamente se a sua situação mudar.')
  })

  it('escapes the business name and the reason in the HTML', () => {
    const e = applicationDecisionEmail('en', 'A <i>B</i>', 'x <b>y</b>\nz')
    expect(e.html).not.toContain('<i>B</i>')
    expect(e.html).not.toContain('<b>y</b>')
    expect(e.html).toContain('A &lt;i&gt;B&lt;/i&gt;')
    expect(e.text).toContain('Reason: x <b>y</b>\nz')
  })

  it('refuses a reason over 1000 characters', () => {
    expect(() => applicationDecisionEmail('en', 'Casa', 'x'.repeat(1001))).toThrow()
    expect(() => applicationDecisionEmail('en', 'Casa', 'x'.repeat(1000))).not.toThrow()
  })
})
