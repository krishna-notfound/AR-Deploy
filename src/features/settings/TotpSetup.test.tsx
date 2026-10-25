import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { account } from '@/services'
import { accountFail } from '@/services/accountService'
import { DEMO_CODE, resetMockAccount } from '@/services/mock/mockAccount'
import { TotpSetup, qrImageSrc } from './TotpSetup'

function renderSetup() {
  const onDone = vi.fn()
  render(
    <ToastProvider>
      <TotpSetup onDone={onDone} />
    </ToastProvider>,
  )
  return onDone
}

beforeEach(() => {
  localStorage.clear()
  resetMockAccount()
})

const originalUrl = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }

afterEach(() => {
  vi.restoreAllMocks()
  URL.createObjectURL = originalUrl.create
  URL.revokeObjectURL = originalUrl.revoke
})

describe('TotpSetup', () => {
  it("2FA off: Turn on shows the QR image, the setup key with Copy, and a 6-digit code field; a wrong code shows 'That code didn't match'", async () => {
    const user = userEvent.setup()
    renderSetup()
    const qr = await screen.findByRole('img', { name: 'QR code for your authenticator app' })
    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml;utf8,%3Csvg/)
    expect(screen.getByText('DEMO DEMO DEMO DEMO')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy key' })).toBeInTheDocument()
    const field = screen.getByLabelText('6-digit code')
    expect(field).toHaveAttribute('inputmode', 'numeric')
    expect(field).toHaveAttribute('autocomplete', 'one-time-code')

    await user.type(field, '000000')
    await user.click(screen.getByRole('button', { name: 'Verify and turn on' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/That code didn't match/)
    expect(screen.queryByRole('list', { name: 'Recovery codes' })).not.toBeInTheDocument()
  })

  it('refuses a code that is not 6 digits before sending it', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(account, 'confirmTotpEnrollment')
    renderSetup()
    await user.type(await screen.findByLabelText('6-digit code'), '12a')
    await user.click(screen.getByRole('button', { name: 'Verify and turn on' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the 6-digit code from your authenticator app.')
    expect(confirm).not.toHaveBeenCalled()
  })

  it("after a correct code, shows 8 recovery codes with Copy and Download; Done is disabled until 'I saved these codes' is ticked", async () => {
    const user = userEvent.setup()
    const generate = vi.spyOn(account, 'generateRecoveryCodes')
    const onDone = renderSetup()
    await user.type(await screen.findByLabelText('6-digit code'), DEMO_CODE)
    await user.click(screen.getByRole('button', { name: 'Verify and turn on' }))

    const list = await screen.findByRole('list', { name: 'Recovery codes' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(8)
    for (const li of items) expect(li.textContent).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/)
    // The first set needs no emailed code.
    expect(generate).toHaveBeenCalledWith()
    expect(screen.getByRole('button', { name: 'Copy codes' })).toBeInTheDocument()

    const createObjectURL = vi.fn((_b: Blob) => 'blob:recovery')
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await user.click(screen.getByRole('button', { name: 'Download .txt' }))
    expect(click).toHaveBeenCalledTimes(1)
    const downloaded = click.mock.contexts[0] as HTMLAnchorElement
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0]![0]
    expect(blob.type).toMatch(/^text\/plain/)
    expect(await blob.text()).toContain(items[0]!.textContent!)
    expect(downloaded.download).toMatch(/\.txt$/)
    expect(downloaded.href).toBe('blob:recovery')

    const done = screen.getByRole('button', { name: 'Done' })
    expect(done).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'I saved these codes' }))
    expect(done).toBeEnabled()
    await user.click(done)
    expect(onDone).toHaveBeenCalledTimes(1)
    // A done stage replaces the codes, which are shown only once.
    expect(screen.queryByRole('list', { name: 'Recovery codes' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '2FA is on' })).toHaveFocus()
  })

  it('focuses the code field when it appears, and again after a wrong code, which is announced', async () => {
    const user = userEvent.setup()
    renderSetup()
    const field = await screen.findByLabelText('6-digit code')
    expect(field).toHaveFocus()
    await user.type(field, '000000')
    await user.click(screen.getByRole('button', { name: 'Verify and turn on' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/That code didn't match/)
    expect(field).toHaveFocus()
    expect(field).toHaveAttribute('aria-invalid', 'true')
  })

  it('moves focus to the heading of each new stage', async () => {
    const user = userEvent.setup()
    renderSetup()
    await user.type(await screen.findByLabelText('6-digit code'), DEMO_CODE)
    await user.click(screen.getByRole('button', { name: 'Verify and turn on' }))
    expect(await screen.findByRole('heading', { name: 'Save your recovery codes' })).toHaveFocus()
  })

  it('accepts a pasted code with spaces and a dash', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(account, 'confirmTotpEnrollment')
    renderSetup()
    await user.click(await screen.findByLabelText('6-digit code'))
    await user.paste(' 123-456 ')
    await user.click(screen.getByRole('button', { name: 'Verify and turn on' }))
    expect(await screen.findByRole('list', { name: 'Recovery codes' })).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledWith(expect.any(String), DEMO_CODE)
  })

  it("MFA disabled in Supabase (enroll error mfa_not_enabled) shows '2FA is not available yet: an administrator must enable it'", async () => {
    vi.spyOn(account, 'startTotpEnrollment').mockResolvedValue(accountFail('mfa_not_enabled'))
    renderSetup()
    expect(await screen.findByText('2FA is not available yet: an administrator must enable it.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "2FA isn't available yet" })).toHaveFocus()
    expect(screen.queryByLabelText('6-digit code')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('another enrolment failure shows the message with Try again', async () => {
    const user = userEvent.setup()
    const start = vi.spyOn(account, 'startTotpEnrollment').mockResolvedValueOnce(accountFail('rate_limited'))
    renderSetup()
    expect(await screen.findByText('Too many requests. Wait a while and try again.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('img', { name: 'QR code for your authenticator app' })).toBeInTheDocument()
    expect(start).toHaveBeenCalledTimes(2)
  })

  it('2FA is on but the codes could not be created: says so, offers Try again and lets the person finish', async () => {
    const user = userEvent.setup()
    vi.spyOn(account, 'generateRecoveryCodes').mockResolvedValueOnce(accountFail('unknown'))
    const onDone = renderSetup()
    await user.type(await screen.findByLabelText('6-digit code'), DEMO_CODE)
    await user.click(screen.getByRole('button', { name: 'Verify and turn on' }))
    expect(await screen.findByText(/2FA is on, but we couldn't create your recovery codes/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finish without codes' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('list', { name: 'Recovery codes' })).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('builds the QR image from plain SVG, and unwraps the data URI that supabase-js returns instead of prefixing it twice', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'
    const expected = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
    expect(qrImageSrc(svg)).toBe(expected)
    expect(qrImageSrc(`data:image/svg+xml;utf-8,${svg}`)).toBe(expected)
    expect(qrImageSrc(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`)).toBe(expected)
  })
})
