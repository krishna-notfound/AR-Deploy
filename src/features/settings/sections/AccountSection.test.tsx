import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { SIGN_IN_PATH } from '@/auth/RequireRole'
import { account, service } from '@/services'
import { accountFail } from '@/services/accountService'
import { DEMO_CODE, resetMockAccount } from '@/services/mock/mockAccount'

type As = { role: 'super_admin'; platformRole?: 'owner' | 'admin' | 'team' } | { role: 'business_admin'; businessId: string }

const BUSINESS: As = { role: 'business_admin', businessId: 'biz_casa' }

function open(as: As, url: string) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(as))
  window.history.replaceState(null, '', url)
  return render(<App />)
}

const card = (name: string) => screen.getByRole('region', { name })

beforeAll(async () => {
  await Promise.all([
    import('@/features/settings/SettingsSectionPage'),
    import('@/features/settings/sections/AccountSection'),
    import('@/features/business/BusinessOverviewPage'),
    import('@/features/demo/DemoEntryPage'),
  ])
}, 60_000)

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  resetMockAccount()
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('My account section', () => {
  it("change email: wrong password shows 'Password is incorrect'; success shows the pending banner with the new address, Resend and Cancel", { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    const request = vi.spyOn(account, 'requestEmailChange').mockResolvedValueOnce(accountFail('password_incorrect'))
    open(BUSINESS, '/dashboard/settings/account')
    await screen.findByRole('heading', { level: 1, name: 'My account' })
    const email = await screen.findByLabelText('New email')
    expect(email).toHaveAttribute('type', 'email')
    const password = within(card('Email')).getByLabelText('Current password')
    expect(password).toHaveAttribute('autocomplete', 'current-password')

    await user.type(email, 'new@studio.example')
    await user.type(password, 'wrong-password')
    await user.click(within(card('Email')).getByRole('button', { name: 'Change email' }))
    expect(await within(card('Email')).findByText(/Password is incorrect/)).toBeInTheDocument()
    expect(request).toHaveBeenLastCalledWith('wrong-password', 'new@studio.example')

    await user.clear(password)
    await user.type(password, 'the-right-password')
    await user.click(within(card('Email')).getByRole('button', { name: 'Change email' }))
    const banner = await within(card('Email')).findByRole('status')
    expect(banner).toHaveTextContent('new@studio.example')
    expect(within(banner).getByRole('button', { name: 'Resend' })).toBeInTheDocument()
    await user.click(within(banner).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(within(card('Email')).queryByRole('status')).toBeNull())
  })

  it("change password: under 12 characters is refused before sending; mismatch confirm is refused; success toasts 'Password changed. Other devices were signed out.'", { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    const change = vi.spyOn(account, 'changePassword')
    open(BUSINESS, '/dashboard/settings/account')
    await screen.findByRole('heading', { level: 1, name: 'My account' })
    const pw = card('Password')
    const current = within(pw).getByLabelText('Current password')
    const next = within(pw).getByLabelText('New password')
    const confirm = within(pw).getByLabelText('Confirm new password')
    expect(current).toHaveAttribute('autocomplete', 'current-password')
    expect(next).toHaveAttribute('autocomplete', 'new-password')
    expect(confirm).toHaveAttribute('autocomplete', 'new-password')

    await user.type(current, 'old-password-123')
    await user.type(next, 'short')
    expect(within(pw).getByText(/7 more characters needed/)).toBeInTheDocument()
    await user.type(confirm, 'short')
    await user.click(within(pw).getByRole('button', { name: 'Change password' }))
    expect(await within(pw).findByText('Use at least 12 characters.')).toBeInTheDocument()
    expect(change).not.toHaveBeenCalled()

    await user.clear(next)
    await user.type(next, 'a-much-longer-password')
    await user.clear(confirm)
    await user.type(confirm, 'a-different-password')
    await user.click(within(pw).getByRole('button', { name: 'Change password' }))
    expect(await within(pw).findByText("The passwords don't match.")).toBeInTheDocument()
    expect(change).not.toHaveBeenCalled()

    await user.clear(confirm)
    await user.type(confirm, 'a-much-longer-password')
    await user.click(within(pw).getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('Password changed. Other devices were signed out.')).toBeInTheDocument()
    expect(change).toHaveBeenCalledWith('old-password-123', 'a-much-longer-password')
    expect(within(pw).getByLabelText('New password')).toHaveValue('')
  })

  it("business owner: Request closure explains the effect, then opens the action-code dialog; afterwards shows 'Closure requested' with Cancel request", { timeout: 30_000 }, async () => {
    const user = userEvent.setup()
    const first = open(BUSINESS, '/dashboard/settings/account')
    await screen.findByRole('heading', { level: 1, name: 'My account' })
    await user.click(await within(card('Close your account')).findByRole('button', { name: 'Request closure' }))

    const explain = await screen.findByRole('dialog', { name: 'Request closure?' })
    expect(explain).toHaveTextContent('Your catalog goes offline now')
    expect(explain).toHaveTextContent('within 30 days')
    expect(explain).toHaveTextContent('cancel')
    await user.click(within(explain).getByRole('button', { name: 'Continue' }))

    const codeDialog = await screen.findByRole('dialog', { name: 'Confirm closure request' })
    expect(await within(codeDialog).findByText(/We emailed a 6-digit code to/)).toBeInTheDocument()
    await user.type(within(codeDialog).getByLabelText('6-digit code'), DEMO_CODE)
    await user.click(within(codeDialog).getByRole('button', { name: 'Request closure' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const closing = card('Close your account')
    expect(await within(closing).findByText(/Closure requested on/)).toBeInTheDocument()
    expect(within(closing).getByRole('button', { name: 'Cancel request' })).toBeInTheDocument()
    first.unmount()

    // Overview shows the same banner, and cancelling there withdraws the request.
    open(BUSINESS, '/dashboard')
    const banner = await screen.findByText(/Closure requested on .* · Your catalog is offline\./, {}, { timeout: 10_000 })
    const region = banner.closest('[role="status"]') as HTMLElement
    await user.click(within(region).getByRole('button', { name: 'Cancel request' }))
    await waitFor(() => expect(screen.queryByText(/Closure requested on/)).toBeNull())
    const state = await account.getSecurityState()
    expect(state.ok && state.data.closure).toBeNull()
  })

  it.each(['admin', 'team'] as const)("Admin and Team (%s): Delete account confirms, then signs out to /login with 'Your account was deleted'", { timeout: 30_000 }, async (platformRole) => {
    const user = userEvent.setup()
    open({ role: 'super_admin', platformRole }, '/admin/settings/account')
    await screen.findByRole('heading', { level: 1, name: 'My account' })
    await user.click(await within(card('Delete account')).findByRole('button', { name: 'Delete account' }))

    const explain = await screen.findByRole('dialog', { name: 'Delete your account?' })
    await user.click(within(explain).getByRole('button', { name: 'Continue' }))
    const codeDialog = await screen.findByRole('dialog', { name: 'Confirm account deletion' })
    await within(codeDialog).findByText(/We emailed a 6-digit code to/)
    await user.type(within(codeDialog).getByLabelText('6-digit code'), DEMO_CODE)
    await user.click(within(codeDialog).getByRole('button', { name: 'Delete account' }))

    expect(await screen.findByText('Your account was deleted')).toBeInTheDocument()
    await waitFor(() => expect(localStorage.getItem(ACCOUNT_KEY)).toBeNull())
    await waitFor(() => expect(window.location.pathname).toBe(SIGN_IN_PATH))
    // Signed out: going back to settings asks for an account again.
    expect(screen.queryByRole('heading', { level: 1, name: 'My account' })).toBeNull()
  })

  it('Owner: no delete button; explains the platform needs its Owner', { timeout: 20_000 }, async () => {
    open({ role: 'super_admin' }, '/admin/settings/account')
    await screen.findByRole('heading', { level: 1, name: 'My account' })
    const closing = await screen.findByRole('region', { name: 'Delete account' })
    expect(closing).toHaveTextContent('The platform needs its Owner')
    expect(within(closing).queryByRole('button')).toBeNull()
    expect(screen.queryByRole('button', { name: /Delete account|Request closure/ })).toBeNull()
  })

  it('staff deletion with a wrong code: the dialog stays open with the error and nobody is signed out', { timeout: 30_000 }, async () => {
    const user = userEvent.setup()
    const request = vi.spyOn(account, 'requestClosure')
    open({ role: 'super_admin', platformRole: 'admin' }, '/admin/settings/account')
    await screen.findByRole('heading', { level: 1, name: 'My account' })
    await user.click(await within(card('Delete account')).findByRole('button', { name: 'Delete account' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Delete your account?' })).getByRole('button', { name: 'Continue' }))
    const codeDialog = await screen.findByRole('dialog', { name: 'Confirm account deletion' })
    await within(codeDialog).findByText(/We emailed a 6-digit code to/)
    await user.type(within(codeDialog).getByLabelText('6-digit code'), '000000')
    await user.click(within(codeDialog).getByRole('button', { name: 'Delete account' }))

    expect(await within(codeDialog).findByText("That code isn't right. Check it and try again.")).toBeInTheDocument()
    expect(request).toHaveBeenCalledWith('000000')
    expect(screen.getByRole('dialog', { name: 'Confirm account deletion' })).toBeInTheDocument()
    expect(screen.queryByText('Your account was deleted')).toBeNull()
    expect(localStorage.getItem(ACCOUNT_KEY)).not.toBeNull()
    expect(window.location.pathname).toBe('/admin/settings/account')
  })

  it('change password: current_password_mismatch shows on the current field, same_password on the new field', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    vi.spyOn(account, 'changePassword').mockResolvedValueOnce(accountFail('current_password_mismatch')).mockResolvedValueOnce(accountFail('same_password'))
    open(BUSINESS, '/dashboard/settings/account')
    await screen.findByRole('heading', { level: 1, name: 'My account' })
    const pw = card('Password')
    const current = within(pw).getByLabelText('Current password')
    const next = within(pw).getByLabelText('New password')
    await user.type(current, 'old-password-123')
    await user.type(next, 'a-much-longer-password')
    await user.type(within(pw).getByLabelText('Confirm new password'), 'a-much-longer-password')

    await user.click(within(pw).getByRole('button', { name: 'Change password' }))
    await waitFor(() => expect(current).toHaveAccessibleDescription('Your current password is incorrect.'))
    expect(next).not.toHaveAttribute('aria-invalid')

    await user.click(within(pw).getByRole('button', { name: 'Change password' }))
    await waitFor(() => expect(next).toHaveAccessibleDescription('Choose a password different from your current one.'))
    expect(current).not.toHaveAttribute('aria-invalid')
  })

  it('change email: email_taken shows on the email field, rate_limited as a form message', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    vi.spyOn(account, 'requestEmailChange').mockResolvedValueOnce(accountFail('email_taken')).mockResolvedValueOnce(accountFail('rate_limited'))
    open(BUSINESS, '/dashboard/settings/account')
    await screen.findByRole('heading', { level: 1, name: 'My account' })
    const emailCard = card('Email')
    const email = await within(emailCard).findByLabelText('New email')
    await user.type(email, 'taken@studio.example')
    await user.type(within(emailCard).getByLabelText('Current password'), 'the-right-password')

    await user.click(within(emailCard).getByRole('button', { name: 'Change email' }))
    await waitFor(() => expect(email).toHaveAccessibleDescription('This email is already used by another account.'))

    await user.click(within(emailCard).getByRole('button', { name: 'Change email' }))
    expect(await within(emailCard).findByRole('alert')).toHaveTextContent('Too many requests. Wait a while and try again.')
    expect(email).not.toHaveAttribute('aria-invalid')
    expect(within(emailCard).queryByRole('status')).toBeNull()
  })

  it('closure cancel refused (aal2_required): an error toast, and the banner stays in settings and on Overview', { timeout: 30_000 }, async () => {
    const user = userEvent.setup()
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(BUSINESS))
    expect((await account.requestClosure(DEMO_CODE)).ok).toBe(true)
    const cancel = vi.spyOn(account, 'cancelClosure').mockResolvedValue(accountFail('aal2_required'))

    const first = open(BUSINESS, '/dashboard/settings/account')
    await screen.findByRole('heading', { level: 1, name: 'My account' })
    const closing = card('Close your account')
    await user.click(await within(closing).findByRole('button', { name: 'Cancel request' }))
    expect(await screen.findByText("Couldn't cancel the closure request")).toBeInTheDocument()
    expect(screen.getByText('This needs 2FA. Sign in with your authenticator code first.')).toBeInTheDocument()
    expect(within(closing).getByText(/Closure requested on/)).toBeInTheDocument()
    first.unmount()

    open(BUSINESS, '/dashboard')
    const banner = (await screen.findByText(/Closure requested on .* · Your catalog is offline\./, {}, { timeout: 10_000 })).closest('[role="status"]') as HTMLElement
    await user.click(within(banner).getByRole('button', { name: 'Cancel request' }))
    expect(await screen.findByText("Couldn't cancel the closure request")).toBeInTheDocument()
    expect(screen.getByText(/Closure requested on .* · Your catalog is offline\./)).toBeInTheDocument()
    expect(cancel).toHaveBeenCalledTimes(2)
  })
})
