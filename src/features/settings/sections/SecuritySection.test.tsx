import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountProvider, ACCOUNT_KEY } from '@/auth/AccountProvider'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { SecurityState } from '@/domain/types'
import { account } from '@/services'
import { accountFail } from '@/services/accountService'
import { ok } from '@/services/catalogService'
import { DEMO_CODE, resetMockAccount } from '@/services/mock/mockAccount'
import SecuritySection from './SecuritySection'

function renderSection() {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <SecuritySection />
      </ConfirmProvider>
    </ToastProvider>,
  )
}

/** Turns 2FA on in the demo service (enrol, confirm, first recovery set), as the person would. */
async function enable2fa() {
  const e = await account.startTotpEnrollment()
  if (!e.ok) throw new Error('enrol failed')
  await account.confirmTotpEnrollment(e.data.factorId, DEMO_CODE)
  await account.generateRecoveryCodes()
}

const state = (patch: Partial<SecurityState>): SecurityState => ({
  requires2fa: false,
  aal: 'aal2',
  hasVerifiedFactor: true,
  recoveryCodesLeft: 8,
  pendingEmail: null,
  closure: null,
  onboarding: { completedAt: null, dismissedAt: null },
  ...patch,
})

const twoFactorCard = () => screen.getByRole('region', { name: 'Two-step verification (2FA)' })
const cardHeading = () => screen.getByRole('heading', { level: 2, name: 'Two-step verification (2FA)' })
/** Lets pending promises and the renders they cause settle. */
const settle = () => new Promise((r) => setTimeout(r, 0))

/** Types a code into the action-code dialog and confirms it (the dialog's contract: a code field and the confirm label). */
async function confirmWithCode(user: ReturnType<typeof userEvent.setup>, dialogName: string, confirmLabel: string) {
  const dialog = await screen.findByRole('dialog', { name: dialogName })
  await user.type(within(dialog).getByRole('textbox'), DEMO_CODE)
  await user.click(within(dialog).getByRole('button', { name: confirmLabel }))
}

