// "Forgot password" (ADR-0027 codes, ADR-0066 hardening): the steps, the 2FA step, a signed-in visitor, an old or
// failed link, an expired reset, the recovery-pending flag and the address bar scrub. Services are fakes.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isRecoveryPending, markRecoveryPending } from '@/auth/recoveryPending'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { accountFail } from '@/services/accountService'
import { ok } from '@/services/catalogService'
import ResetPasswordPage, { RESET_RESEND_COOLDOWN_S } from './ResetPasswordPage'

const fake = vi.hoisted(() => ({
  reset: {
    requestCode: vi.fn(),
    verifyCode: vi.fn(),
    hasSession: vi.fn(),
    signOutHere: vi.fn(),
  },
  account: {
    getAssurance: vi.fn(),
    resetPassword: vi.fn(),
    verifyTotpForSignIn: vi.fn(),
    redeemRecoveryCode: vi.fn(),
  },
}))
vi.mock('@/services', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/services')>()
  return {
    ...mod,
    passwordReset: fake.reset,
    account: new Proxy(mod.account, { get: (target, key) => (key in fake.account ? fake.account[key as keyof typeof fake.account] : Reflect.get(target, key)) }),
  }
})

const NEW = 'a-long-new-password'

function renderPage(path = '/reset-password') {
  render(
    <LanguageProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/login" element={<p>Sign-in page</p>} />
            <Route path="/demo" element={<p>Sign-in page</p>} />
            <Route path="*" element={<p>Somewhere else</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </LanguageProvider>,
  )
  return userEvent.setup()
}

async function toCodeStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/^Email/), 'rui@test.pt')
  await user.click(screen.getByRole('button', { name: 'Send code' }))
  await user.type(await screen.findByLabelText(/^Code from the email/), '4821 3907')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}

