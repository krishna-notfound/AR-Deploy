import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountProvider } from '@/auth/AccountProvider'
import { SecurityGate } from '@/auth/SecurityGate'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { AccountService, AuthService } from '@/services'
import { RECOVERY, TOTP, fakeAccount, fakeAuth } from '@/test/securityFakes'
import LoginPage from './LoginPage'

// LoginPage, AccountProvider and SecurityGate read `auth` and `account` from '@/services': swap in fakes.
const fake = vi.hoisted(() => ({ auth: null as AuthService | null, account: null as AccountService | null }))
vi.mock('@/services', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/services')>()
  return {
    ...mod,
    get auth() {
      return fake.auth
    },
    get account() {
      return fake.account ?? mod.account
    },
  }
})

function Settings() {
  const { section } = useParams()
  return <p>Settings page: {section}</p>
}

function renderLogin() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/login']}>
        <AccountProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/demo" element={<p>Demo account picker</p>} />
            <Route path="/admin" element={<SecurityGate><p>Admin home</p></SecurityGate>} />
            <Route path="/admin/settings/:section" element={<SecurityGate><Settings /></SecurityGate>} />
          </Routes>
        </AccountProvider>
      </MemoryRouter>
    </ToastProvider>,
  )
}

async function signIn() {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Email'), 'ana@test')
  await user.type(screen.getByLabelText('Password'), 'right-password')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  return user
}

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  fake.auth = null
  fake.account = null
  vi.restoreAllMocks()
})

describe('Sign-in with 2FA (Supabase mode)', () => {
  it("after the password, a user with a verified factor sees 'Enter the 6-digit code from your authenticator app'; the right code continues to the dashboard", async () => {
    const { auth } = fakeAuth()
    const acc = fakeAccount({ factor: true, aal: 'aal1' })
    fake.auth = auth
    fake.account = acc.account
    renderLogin()
    const user = await signIn()

    expect(await screen.findByText('Enter the 6-digit code from your authenticator app')).toBeInTheDocument()
    expect(screen.queryByText('Admin home')).not.toBeInTheDocument()
    const field = screen.getByLabelText('6-digit code')
    expect(field).toHaveAttribute('inputmode', 'numeric')
    expect(field).toHaveAttribute('autocomplete', 'one-time-code')
    expect(field).toHaveAttribute('maxlength', '6')

    // A wrong code is refused and the step stays.
    await user.type(field, '000000')
    expect(await screen.findByRole('alert')).toHaveTextContent(/That code didn't match/)
    expect(screen.queryByText('Admin home')).not.toBeInTheDocument()

    // The right code submits itself at 6 digits.
    await user.type(screen.getByLabelText('6-digit code'), TOTP)
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
    expect(acc.impl.verifyTotpForSignIn).toHaveBeenLastCalledWith(TOTP)
    await waitFor(() => expect(acc.impl.recordSignIn).toHaveBeenCalledTimes(1))
  })

  it("Use a recovery code: a valid code signs in and lands on Security & 2FA with 'Your authenticator was removed. Set it up again.'", async () => {
    const { auth } = fakeAuth()
    const acc = fakeAccount({ factor: true, aal: 'aal1' })
    fake.auth = auth
    fake.account = acc.account
    renderLogin()
    const user = await signIn()

    await user.click(await screen.findByRole('button', { name: 'Use a recovery code' }))
    const field = screen.getByLabelText('Recovery code')
    await user.type(field, 'nope-nope')
    await user.click(screen.getByRole('button', { name: 'Sign in with recovery code' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/That recovery code didn't work/)

    await user.clear(field)
    await user.type(field, ` ${RECOVERY.toLowerCase()} `)
    await user.click(screen.getByRole('button', { name: 'Sign in with recovery code' }))
    expect(await screen.findByText('Settings page: security')).toBeInTheDocument()
    expect(screen.getByText('Your authenticator was removed. Set it up again.')).toBeInTheDocument()
    expect(acc.impl.redeemRecoveryCode).toHaveBeenLastCalledWith(RECOVERY.toLowerCase())
    // A recovery sign-in is a sign-in too.
    await waitFor(() => expect(acc.impl.recordSignIn).toHaveBeenCalledTimes(1))
  })

  it('a user without a factor goes straight to the dashboard', async () => {
    const { auth } = fakeAuth()
    const acc = fakeAccount({ factor: false })
    fake.auth = auth
    fake.account = acc.account
    renderLogin()
    await signIn()
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
    expect(screen.queryByText('Enter the 6-digit code from your authenticator app')).not.toBeInTheDocument()
  })

  it('the LoginPage outside Supabase mode is unchanged: it forwards to the demo account picker', async () => {
    fake.auth = null
    renderLogin()
    expect(await screen.findByText('Demo account picker')).toBeInTheDocument()
  })
})
