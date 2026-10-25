import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountProvider } from '@/auth/AccountProvider'
import { RequireRole } from '@/auth/RequireRole'
import { SecurityGate } from '@/auth/SecurityGate'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { Business } from '@/domain/types'
import { type AccountService, type AuthService, service } from '@/services'
import { accountFail } from '@/services/accountService'
import { fail, ok } from '@/services/catalogService'
import { ADMIN, DRAFT_OWNER, RECOVERY, TOTP, fakeAccount, fakeAuth } from '@/test/securityFakes'
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

function renderLogin(path = '/login') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <AccountProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/demo" element={<p>Demo account picker</p>} />
            <Route path="/admin" element={<RequireRole allow="super_admin"><SecurityGate><p>Admin home</p></SecurityGate></RequireRole>} />
            <Route path="/admin/settings/:section" element={<RequireRole allow="super_admin"><SecurityGate><Settings /></SecurityGate></RequireRole>} />
            <Route path="/dashboard" element={<RequireRole allow="business_admin"><SecurityGate><p>Business home</p></SecurityGate></RequireRole>} />
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

function setup(start: Parameters<typeof fakeAccount>[0], session: Parameters<typeof fakeAuth>[0] = null, signsInAs = ADMIN) {
  const a = fakeAuth(session, signsInAs)
  const acc = fakeAccount(start)
  fake.auth = a.auth
  fake.account = acc.account
  return { ...a, ...acc }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  fake.auth = null
  fake.account = null
  vi.restoreAllMocks()
})

