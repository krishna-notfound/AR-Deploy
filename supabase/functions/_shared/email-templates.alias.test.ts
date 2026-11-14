// @vitest-environment node
// The two emails of the owner sign-in aliases (ADR-0077): the code sent to the new address, and the notice of a new primary.
import { describe, expect, it } from 'vitest'
import { aliasCodeEmail, securityCodeEmail, securityNoticeEmail } from './email-templates'

describe('alias code email', () => {
  it('shows the code, says what it is for and carries no link', () => {
    const e = aliasCodeEmail('135790')
    expect(e.subject).toBe('Your Sanctus code to add this sign-in email')
    expect(e.html).toContain('135790')
    expect(e.text).toContain('Your code: 135790')
    expect(e.text).toContain('expires in 10 minutes')
    expect(e.text).toContain('A sign-in email only signs in')
    expect(e.html).not.toContain('<a ')
    expect(e.text).not.toContain('http')
  })

  it('is not the wording of the account-holder code, and refuses anything but 6 digits', () => {
    expect(aliasCodeEmail('135790').subject).not.toBe(securityCodeEmail('135790').subject)
    expect(() => aliasCodeEmail('12345')).toThrow()
    expect(() => aliasCodeEmail('<b>1</b>')).toThrow()
  })
})

describe('primary email changed notice', () => {
  it('says the main email changed, that the old one still signs in, and who to contact; the link is the app only', () => {
    const e = securityNoticeEmail('primary_email_changed', 'https://app.sanctus.test')
    expect(e.subject).toBe('The main email of your Sanctus account changed')
    expect(e.text).toContain('The old address still signs in as a sign-in email')
    expect(e.text).toContain('If this was not you, contact the Sanctus team at once.')
    expect(e.text).toContain('Open Sanctus: https://app.sanctus.test')
  })
})