async function choosePassword(user: ReturnType<typeof userEvent.setup>, password = NEW, repeat = password) {
  const field = await screen.findByLabelText('New password')
  await user.clear(field)
  await user.type(field, password)
  const again = screen.getByLabelText('Repeat new password')
  await user.clear(again)
  await user.type(again, repeat)
  await user.click(screen.getByRole('button', { name: 'Save new password' }))
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  sessionStorage.setItem('arfurn:lang', 'en')
  window.history.replaceState(null, '', '/reset-password')
  fake.reset.requestCode.mockResolvedValue(ok(undefined))
  fake.reset.verifyCode.mockResolvedValue(ok(undefined))
  fake.reset.hasSession.mockResolvedValue(ok(false))
  fake.reset.signOutHere.mockResolvedValue(ok(undefined))
  fake.account.getAssurance.mockResolvedValue(ok({ currentLevel: 'aal1', nextLevel: 'aal1' }))
  fake.account.resetPassword.mockResolvedValue(ok(undefined))
  fake.account.verifyTotpForSignIn.mockResolvedValue(ok(undefined))
  fake.account.redeemRecoveryCode.mockResolvedValue(ok(undefined))
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('ResetPasswordPage', () => {
  it('email → code → new password: the reset goes through account.resetPassword, then on to sign-in', { timeout: 30_000 }, async () => {
    const user = renderPage()
    await user.type(await screen.findByLabelText(/^Email/), 'rui@test.pt')
    await user.click(screen.getByRole('button', { name: 'Send code' }))
    expect(fake.reset.requestCode).toHaveBeenCalledWith('rui@test.pt')
    // The same words whether or not the address has an account.
    expect(await screen.findByText(/If an account uses rui@test\.pt, a code is on its way/)).toBeInTheDocument()
    // Supabase sends at most one email a minute per address: the page waits as long.
    expect(screen.getByRole('button', { name: `Send a new code (${RESET_RESEND_COOLDOWN_S} s)` })).toBeDisabled()

    await user.type(screen.getByLabelText(/^Code from the email/), '12')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(fake.reset.verifyCode).not.toHaveBeenCalled()
    await user.clear(screen.getByLabelText(/^Code from the email/))
    await user.type(screen.getByLabelText(/^Code from the email/), '4821-3907')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(fake.reset.verifyCode).toHaveBeenCalledWith('rui@test.pt', '48213907')
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
    expect(isRecoveryPending()).toBe(true)

    await choosePassword(user, 'too-short')
    expect(await screen.findByText('Use at least 12 characters.')).toBeInTheDocument()
    await choosePassword(user, 'x'.repeat(73))
    expect(await screen.findByText('Use at most 72 characters.')).toBeInTheDocument()
    await choosePassword(user, NEW, `${NEW}!`)
    expect(await screen.findByText('The passwords do not match.')).toBeInTheDocument()
    expect(fake.account.resetPassword).not.toHaveBeenCalled()

    await choosePassword(user)
    expect(fake.account.resetPassword).toHaveBeenCalledWith(NEW)
    expect(await screen.findByText('Sign-in page')).toBeInTheDocument()
    expect(await screen.findByText('Every device was signed out. Sign in with your new password.')).toBeInTheDocument()
    expect(isRecoveryPending()).toBe(false)
  })

  it('an account with 2FA enters its authenticator code before the new password (the reset never skips 2FA)', { timeout: 30_000 }, async () => {
    fake.account.getAssurance.mockResolvedValue(ok({ currentLevel: 'aal1', nextLevel: 'aal2' }))
    const user = renderPage()
    await toCodeStep(user)
    expect(await screen.findByRole('heading', { name: 'Confirm with your authenticator' })).toBeInTheDocument()
    expect(screen.queryByLabelText('New password')).toBeNull()
    await user.type(screen.getByLabelText(/6-digit code/), '123456')
    expect(fake.account.verifyTotpForSignIn).toHaveBeenCalledWith('123456')
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()

    // If the server still finds the session short of aal2, the page goes back to that step.
    fake.account.resetPassword.mockResolvedValueOnce(accountFail('aal2_required'))
    await choosePassword(user)
    expect(await screen.findByRole('heading', { name: 'Confirm with your authenticator' })).toBeInTheDocument()
  })

  it('an expired reset says so and starts over (signing this browser out)', { timeout: 30_000 }, async () => {
    fake.account.resetPassword.mockResolvedValue(accountFail('reset_expired'))
    const user = renderPage()
    await toCodeStep(user)
    await choosePassword(user)
    expect(await screen.findByText('This reset has expired. Request a new code and start again.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start again' }))
    expect(fake.reset.signOutHere).toHaveBeenCalled()
    expect(await screen.findByRole('heading', { name: 'Reset your password' })).toBeInTheDocument()
    expect(isRecoveryPending()).toBe(false)
  })

  it('someone already signed in (not from a reset code) is sent to Settings, not shown a password form', async () => {
    fake.reset.hasSession.mockResolvedValue(ok(true))
    const user = renderPage()
    expect(await screen.findByRole('heading', { name: 'You are signed in' })).toBeInTheDocument()
    expect(screen.queryByLabelText('New password')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Sign out and reset' }))
    expect(fake.reset.signOutHere).toHaveBeenCalled()
    expect(await screen.findByRole('heading', { name: 'Reset your password' })).toBeInTheDocument()
  })

  it('a reload in the middle of a reset continues at the new password', async () => {
    fake.reset.hasSession.mockResolvedValue(ok(true))
    markRecoveryPending()
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
  })

  it('a stale flag without a session is dropped', async () => {
    markRecoveryPending()
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Reset your password' })).toBeInTheDocument()
    expect(isRecoveryPending()).toBe(false)
  })

  it('an expired or used link shows a clear notice, and the address bar keeps no token or error', async () => {
    window.history.replaceState(null, '', '/reset-password?lang=en#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid')
    renderPage()
    expect(await screen.findByText(/That reset link is no longer valid/)).toBeInTheDocument()
    expect(window.location.hash).toBe('')
    expect(window.location.search).toBe('?lang=en')

    window.history.replaceState(null, '', '/reset-password#access_token=secret&refresh_token=secret2&type=recovery')
    renderPage()
    await waitFor(() => expect(window.location.href).not.toContain('secret'))
    expect(window.location.pathname).toBe('/reset-password')
  })

  it('a request error is shown in the visitor’s words', async () => {
    fake.reset.requestCode.mockResolvedValue({ ok: false, error: { code: 'UNKNOWN', message: 'raw', reason: 'over_request_rate_limit' } })
    const user = renderPage()
    await user.type(await screen.findByLabelText(/^Email/), 'rui@test.pt')
    await user.click(screen.getByRole('button', { name: 'Send code' }))
    expect(await screen.findByRole('alert')).not.toHaveTextContent('raw')
    expect(screen.queryByLabelText(/^Code from the email/)).toBeNull()
  })
})