describe('Sign-in with 2FA (Supabase mode)', () => {
  it("after the password, a user with a verified factor sees 'Enter the 6-digit code from your authenticator app'; the right code continues to the dashboard", async () => {
    const acc = setup({ factor: true, aal: 'aal1' })
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

  it('shows a verify error other than a wrong code in its own words (rate_limited)', async () => {
    const acc = setup({ factor: true, aal: 'aal1' })
    vi.mocked(acc.impl.verifyTotpForSignIn!).mockResolvedValueOnce(accountFail('rate_limited'))
    renderLogin()
    const user = await signIn()
    await user.type(await screen.findByLabelText('6-digit code'), TOTP)
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests. Wait a while and try again.')
    // The step is usable again: the next code goes through.
    await user.type(screen.getByLabelText('6-digit code'), TOTP)
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
  })

  it('the code step follows the assurance level, not the policy state; an unknown level with a factor still asks', async () => {
    // my_security_state says aal2, but the session itself is aal1 with a factor: ask for the code.
    const acc = setup({ factor: true, aal: 'aal1' })
    vi.mocked(acc.impl.getSecurityState!).mockImplementation(async () =>
      ok({ requires2fa: false, aal: 'aal2', hasVerifiedFactor: true, recoveryCodesLeft: 8, pendingEmail: null, closure: null, onboarding: { completedAt: null, dismissedAt: null } }),
    )
    const first = renderLogin()
    await signIn()
    expect(await screen.findByText('Enter the 6-digit code from your authenticator app')).toBeInTheDocument()
    first.unmount()

    // The assurance level can't be read: with a factor, fail toward asking for the code.
    const again = setup({ factor: true, aal: 'aal1' }, ADMIN)
    vi.mocked(again.impl.getAssurance!).mockResolvedValue(accountFail('unknown'))
    renderLogin()
    expect(await screen.findByText('Enter the 6-digit code from your authenticator app')).toBeInTheDocument()
  })

  it("Use a recovery code: a valid code signs in and lands on Security & 2FA with 'Your authenticator was removed. Set it up again.'", async () => {
    const acc = setup({ factor: true, aal: 'aal1' })
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

  it('a recovery sign-in when the policy requires 2FA leads to the setup gate', async () => {
    setup({ factor: true, aal: 'aal1', requires2fa: true })
    renderLogin()
    const user = await signIn()
    await user.click(await screen.findByRole('button', { name: 'Use a recovery code' }))
    await user.type(screen.getByLabelText('Recovery code'), RECOVERY)
    await user.click(screen.getByRole('button', { name: 'Sign in with recovery code' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Set up 2FA to continue' })).toBeInTheDocument()
    expect(screen.queryByText(/Settings page/)).not.toBeInTheDocument()
  })

  it('a failed reload after the code or a recovery code leaves no dead end', async () => {
    const acc = setup({ factor: true, aal: 'aal1' })
    const first = renderLogin()
    const user = await signIn()
    const field = await screen.findByLabelText('6-digit code')
    vi.mocked(acc.impl.getSecurityState!).mockResolvedValue(fail('UNKNOWN', 'Database unavailable'))
    vi.mocked(acc.impl.getAssurance!).mockResolvedValue(accountFail('unknown'))
    await user.type(field, TOTP)
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
    first.unmount()

    sessionStorage.clear()
    const again = setup({ factor: true, aal: 'aal1' })
    renderLogin()
    const u2 = await signIn()
    await u2.click(await screen.findByRole('button', { name: 'Use a recovery code' }))
    vi.mocked(again.impl.getSecurityState!).mockResolvedValue(fail('UNKNOWN', 'Database unavailable'))
    vi.mocked(again.impl.getAssurance!).mockResolvedValue(accountFail('unknown'))
    await u2.type(screen.getByLabelText('Recovery code'), RECOVERY)
    await u2.click(screen.getByRole('button', { name: 'Sign in with recovery code' }))
    expect(await screen.findByText('Settings page: security')).toBeInTheDocument()
  })

  it('a business owner whose business is a draft reaches the code step, then the dashboard', async () => {
    const acc = setup({ factor: true, aal: 'aal1' }, null, DRAFT_OWNER)
    // Under 2FA rules the database hides the business until the session is aal2.
    vi.spyOn(service, 'getBusinessById').mockImplementation(async (id) =>
      acc.s.aal === 'aal2' ? ok({ id, name: 'Draft studio', slug: 'draft-studio', status: 'draft' } as Business) : fail('NOT_FOUND', 'Business not found'),
    )
    renderLogin()
    const user = await signIn()
    expect(await screen.findByText('Enter the 6-digit code from your authenticator app')).toBeInTheDocument()
    expect(screen.queryByText(/does not manage a business/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('6-digit code'), TOTP)
    expect(await screen.findByText('Business home')).toBeInTheDocument()
  })

  it('a user without a factor goes straight to the dashboard', async () => {
    setup({ factor: false })
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

describe('Sign-in recording', () => {
  it('records the sign-in once per sign-in', async () => {
    const acc = setup({ factor: false })
    renderLogin()
    await signIn()
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
    await waitFor(() => expect(acc.impl.recordSignIn).toHaveBeenCalledTimes(1))
    // More auth events (token refresh) are not sign-ins.
    const calls = vi.mocked(acc.impl.getSecurityState!).mock.calls.length
    await acc.emit()
    await acc.emit()
    await waitFor(() => expect(vi.mocked(acc.impl.getSecurityState!).mock.calls.length).toBe(calls + 2))
    expect(acc.impl.recordSignIn).toHaveBeenCalledTimes(1)
  })

  it('a session gained without a password sign-in in this tab (another tab, a page load) is not recorded', async () => {
    const acc = setup({ factor: false })
    renderLogin('/admin')
    expect(await screen.findByText('Demo account picker')).toBeInTheDocument() // signed out: this build's sign-in page
    acc.setSession(ADMIN)
    await acc.emit() // SIGNED_IN from another tab
    await waitFor(() => expect(acc.impl.getSecurityState).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(acc.impl.recordSignIn).not.toHaveBeenCalled()
  })

  it('a reload at the code step still records the sign-in once the code is accepted', async () => {
    const acc = setup({ factor: true, aal: 'aal1' })
    const first = renderLogin()
    await signIn()
    expect(await screen.findByText('Enter the 6-digit code from your authenticator app')).toBeInTheDocument()
    expect(acc.impl.recordSignIn).not.toHaveBeenCalled()
    first.unmount() // the reload: same tab, same session

    renderLogin('/admin')
    await userEvent.setup().type(await screen.findByLabelText('6-digit code'), TOTP)
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
    await waitFor(() => expect(acc.impl.recordSignIn).toHaveBeenCalledTimes(1))
  })
})
