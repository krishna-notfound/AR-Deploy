import type { ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { adminNav } from '@/components/layout/nav'
import { ToastProvider } from '@/components/ui/ToastProvider'
import SettingsLayout from '@/features/settings/SettingsLayout'
import type { Business } from '@/domain/types'
import { type AccountService, type AuthService, service } from '@/services'
import { accountFail } from '@/services/accountService'
import { fail, ok } from '@/services/catalogService'
import { ADMIN, DRAFT_OWNER, TOTP, fakeAccount, fakeAuth } from '@/test/securityFakes'
import { ACCOUNT_KEY, AccountProvider } from './AccountProvider'
import { RequireRole } from './RequireRole'
import { SecurityNoticeSlot } from '@/auth/securityNotice'
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

/** A page under the gate: the dashboards render the gate's notice slot at the top of their main column. */
function Page({ children }: { children: ReactNode }) {
  return (
    <>
      <SecurityNoticeSlot />
      <div>{children}</div>
    </>
  )
}

function renderGate(path = '/admin') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <AccountProvider>
          <Routes>
            <Route path="/admin" element={<RequireRole allow="super_admin"><SecurityGate><Page>Admin home</Page></SecurityGate></RequireRole>} />
            <Route path="/admin/settings/:section" element={<RequireRole allow="super_admin"><SecurityGate><Page>Settings page</Page></SecurityGate></RequireRole>} />
            <Route path="/dashboard" element={<RequireRole allow="business_admin"><SecurityGate><Page>Business home</Page></SecurityGate></RequireRole>} />
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
  const acc = fakeAccount(start, a.fire)
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

const CHECK_FAILED = "We couldn't check your sign-in security. Some data may not load."

/** The notice and none of its ancestors are pinned over the page (save bars, sidebar stay uncovered). */
function expectInline(notice: HTMLElement) {
  for (let el: HTMLElement | null = notice; el; el = el.parentElement) expect(el.className).not.toMatch(/(^|\s)(fixed|sticky)(\s|$)/)
}

describe('SecurityGate notice in the dashboards', () => {
  function failBoth() {
    const acc = setup({ requires2fa: false })
    vi.mocked(acc.impl.getSecurityState!).mockResolvedValue(fail('UNKNOWN', 'Database unavailable'))
    vi.mocked(acc.impl.getAssurance!).mockResolvedValue(accountFail('unknown'))
    return acc
  }

  it('sits inline at the top of the dashboard main column, not pinned over the page', { timeout: 20_000 }, async () => {
    failBoth()
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/admin']}>
          <AccountProvider>
            <Routes>
              <Route path="/admin" element={<RequireRole allow="super_admin"><SecurityGate><DashboardShell nav={adminNav} variant="admin" /></SecurityGate></RequireRole>}>
                <Route index element={<p>Admin home</p>} />
              </Route>
            </Routes>
          </AccountProvider>
        </MemoryRouter>
      </ToastProvider>,
    )
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
    const main = document.getElementById('main')!
    const notice = within(main).getByText(CHECK_FAILED)
    expectInline(notice)
    expect(within(main).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    // Exactly one notice: none outside the main column.
    expect(screen.getAllByText(CHECK_FAILED)).toHaveLength(1)
  })

  it('sits inline in the settings main column too', { timeout: 20_000 }, async () => {
    failBoth()
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/admin/settings/account']}>
          <AccountProvider>
            <Routes>
              <Route path="/admin/settings/:section?" element={<RequireRole allow="super_admin"><SecurityGate><SettingsLayout scope="admin" /></SecurityGate></RequireRole>} />
            </Routes>
          </AccountProvider>
        </MemoryRouter>
      </ToastProvider>,
    )
    const notice = await screen.findByText(CHECK_FAILED)
    expect(document.getElementById('main')).toContainElement(notice)
    expectInline(notice)
    expect(screen.getAllByText(CHECK_FAILED)).toHaveLength(1)
  })
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

  it('a draft owner keeps the recovery codes on screen through the auth events of setup (MFA_CHALLENGE_VERIFIED, token refresh)', async () => {
    const acc = setup({ requires2fa: true, factor: false, aal: 'aal1' }, DRAFT_OWNER)
    vi.spyOn(service, 'getBusinessById').mockImplementation(async (id) =>
      acc.s.aal === 'aal2' ? ok({ id, name: 'Draft studio', slug: 'draft-studio', status: 'draft' } as Business) : fail('NOT_FOUND', 'Business not found'),
    )
    renderGate('/dashboard')
    const user = userEvent.setup()
    // A token refresh before the code: the setup stays where it is.
    const field = await screen.findByLabelText('6-digit code')
    await acc.emit()
    expect(screen.getByLabelText('6-digit code')).toBe(field)
    await user.type(field, TOTP)
    await user.click(screen.getByRole('button', { name: 'Verify and turn on' }))
    // confirmTotpEnrollment raised MFA_CHALLENGE_VERIFIED: the account and the hidden business reload meanwhile.
    expect(await screen.findByText('AAAAA-AAAAA')).toBeInTheDocument()
    await waitFor(() => expect(vi.mocked(service.getBusinessById).mock.calls.length).toBeGreaterThan(1))
    await act(() => new Promise((r) => setTimeout(r, 30)))
    await acc.emit() // and a token refresh while the codes are shown
    await act(() => new Promise((r) => setTimeout(r, 30)))
    expect(screen.getByText('AAAAA-AAAAA')).toBeInTheDocument()
    expect(screen.queryByText('Business home')).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByText('Business home')).toBeInTheDocument()
  })

  it('a stale local assurance level (aal1/aal1) does not skip the code step when the server knows a factor at aal1', async () => {
    setup({ requires2fa: false, factor: true, aal: 'aal1', local: { currentLevel: 'aal1', nextLevel: 'aal1' } })
    renderGate()
    expect(await screen.findByText('Enter the 6-digit code from your authenticator app')).toBeInTheDocument()
    await userEvent.setup().type(screen.getByLabelText('6-digit code'), TOTP)
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
  })

  it('an unknown local level falls back to the server aal: a factor at aal2 is not asked again', async () => {
    setup({ requires2fa: false, factor: true, aal: 'aal2', local: 'fail' })
    renderGate()
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
    expect(screen.queryByText('Enter the 6-digit code from your authenticator app')).not.toBeInTheDocument()
  })

  it('when both checks fail, a banner says so over the app and offers Retry', async () => {
    const acc = setup({ requires2fa: false })
    vi.mocked(acc.impl.getSecurityState!).mockResolvedValueOnce(fail('UNKNOWN', 'Database unavailable'))
    vi.mocked(acc.impl.getAssurance!).mockResolvedValueOnce(accountFail('unknown'))
    renderGate()
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
    expect(screen.getByText("We couldn't check your sign-in security. Some data may not load.")).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByText("We couldn't check your sign-in security. Some data may not load.")).not.toBeInTheDocument())
    expect(screen.getByText('Admin home')).toBeInTheDocument()
  })

  it('a draft owner whose checks fail is not sent to the sign-in page: the banner shows instead', async () => {
    const acc = setup({ requires2fa: true, factor: false, aal: 'aal1' }, DRAFT_OWNER)
    vi.mocked(acc.impl.getSecurityState!).mockResolvedValue(fail('UNKNOWN', 'Database unavailable'))
    vi.mocked(acc.impl.getAssurance!).mockResolvedValue(accountFail('unknown'))
    vi.spyOn(service, 'getBusinessById').mockResolvedValue(fail('NOT_FOUND', 'Business not found'))
    renderGate('/dashboard')
    expect(await screen.findByText("We couldn't check your sign-in security. Some data may not load.")).toBeInTheDocument()
    expect(screen.queryByText('Demo account picker')).not.toBeInTheDocument()
    // Once the check answers, the setup gate takes over.
    vi.mocked(acc.impl.getSecurityState!).mockImplementation(async () =>
      ok({ requires2fa: true, aal: 'aal1', hasVerifiedFactor: false, recoveryCodesLeft: null, pendingEmail: null, closure: null, onboarding: { completedAt: null, dismissedAt: null } }),
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Set up 2FA to continue' })).toBeInTheDocument()
  })

  it('the notice for a draft owner whose checks fail offers Sign out', async () => {
    const acc = setup({ requires2fa: true }, DRAFT_OWNER)
    vi.mocked(acc.impl.getSecurityState!).mockResolvedValue(fail('UNKNOWN', 'Database unavailable'))
    vi.mocked(acc.impl.getAssurance!).mockResolvedValue(accountFail('unknown'))
    vi.spyOn(service, 'getBusinessById').mockResolvedValue(fail('NOT_FOUND', 'Business not found'))
    renderGate('/dashboard')
    expect(await screen.findByText("We couldn't check your sign-in security. Some data may not load.")).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByText('Demo account picker')).toBeInTheDocument()
    expect(acc.auth.signOut).toHaveBeenCalled()
  })

  it('no code step when the server knows no factor, even if the local level says aal1 -> aal2 (a held "no factor")', async () => {
    setup({ requires2fa: false, factor: false, aal: 'aal1', local: { currentLevel: 'aal1', nextLevel: 'aal2' } })
    renderGate()
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
    expect(screen.queryByText('Enter the 6-digit code from your authenticator app')).not.toBeInTheDocument()
  })

  it('after a recovery code, a stale reload (factor still listed) does not bring the code step back', async () => {
    const acc = setup({ requires2fa: false, factor: true, aal: 'aal1' })
    renderGate()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Use a recovery code' }))
    // The session refresh after the redeem lags: the next reload still reports the old factor once.
    const stale = { requires2fa: false, aal: 'aal1' as const, hasVerifiedFactor: true, recoveryCodesLeft: 1, pendingEmail: null, closure: null, onboarding: { completedAt: null, dismissedAt: null } }
    vi.mocked(acc.impl.getSecurityState!).mockResolvedValueOnce(ok(stale)).mockResolvedValueOnce(ok(stale))
    vi.mocked(acc.impl.getAssurance!).mockResolvedValueOnce(ok({ currentLevel: 'aal1', nextLevel: 'aal2' })).mockResolvedValueOnce(ok({ currentLevel: 'aal1', nextLevel: 'aal2' }))
    await user.type(screen.getByLabelText('Recovery code'), 'ABCDE-FGHJK')
    await user.click(screen.getByRole('button', { name: 'Sign in with recovery code' }))
    expect(await screen.findByText('Settings page')).toBeInTheDocument()
    await act(() => new Promise((r) => setTimeout(r, 30)))
    expect(screen.queryByText('Enter the 6-digit code from your authenticator app')).not.toBeInTheDocument()
    // A later reload that confirms "no factor" settles it.
    await acc.emit()
    await act(() => new Promise((r) => setTimeout(r, 30)))
    expect(screen.getByText('Settings page')).toBeInTheDocument()
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

  it('the setup checklist comes after the 2FA gate, and never covers the settings routes', async () => {
    const onboarding = { completedAt: null, dismissedAt: null }
    setup({ requires2fa: true, factor: false, aal: 'aal1', onboarding })
    const first = renderGate()
    expect(await screen.findByRole('heading', { level: 1, name: 'Set up 2FA to continue' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Complete your setup' })).not.toBeInTheDocument()
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('6-digit code'), TOTP)
    await user.click(screen.getByRole('button', { name: 'Verify and turn on' }))
    await user.click(await screen.findByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Complete your setup' })).toBeInTheDocument()
    expect(screen.queryByText('Admin home')).not.toBeInTheDocument()
    first.unmount()

    setup({ factor: true, aal: 'aal2', onboarding })
    renderGate('/admin/settings/profile')
    expect(await screen.findByText('Settings page')).toBeInTheDocument()
  })

  it('demo mode: the gate is a no-op while the demo policy is off', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
    renderGate()
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
  })
})
