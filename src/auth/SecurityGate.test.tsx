import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { Business } from '@/domain/types'
import { type AccountService, type AuthService, service } from '@/services'
import { accountFail } from '@/services/accountService'
import { fail, ok } from '@/services/catalogService'
import { ADMIN, DRAFT_OWNER, TOTP, fakeAccount, fakeAuth } from '@/test/securityFakes'
import { ACCOUNT_KEY, AccountProvider } from './AccountProvider'
import { RequireRole } from './RequireRole'
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

function renderGate(path = '/admin') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <AccountProvider>
          <Routes>
            <Route path="/admin" element={<RequireRole allow="super_admin"><SecurityGate><p>Admin home</p></SecurityGate></RequireRole>} />
            <Route path="/admin/settings/:section" element={<RequireRole allow="super_admin"><SecurityGate><p>Settings page</p></SecurityGate></RequireRole>} />
            <Route path="/dashboard" element={<RequireRole allow="business_admin"><SecurityGate><p>Business home</p></SecurityGate></RequireRole>} />
            <Route path="/login" element={<p>Sign-in page</p>} />
            <Route path="/demo" element={<p>Demo account picker</p>} />
          </Routes>
        </AccountProvider>
      </MemoryRouter>
    </ToastProvider>,
  )
}

function setup(start: Parameters<typeof fakeAccount>[0], session = ADMIN) {
  const a = fakeAuth(session)
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

describe('SecurityGate', () => {
  it('shows the 2FA gate when my_security_state requires 2FA at aal1', async () => {
    const acc = setup({ requires2fa: true, factor: false, aal: 'aal1' })
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
    // Even when the reload after setup fails, the app opens (the state is updated in place).
    vi.mocked(acc.impl.getSecurityState!).mockResolvedValue(fail('UNKNOWN', 'Database unavailable'))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
  })

  it('the gate covers the settings routes too, and Sign out leaves', async () => {
    const { auth } = setup({ requires2fa: true })
    renderGate('/admin/settings/security')
    expect(await screen.findByRole('heading', { level: 1, name: 'Set up 2FA to continue' })).toBeInTheDocument()
    expect(screen.queryByText('Settings page')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }))
    // This build's sign-in page (the demo picker in tests, /login in a Supabase build).
    expect(await screen.findByText('Demo account picker')).toBeInTheDocument()
    expect(auth.signOut).toHaveBeenCalled()
  })

  it('a session at aal1 with a verified factor (a reload mid sign-in) gets the code step, not the setup gate', async () => {
    setup({ requires2fa: true, factor: true, aal: 'aal1' })
    renderGate()
    expect(await screen.findByText('Enter the 6-digit code from your authenticator app')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Set up 2FA to continue' })).not.toBeInTheDocument()
    await userEvent.setup().type(screen.getByLabelText('6-digit code'), TOTP)
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
  })

  it('opt-in 2FA: a reload at aal1 with a factor and the policy off shows the code step; the right code loads the dashboard', async () => {
    // The database hides data from any session at aal1 whose account has a verified factor, policy or not.
    const acc = setup({ requires2fa: false, factor: true, aal: 'aal1' }, DRAFT_OWNER)
    vi.spyOn(service, 'getBusinessById').mockImplementation(async (id) =>
      acc.s.aal === 'aal2' ? ok({ id, name: 'Draft studio', slug: 'draft-studio', status: 'draft' } as Business) : fail('NOT_FOUND', 'Business not found'),
    )
    renderGate('/dashboard')
    expect(await screen.findByText('Enter the 6-digit code from your authenticator app')).toBeInTheDocument()
    expect(screen.queryByText('Business home')).not.toBeInTheDocument()
    await userEvent.setup().type(screen.getByLabelText('6-digit code'), TOTP)
    expect(await screen.findByText('Business home')).toBeInTheDocument()
  })

  it('opt-in 2FA: the check runs again on auth changes (a session from before 2FA was turned on elsewhere)', async () => {
    const acc = setup({ requires2fa: false, factor: false, aal: 'aal1' })
    renderGate()
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
    // 2FA was turned on from another device; this session is still aal1. The next auth event (token refresh) tells.
    acc.s.factor = true
    await acc.emit()
    expect(await screen.findByText('Enter the 6-digit code from your authenticator app')).toBeInTheDocument()
    expect(screen.queryByText('Admin home')).not.toBeInTheDocument()
    await userEvent.setup().type(screen.getByLabelText('6-digit code'), TOTP)
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
  })

  it('lets the app through when 2FA is not required, or the session is already aal2', async () => {
    setup({ requires2fa: false })
    const first = renderGate()
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
    first.unmount()

    setup({ requires2fa: true, factor: true, aal: 'aal2' })
    renderGate()
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
  })

  it('a failed check lets the app through and retries', async () => {
    const acc = setup({ requires2fa: true })
    vi.mocked(acc.impl.getSecurityState!).mockResolvedValueOnce(fail('UNKNOWN', 'Database unavailable'))
    vi.mocked(acc.impl.getAssurance!).mockResolvedValueOnce(accountFail('unknown'))
    renderGate()
    // The database still refuses data at aal1; the gate does not block on its own failure.
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
    // Coming back to the window retries; now the policy is known and the gate shows.
    fireEvent.focus(window)
    expect(await screen.findByRole('heading', { level: 1, name: 'Set up 2FA to continue' })).toBeInTheDocument()
  })

  it('a failed check also retries on its own, with a backoff', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const acc = setup({ requires2fa: true })
      vi.mocked(acc.impl.getSecurityState!).mockResolvedValueOnce(fail('UNKNOWN', 'Database unavailable'))
      renderGate()
      expect(await screen.findByText('Admin home')).toBeInTheDocument()
      await vi.advanceTimersByTimeAsync(3_000)
      expect(await screen.findByRole('heading', { level: 1, name: 'Set up 2FA to continue' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a business owner whose draft business is hidden at aal1 gets the setup gate, not "no business"', async () => {
    const acc = setup({ requires2fa: true, factor: false, aal: 'aal1' }, DRAFT_OWNER)
    vi.spyOn(service, 'getBusinessById').mockImplementation(async (id) =>
      acc.s.aal === 'aal2' ? ok({ id, name: 'Draft studio', slug: 'draft-studio', status: 'draft' } as Business) : fail('NOT_FOUND', 'Business not found'),
    )
    renderGate('/dashboard')
    expect(await screen.findByRole('heading', { level: 1, name: 'Set up 2FA to continue' })).toBeInTheDocument()
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('6-digit code'), TOTP)
    await user.click(screen.getByRole('button', { name: 'Verify and turn on' }))
    await user.click(await screen.findByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    // The business is fetched again at aal2.
    expect(await screen.findByText('Business home')).toBeInTheDocument()
  })

  it('a business that is really gone still reads as "no business" when no 2FA step is due', async () => {
    setup({ requires2fa: false, factor: false }, DRAFT_OWNER)
    vi.spyOn(service, 'getBusinessById').mockResolvedValue(fail('NOT_FOUND', 'Business not found'))
    renderGate('/dashboard')
    // Signed in without a business: RequireRole sends the user to the sign-in page, as before.
    expect(await screen.findByText('Demo account picker')).toBeInTheDocument()
  })

  it('a token refresh with an existing session records nothing', async () => {
    const acc = setup({ requires2fa: false })
    renderGate()
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
    await acc.emit()
    await waitFor(() => expect(acc.impl.getSecurityState).toHaveBeenCalledTimes(2))
    expect(acc.impl.recordSignIn).not.toHaveBeenCalled()
  })

  it('demo mode: the gate is a no-op while the demo policy is off', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
    renderGate()
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
  })
})
