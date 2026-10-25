import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { AccountService, AuthService } from '@/services'
import { fail } from '@/services/catalogService'
import { ADMIN, TOTP, fakeAccount, fakeAuth } from '@/test/securityFakes'
import { ACCOUNT_KEY, AccountProvider, useAccount } from './AccountProvider'
import { SecurityGate } from './SecurityGate'

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

function SignOutProbe() {
  const { user, logout } = useAccount()
  return (
    <>
      <p>signed in: {user ? user.name : String(user)}</p>
      <button type="button" onClick={() => void logout()}>
        probe sign out
      </button>
    </>
  )
}

function renderGate(path = '/admin') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <AccountProvider>
          <Routes>
            <Route path="/admin" element={<SecurityGate><p>Admin home</p></SecurityGate>} />
            <Route path="/admin/settings/:section" element={<SecurityGate><p>Settings page</p></SecurityGate>} />
            <Route path="/login" element={<p>Sign-in page</p>} />
            <Route path="/demo" element={<p>Demo account picker</p>} />
            <Route path="/probe" element={<SignOutProbe />} />
          </Routes>
        </AccountProvider>
      </MemoryRouter>
    </ToastProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  fake.auth = null
  fake.account = null
  vi.restoreAllMocks()
})

describe('SecurityGate', () => {
  it('shows the 2FA gate when my_security_state requires 2FA at aal1', async () => {
    const { auth } = fakeAuth(ADMIN)
    const acc = fakeAccount({ requires2fa: true, factor: false, aal: 'aal1' })
    fake.auth = auth
    fake.account = acc.account
    renderGate()

    expect(await screen.findByRole('heading', { level: 1, name: 'Set up 2FA to continue' })).toBeInTheDocument()
    expect(screen.queryByText('Admin home')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    // The setup flow is TotpSetup: scan, confirm, save the recovery codes, then the app opens.
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('6-digit code'), TOTP)
    await user.click(screen.getByRole('button', { name: 'Verify and turn on' }))
    // The session is aal2 now, but the gate stays until the recovery codes are saved.
    expect(await screen.findByText('AAAAA-AAAAA')).toBeInTheDocument()
    expect(screen.queryByText('Admin home')).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
  })

  it('the gate covers the settings routes too, and Sign out leaves', async () => {
    const { auth } = fakeAuth(ADMIN)
    fake.auth = auth
    fake.account = fakeAccount({ requires2fa: true }).account
    renderGate('/admin/settings/security')
    expect(await screen.findByRole('heading', { level: 1, name: 'Set up 2FA to continue' })).toBeInTheDocument()
    expect(screen.queryByText('Settings page')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }))
    // This build's sign-in page (the demo picker in tests, /login in a Supabase build).
    expect(await screen.findByText('Demo account picker')).toBeInTheDocument()
    expect(auth.signOut).toHaveBeenCalled()
  })

  it('a session at aal1 with a verified factor (a reload mid sign-in) gets the code step, not the setup gate', async () => {
    const { auth } = fakeAuth(ADMIN)
    const acc = fakeAccount({ requires2fa: true, factor: true, aal: 'aal1' })
    fake.auth = auth
    fake.account = acc.account
    renderGate()
    expect(await screen.findByText('Enter the 6-digit code from your authenticator app')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Set up 2FA to continue' })).not.toBeInTheDocument()
    await userEvent.setup().type(screen.getByLabelText('6-digit code'), TOTP)
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
  })

  it('lets the app through when 2FA is not required, or the session is already aal2', async () => {
    const { auth } = fakeAuth(ADMIN)
    fake.auth = auth
    fake.account = fakeAccount({ requires2fa: false }).account
    const first = renderGate()
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
    first.unmount()

    fake.account = fakeAccount({ requires2fa: true, factor: true, aal: 'aal2' }).account
    renderGate()
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
  })

  it('a failed security check is reported with a retry, never silently skipped', async () => {
    const { auth } = fakeAuth(ADMIN)
    const acc = fakeAccount({ requires2fa: false })
    vi.mocked(acc.impl.getSecurityState!).mockResolvedValueOnce(fail('UNKNOWN', 'Database unavailable'))
    fake.auth = auth
    fake.account = acc.account
    renderGate()
    expect(await screen.findByText(/Database unavailable/)).toBeInTheDocument()
    expect(screen.queryByText('Admin home')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
  })

  it('demo mode: the gate is a no-op while the demo policy is off', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
    renderGate()
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
  })
})

describe('Sign-in recording', () => {
  it('records the sign-in once per sign-in', async () => {
    // A page load with an existing session is not a sign-in, nor is a token refresh.
    const { auth, emit, setSession } = fakeAuth(ADMIN)
    const acc = fakeAccount()
    fake.auth = auth
    fake.account = acc.account
    renderGate('/probe')
    expect(await screen.findByText('signed in: Ana')).toBeInTheDocument()
    await emit() // TOKEN_REFRESHED
    await waitFor(() => expect(acc.impl.getSecurityState).toHaveBeenCalledTimes(2))
    expect(acc.impl.recordSignIn).not.toHaveBeenCalled()

    // Signed out, then a real sign-in (SIGNED_IN) followed by more auth events: one record.
    await userEvent.setup().click(screen.getByRole('button', { name: 'probe sign out' }))
    expect(await screen.findByText('signed in: null')).toBeInTheDocument()
    setSession(ADMIN)
    await emit()
    expect(await screen.findByText('signed in: Ana')).toBeInTheDocument()
    await waitFor(() => expect(acc.impl.recordSignIn).toHaveBeenCalledTimes(1))
    await emit()
    await emit()
    await waitFor(() => expect(acc.impl.getSecurityState).toHaveBeenCalledTimes(5))
    expect(acc.impl.recordSignIn).toHaveBeenCalledTimes(1)
  })

  it('a sign-in that still needs the authenticator code is recorded only once the code is accepted', async () => {
    const { auth, emit, setSession } = fakeAuth(null)
    const acc = fakeAccount({ factor: true, aal: 'aal1' })
    fake.auth = auth
    fake.account = acc.account
    renderGate()
    await waitFor(() => expect(auth.getCurrentUser).toHaveBeenCalled())
    setSession(ADMIN)
    await emit()
    expect(await screen.findByText('Enter the 6-digit code from your authenticator app')).toBeInTheDocument()
    expect(acc.impl.recordSignIn).not.toHaveBeenCalled()
    await userEvent.setup().type(screen.getByLabelText('6-digit code'), TOTP)
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
    await waitFor(() => expect(acc.impl.recordSignIn).toHaveBeenCalledTimes(1))
  })
})