beforeEach(() => {
  localStorage.clear()
  resetMockAccount()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Security & 2FA section', () => {
  it('shows a loading state, then an error with Try again when the state cannot be read', async () => {
    const user = userEvent.setup()
    const get = vi.spyOn(account, 'getSecurityState').mockResolvedValueOnce(accountFail('unknown'))
    renderSection()
    expect(screen.getByRole('status', { name: 'Loading security settings' })).toBeInTheDocument()
    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'Turn on 2FA' })).toBeInTheDocument()
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('2FA off: shows Off and Turn on; the setup ends with 2FA on', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(await screen.findByRole('button', { name: 'Turn on 2FA' }))
    expect(within(twoFactorCard()).getByText('Off')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'QR code for your authenticator app' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('6-digit code'), DEMO_CODE)
    await user.click(screen.getByRole('button', { name: 'Verify and turn on' }))
    await user.click(await screen.findByRole('checkbox', { name: 'I saved these codes' }))
    // 2FA is on from the accepted code, while the first recovery codes are still on screen.
    expect(within(twoFactorCard()).getByText('On')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByRole('button', { name: 'Turn off 2FA' })).toBeInTheDocument()
    expect(screen.getByText('2FA is on')).toBeInTheDocument()
    expect(within(twoFactorCard()).getByText('On')).toBeInTheDocument()
    expect(cardHeading()).toHaveFocus()
    expect(screen.getByText('8 of 8 recovery codes left')).toBeInTheDocument()
  })

  it('2FA off: Cancel leaves the setup', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(await screen.findByRole('button', { name: 'Turn on 2FA' }))
    await screen.findByRole('img', { name: 'QR code for your authenticator app' })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Turn on 2FA' })).toBeInTheDocument()
    expect(screen.queryByLabelText('6-digit code')).not.toBeInTheDocument()
    await waitFor(() => expect(cardHeading()).toHaveFocus())
  })

  it("2FA on: shows 'On', recovery codes left, Regenerate (action code), Turn off (action code)", async () => {
    const user = userEvent.setup()
    await enable2fa()
    const generate = vi.spyOn(account, 'generateRecoveryCodes')
    const disable = vi.spyOn(account, 'disable2fa')
    renderSection()
    await screen.findByRole('region', { name: 'Two-step verification (2FA)' })
    expect(within(twoFactorCard()).getByText('On')).toBeInTheDocument()
    expect(screen.getByText('8 of 8 recovery codes left')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Regenerate recovery codes' }))
    await confirmWithCode(user, 'Regenerate recovery codes', 'Regenerate codes')
    expect(generate).toHaveBeenCalledWith(DEMO_CODE)
    const list = await screen.findByRole('list', { name: 'Recovery codes' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(8)
    const done = screen.getByRole('button', { name: 'Done' })
    expect(done).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'I saved these codes' }))
    await user.click(done)
    expect(screen.queryByRole('list', { name: 'Recovery codes' })).not.toBeInTheDocument()
    expect(cardHeading()).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Turn off 2FA' }))
    await confirmWithCode(user, 'Turn off 2FA?', 'Turn off 2FA')
    expect(disable).toHaveBeenCalledWith(DEMO_CODE)
    expect(await screen.findByText('2FA is off')).toBeInTheDocument()
    expect(await within(twoFactorCard()).findByText('Off')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn on 2FA' })).toBeInTheDocument()
    await waitFor(() => expect(cardHeading()).toHaveFocus())
  })

  it('finishing setup keeps the card on while the state refreshes: Turn on never flashes back', async () => {
    const user = userEvent.setup()
    const real = account.getSecurityState
    renderSection()
    await user.click(await screen.findByRole('button', { name: 'Turn on 2FA' }))
    await user.type(await screen.findByLabelText('6-digit code'), DEMO_CODE)
    await user.click(screen.getByRole('button', { name: 'Verify and turn on' }))
    await user.click(await screen.findByRole('checkbox', { name: 'I saved these codes' }))

    let release: () => void = () => {}
    vi.spyOn(account, 'getSecurityState').mockImplementationOnce(
      () => new Promise((resolve) => {
        release = () => void real().then(resolve)
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await settle()
    expect(screen.queryByRole('button', { name: 'Turn on 2FA' })).not.toBeInTheDocument()
    expect(within(twoFactorCard()).getByText('On')).toBeInTheDocument()
    release()
    expect(await screen.findByRole('button', { name: 'Turn off 2FA' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn on 2FA' })).not.toBeInTheDocument()
  })

  it('regenerated codes stay on screen until Done; a failed refresh afterwards keeps the card and toasts', async () => {
    const user = userEvent.setup()
    await enable2fa()
    renderSection()
    await screen.findByRole('region', { name: 'Two-step verification (2FA)' })
    const get = vi.spyOn(account, 'getSecurityState').mockResolvedValue(accountFail('unknown'))

    await user.click(screen.getByRole('button', { name: 'Regenerate recovery codes' }))
    await confirmWithCode(user, 'Regenerate recovery codes', 'Regenerate codes')
    expect(await screen.findByRole('list', { name: 'Recovery codes' })).toBeInTheDocument()
    await settle()
    expect(get).not.toHaveBeenCalled()
    expect(screen.getByRole('list', { name: 'Recovery codes' })).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'I saved these codes' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByText("Couldn't refresh your security settings")).toBeInTheDocument()
    expect(get).toHaveBeenCalledTimes(1)
    expect(within(twoFactorCard()).getByText('On')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn off 2FA' })).toBeInTheDocument()
    expect(cardHeading()).toHaveFocus()
  })

  it('Turn off with a wrong code: the dialog stays open, no toast, still On', async () => {
    const user = userEvent.setup()
    await enable2fa()
    const disable = vi.spyOn(account, 'disable2fa').mockResolvedValue(accountFail('invalid_code'))
    renderSection()
    await user.click(await screen.findByRole('button', { name: 'Turn off 2FA' }))
    await confirmWithCode(user, 'Turn off 2FA?', 'Turn off 2FA')
    await waitFor(() => expect(disable).toHaveBeenCalledTimes(1))
    await settle()
    expect(screen.getByRole('dialog', { name: 'Turn off 2FA?' })).toBeInTheDocument()
    expect(screen.queryByText('2FA is off')).not.toBeInTheDocument()
    expect(within(twoFactorCard()).getByText('On')).toBeInTheDocument()
  })

  it('Regenerate with a refused code: the dialog stays open and no codes are shown', async () => {
    const user = userEvent.setup()
    await enable2fa()
    const generate = vi.spyOn(account, 'generateRecoveryCodes').mockResolvedValue(accountFail('code_expired'))
    renderSection()
    await user.click(await screen.findByRole('button', { name: 'Regenerate recovery codes' }))
    await confirmWithCode(user, 'Regenerate recovery codes', 'Regenerate codes')
    await waitFor(() => expect(generate).toHaveBeenCalledWith(DEMO_CODE))
    await settle()
    expect(screen.getByRole('dialog', { name: 'Regenerate recovery codes' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Recovery codes' })).not.toBeInTheDocument()
  })

  it("the downloaded codes name the signed-in account", async () => {
    const user = userEvent.setup()
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'business_admin', businessId: 'biz_casa' }))
    await enable2fa()
    render(
      <AccountProvider>
        <ToastProvider>
          <ConfirmProvider>
            <SecuritySection />
          </ConfirmProvider>
        </ToastProvider>
      </AccountProvider>,
    )
    await user.click(await screen.findByRole('button', { name: 'Regenerate recovery codes' }))
    await confirmWithCode(user, 'Regenerate recovery codes', 'Regenerate codes')
    await screen.findByRole('list', { name: 'Recovery codes' })
    const createObjectURL = vi.fn((_b: Blob) => 'blob:codes')
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      await user.click(screen.getByRole('button', { name: 'Download .txt' }))
      expect(await createObjectURL.mock.calls[0]![0].text()).toMatch(/Account: \S+@\S+/)
    } finally {
      URL.createObjectURL = original.create
      URL.revokeObjectURL = original.revoke
    }
  })

  it("Turn off when the policy requires 2FA shows 'Your organisation requires 2FA' and no button", async () => {
    vi.spyOn(account, 'getSecurityState').mockResolvedValue(ok(state({ requires2fa: true })))
    renderSection()
    expect(await screen.findByText(/Your organisation requires 2FA/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn off 2FA' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Regenerate recovery codes' })).toBeInTheDocument()
  })

  it('2FA on but this session is not at aal2: explains, and offers no action that would be refused', async () => {
    vi.spyOn(account, 'getSecurityState').mockResolvedValue(ok(state({ aal: 'aal1' })))
    renderSection()
    expect(await screen.findByText(/sign out and sign in again with your authenticator code/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn off 2FA' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Regenerate recovery codes' })).not.toBeInTheDocument()
  })

  it('warns when no recovery codes are left', async () => {
    vi.spyOn(account, 'getSecurityState').mockResolvedValue(ok(state({ recoveryCodesLeft: 0 })))
    renderSection()
    expect(await screen.findByText('No recovery codes left')).toBeInTheDocument()
  })

  it('Sign out other devices confirms, then toasts', async () => {
    const user = userEvent.setup()
    const signOut = vi.spyOn(account, 'signOutOtherDevices')
    renderSection()
    await user.click(await screen.findByRole('button', { name: 'Sign out other devices' }))
    const dialog = await screen.findByRole('dialog', { name: 'Sign out other devices?' })
    expect(signOut).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Sign out other devices' }))
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Other devices were signed out')).toBeInTheDocument()
  })

  it('Sign out other devices: a failure toasts the message', async () => {
    const user = userEvent.setup()
    vi.spyOn(account, 'signOutOtherDevices').mockResolvedValue(accountFail('unknown'))
    renderSection()
    await user.click(await screen.findByRole('button', { name: 'Sign out other devices' }))
    const dialog = await screen.findByRole('dialog', { name: 'Sign out other devices?' })
    await user.click(within(dialog).getByRole('button', { name: 'Sign out other devices' }))
    expect(await screen.findByText("Couldn't sign out other devices")).toBeInTheDocument()
  })
})
