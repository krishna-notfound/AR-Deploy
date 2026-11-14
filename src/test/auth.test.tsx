import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type LogoutResult, AccountProvider, SupabaseAccountProvider, useAccount } from '@/auth/AccountProvider'
import AcceptInvitePage from '@/features/auth/AcceptInvitePage'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { type AuthService, type Profile, type SignedInAccount, account, service } from '@/services'
import { accountFail } from '@/services/accountService'
import { fail, ok } from '@/services/catalogService'

// AcceptInvitePage and AccountProvider read `auth` from '@/services'; tests swap in a fake Supabase auth.
const fake = vi.hoisted(() => ({ auth: null as AuthService | null }))
vi.mock('@/services', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/services')>()
  return {
    ...mod,
    get auth() {
      return fake.auth
    },
  }
})

function fakeAuth(overrides: Partial<AuthService> = {}) {
  const listeners = new Set<() => void>()
  const auth: AuthService = {
    getSession: vi.fn(async () => ok(null)),
    getCurrentUser: vi.fn(async () => ok<SignedInAccount | null>(null)),
    signInWithPassword: vi.fn(async () => ok(undefined)),
    signOut: vi.fn(async () => ok(undefined)),
    requestPasswordReset: vi.fn(async () => ok(undefined)),
    verifyEmailCode: vi.fn(async () => ok(undefined)),
    updatePassword: vi.fn(async () => ok(undefined)),
    completeOwnerOnboarding: vi.fn(async () => ok({ businessId: 'biz_casa' })),
    onAuthStateChange: vi.fn((l: () => void) => {
      listeners.add(l)
      return () => listeners.delete(l)
    }),
    ...overrides,
  }
  /** Fires an auth event (TOKEN_REFRESHED, SIGNED_IN…): the provider reloads the account. */
  const emit = () => act(() => listeners.forEach((l) => l()))
  return { auth, emit }
}

const admin: SignedInAccount = { email: 'ana@test', user: { id: 'u1', name: 'Ana', email: 'ana@test', role: 'super_admin' } }
const owner: SignedInAccount = { email: 'rui@test', user: { id: 'u2', name: 'Rui', email: 'rui@test', role: 'business_admin', businessId: 'biz_casa' } }
/** An owner who has not finished the invitation yet (business_members.accepted_at is null). */
const pendingOwner: SignedInAccount = { email: 'rui@test', user: { ...owner.user!, invitationPending: true } }

let logoutResult: LogoutResult | undefined
function Probe() {
  const { user, business, accountError, signedInEmail, logout, retry } = useAccount()
  return (
    <div>
      <p>user:{user === undefined ? 'loading' : user === null ? 'none' : user.name}</p>
      <p>business:{business?.id ?? '-'}</p>
      <p>error:{accountError ?? '-'}</p>
      <p>email:{signedInEmail ?? '-'}</p>
      <p>status:{business?.status ?? '-'}</p>
      <button type="button" onClick={retry}>
        retry
      </button>
      <button type="button" onClick={async () => (logoutResult = await logout())}>
        logout
      </button>
    </div>
  )
}

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  logoutResult = undefined
  await service.resetDemoData()
})
afterEach(() => {
  fake.auth = null
  vi.restoreAllMocks()
})

describe('SupabaseAccountProvider', () => {
  it('keeps the signed-in account when a reload on an auth event fails (COR-01)', async () => {
    const getCurrentUser = vi.fn<AuthService['getCurrentUser']>().mockResolvedValueOnce(ok(admin)).mockResolvedValue(fail('UNKNOWN', 'Could not reach the sign-in service.'))
    const { auth, emit } = fakeAuth({ getCurrentUser })
    render(
      <SupabaseAccountProvider auth={auth}>
        <Probe />
      </SupabaseAccountProvider>,
    )
    expect(await screen.findByText('user:Ana')).toBeInTheDocument()
    await emit()
    expect(await screen.findByText('error:Could not reach the sign-in service.')).toBeInTheDocument()
    expect(screen.getByText('user:Ana')).toBeInTheDocument()
  })

  it('reports a failed business lookup instead of signing out, and loads it again on the next sign-in (COR-02)', async () => {
    vi.spyOn(service, 'getBusinessById').mockResolvedValueOnce(fail('UNKNOWN', 'Database unavailable'))
    const { auth, emit } = fakeAuth({ getCurrentUser: vi.fn(async () => ok<SignedInAccount | null>(owner)) })
    render(
      <SupabaseAccountProvider auth={auth}>
        <Probe />
      </SupabaseAccountProvider>,
    )
    expect(await screen.findByText('error:Database unavailable')).toBeInTheDocument()
    expect(screen.getByText('user:loading')).toBeInTheDocument()
    await emit() // signing in again with the same session
    // The reload goes through the demo service's simulated latency; under a full parallel run that can pass 5 s.
    expect(await screen.findByText('user:Rui', undefined, { timeout: 15_000 })).toBeInTheDocument()
    expect(screen.getByText('business:biz_casa')).toBeInTheDocument()
    expect(screen.getByText('error:-')).toBeInTheDocument()
  })

  it('retry reloads the business even after a successful load, so a changed status shows (closure cancel)', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(service, 'getBusinessById')
    const { auth } = fakeAuth({ getCurrentUser: vi.fn(async () => ok<SignedInAccount | null>(owner)) })
    render(
      <SupabaseAccountProvider auth={auth}>
        <Probe />
      </SupabaseAccountProvider>,
    )
    expect(await screen.findByText('business:biz_casa', undefined, { timeout: 15_000 })).toBeInTheDocument()
    const calls = spy.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'retry' }))
    await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThan(calls))
  })

  it('treats only a missing business as "no business"', async () => {
    vi.spyOn(service, 'getBusinessById').mockResolvedValue(fail('NOT_FOUND', 'Business not found'))
    const { auth } = fakeAuth({ getCurrentUser: vi.fn(async () => ok<SignedInAccount | null>(owner)) })
    render(
      <SupabaseAccountProvider auth={auth}>
        <Probe />
      </SupabaseAccountProvider>,
    )
    expect(await screen.findByText('user:none')).toBeInTheDocument()
    expect(screen.getByText('email:rui@test')).toBeInTheDocument()
  })

  it("a business owner who was removed while a tab is open is signed out of the dashboard on the next focus, without an auth event (AUTH8)", async () => {
    const getCurrentUser = vi.fn<AuthService['getCurrentUser']>().mockResolvedValue(ok(owner))
    const { auth } = fakeAuth({ getCurrentUser })
    render(
      <SupabaseAccountProvider auth={auth}>
        <Probe />
      </SupabaseAccountProvider>,
    )
    expect(await screen.findByText('user:Rui', undefined, { timeout: 15_000 })).toBeInTheDocument()
    // The Owner removes the membership; the tab is later shown again (more than 30 s after the last load).
    getCurrentUser.mockResolvedValue(ok({ email: 'rui@test', user: null }))
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 60_000)
    await waitFor(() => {
      act(() => void window.dispatchEvent(new Event('focus')))
      expect(screen.getByText('user:none')).toBeInTheDocument()
    }, { timeout: 15_000 })
    clock.mockRestore()
  })

  it('awaits sign-out and falls back to this device when the server cannot be reached (COR-17)', async () => {
    const signOut = vi.fn<AuthService['signOut']>().mockResolvedValueOnce(fail('UNKNOWN', 'offline')).mockResolvedValue(ok(undefined))
    const { auth } = fakeAuth({ getCurrentUser: vi.fn(async () => ok<SignedInAccount | null>(admin)), signOut })
    const user = userEvent.setup()
    render(
      <SupabaseAccountProvider auth={auth}>
        <Probe />
      </SupabaseAccountProvider>,
    )
    expect(await screen.findByText('user:Ana')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'logout' }))
    expect(await screen.findByText('user:none')).toBeInTheDocument()
    expect(signOut).toHaveBeenNthCalledWith(2, 'local')
    expect(logoutResult?.signedOut).toBe(true)
    expect(logoutResult?.error).toMatch(/this device only/)
  })
})

describe('AcceptInvitePage (COR-15)', () => {
  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/accept-invite']}>
        <LanguageProvider>
          <AccountProvider>
            <Routes>
              <Route path="/accept-invite" element={<AcceptInvitePage />} />
              <Route path="/dashboard" element={<p>owner dashboard</p>} />
            </Routes>
          </AccountProvider>
        </LanguageProvider>
      </MemoryRouter>,
    )
  }

  it('after a failed onboarding step, a reload continues without asking for the password again', async () => {
    const completeOwnerOnboarding = vi
      .fn<AuthService['completeOwnerOnboarding']>()
      .mockResolvedValueOnce(fail('UNKNOWN', 'rpc failed'))
      .mockResolvedValue(ok({ businessId: 'biz_casa' }))
    const { auth } = fakeAuth({ getCurrentUser: vi.fn(async () => ok<SignedInAccount | null>(pendingOwner)), completeOwnerOnboarding })
    fake.auth = auth
    const user = userEvent.setup()
    const first = renderPage()
    await user.type(await screen.findByLabelText(/^Password/), 'a-long-password')
    await user.type(screen.getByLabelText(/^Repeat the password/), 'a-long-password')
    await user.click(screen.getByRole('checkbox', { name: /^I agree to the Terms/ }))
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(await screen.findByText(/could not finish the setup/)).toBeInTheDocument()
    expect(auth.updatePassword).toHaveBeenCalledTimes(1)

    first.unmount() // the page asks the owner to reload
    renderPage()
    await user.click(await screen.findByRole('checkbox', { name: /^I agree to the Terms/ }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('owner dashboard')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument()
    expect(auth.updatePassword).toHaveBeenCalledTimes(1)
  })

  // S2 legal: the owner ticks "I agree to the Terms and the Privacy Policy" before the password is set.
  it('does not set the password until the owner agrees to the Terms and the Privacy Policy', async () => {
    const { auth } = fakeAuth({ getCurrentUser: vi.fn(async () => ok<SignedInAccount | null>(pendingOwner)) })
    fake.auth = auth
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText(/^Password/), 'a-long-password')
    await user.type(screen.getByLabelText(/^Repeat the password/), 'a-long-password')
    const tick = screen.getByRole('checkbox', { name: /^I agree to the Terms/ })
    // Both documents open in a new tab, so the form keeps what was typed.
    expect(screen.getByRole('link', { name: /^Terms/ })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: /^Terms/ })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: /^Privacy Policy/ })).toHaveAttribute('href', '/privacy')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(await screen.findByText('Please agree to the Terms and the Privacy Policy to continue.')).toBeInTheDocument()
    expect(tick).toHaveAttribute('aria-invalid', 'true')
    expect(auth.updatePassword).not.toHaveBeenCalled()
    expect(auth.completeOwnerOnboarding).not.toHaveBeenCalled()

    await user.click(tick)
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(await screen.findByText('owner dashboard')).toBeInTheDocument()
    expect(auth.updatePassword).toHaveBeenCalledWith('a-long-password')
  })

  it('shows auth errors in the visitor language', async () => {
    sessionStorage.setItem(LANG_KEY, 'pt')
    const { auth } = fakeAuth({
      getCurrentUser: vi.fn(async () => ok<SignedInAccount | null>(pendingOwner)),
      updatePassword: vi.fn(async () => ({ ok: false as const, error: { code: 'VALIDATION' as const, message: 'Choose a stronger password.', reason: 'weak_password' } })),
    })
    fake.auth = auth
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText(/^Palavra-passe/), 'password1234')
    await user.type(screen.getByLabelText(/^Repita a palavra-passe/), 'password1234')
    await user.click(screen.getByRole('checkbox', { name: /^Concordo com os Termos/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar e continuar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha uma palavra-passe mais forte')
    expect(auth.completeOwnerOnboarding).not.toHaveBeenCalled()
  })

  it('a signed-in owner whose invitation is already accepted goes to /dashboard; the password form is never rendered (R-W1-9)', async () => {
    // Records whether a password field is ever put in the page, even for a moment before the redirect.
    let sawPassword = false
    const observer = new MutationObserver(() => {
      if (document.querySelector('input[type="password"]')) sawPassword = true
    })
    observer.observe(document.body, { childList: true, subtree: true })
    try {
      const { auth } = fakeAuth({ getCurrentUser: vi.fn(async () => ok<SignedInAccount | null>(owner)) })
      fake.auth = auth
      renderPage()
      expect(await screen.findByText('owner dashboard')).toBeInTheDocument()
      expect(sawPassword).toBe(false)
      expect(auth.updatePassword).not.toHaveBeenCalled()
      expect(auth.completeOwnerOnboarding).not.toHaveBeenCalled()
    } finally {
      observer.disconnect()
    }
  })

  it('a signed-in owner with a pending invitation sees who is signed in and can sign out first (R-W1-9)', async () => {
    const getCurrentUser = vi.fn<AuthService['getCurrentUser']>().mockResolvedValue(ok(pendingOwner))
    const { auth, emit } = fakeAuth({ getCurrentUser })
    fake.auth = auth
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText("You're signed in as rui@test. If this invitation is for someone else, sign out first.")).toBeInTheDocument()
    // The notice comes before the password step.
    const signOut = screen.getByRole('button', { name: 'Sign out' })
    const password = screen.getByLabelText(/^Password/)
    expect(signOut.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    getCurrentUser.mockResolvedValue(ok(null))
    await user.click(signOut)
    expect(auth.signOut).toHaveBeenCalled()
    await emit()
    // Signed out: the invitation starts again from the code step.
    expect(await screen.findByLabelText(/^Code from the email/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument()
    expect(auth.updatePassword).not.toHaveBeenCalled()
  })

  async function fillPasswordForm(user: ReturnType<typeof userEvent.setup>, opts: { name?: string; password?: string } = {}) {
    const password = opts.password ?? 'a-long-password'
    if (opts.name) await user.type(await screen.findByLabelText(/^Your name/), opts.name)
    await user.type(await screen.findByLabelText(/^Password/), password)
    await user.type(screen.getByLabelText(/^Repeat the password/), password)
    await user.click(screen.getByRole('checkbox', { name: /^I agree to the Terms/ }))
  }

  it('saves the name to the profile (what Settings and the setup checklist read), not only to the sign-in metadata (ACT-F1)', async () => {
    const update = vi.spyOn(account, 'updateProfile').mockResolvedValue(ok({} as Profile))
    const { auth } = fakeAuth({ getCurrentUser: vi.fn(async () => ok<SignedInAccount | null>(pendingOwner)) })
    fake.auth = auth
    const user = userEvent.setup()
    renderPage()
    await fillPasswordForm(user, { name: 'Rui Costa' })
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(await screen.findByText('owner dashboard')).toBeInTheDocument()
    expect(update).toHaveBeenCalledWith({ displayName: 'Rui Costa' })
    expect(auth.completeOwnerOnboarding).toHaveBeenCalled()
  })

  it('does not touch the profile when no name was typed', async () => {
    const update = vi.spyOn(account, 'updateProfile')
    const { auth } = fakeAuth({ getCurrentUser: vi.fn(async () => ok<SignedInAccount | null>(pendingOwner)) })
    fake.auth = auth
    const user = userEvent.setup()
    renderPage()
    await fillPasswordForm(user)
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(await screen.findByText('owner dashboard')).toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()
  })

  it('a failed name save is shown, not skipped, and a retry does not ask for the password again (EF-15)', async () => {
    const update = vi.spyOn(account, 'updateProfile').mockResolvedValueOnce(accountFail('unknown')).mockResolvedValue(ok({} as Profile))
    const { auth } = fakeAuth({ getCurrentUser: vi.fn(async () => ok<SignedInAccount | null>(pendingOwner)) })
    fake.auth = auth
    const user = userEvent.setup()
    renderPage()
    await fillPasswordForm(user, { name: 'Rui Costa' })
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't save your name")
    expect(auth.completeOwnerOnboarding).not.toHaveBeenCalled()
    expect(auth.updatePassword).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('owner dashboard')).toBeInTheDocument()
    expect(update).toHaveBeenCalledTimes(2)
    expect(auth.updatePassword).toHaveBeenCalledTimes(1)
  })

  it('refuses a password longer than 72 bytes, which bcrypt would cut short (AUTH3)', async () => {
    const { auth } = fakeAuth({ getCurrentUser: vi.fn(async () => ok<SignedInAccount | null>(pendingOwner)) })
    fake.auth = auth
    const user = userEvent.setup()
    renderPage()
    await fillPasswordForm(user, { password: 'x'.repeat(73) })
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Use at most 72 characters.')
    expect(auth.updatePassword).not.toHaveBeenCalled()
  })

  it('a signed-in account with no invitation waiting is told so, with a sign-out, instead of a code form that spins (AUTH2)', async () => {
    const noRole: SignedInAccount = { email: 'maria@test', user: null }
    const getCurrentUser = vi.fn<AuthService['getCurrentUser']>().mockResolvedValue(ok(noRole))
    const { auth, emit } = fakeAuth({ getCurrentUser })
    fake.auth = auth
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText(/You're signed in as maria@test, but this account has no invitation waiting/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Code from the email/)).not.toBeInTheDocument()
    getCurrentUser.mockResolvedValue(ok(null))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(auth.signOut).toHaveBeenCalled()
    await emit()
    expect(await screen.findByLabelText(/^Code from the email/)).toBeInTheDocument()
  })

  it('the signed-in notice is translated (R-W1-9)', async () => {
    sessionStorage.setItem(LANG_KEY, 'pt')
    const { auth } = fakeAuth({ getCurrentUser: vi.fn(async () => ok<SignedInAccount | null>(pendingOwner)) })
    fake.auth = auth
    renderPage()
    expect(await screen.findByText('Tem sessão iniciada como rui@test. Se este convite for para outra pessoa, termine a sessão primeiro.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Terminar sessão' })).toBeInTheDocument()
  })
})

describe('AcceptInvitePage: invitation code (ADR-0027)', () => {
  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/accept-invite']}>
        <LanguageProvider>
          <AccountProvider>
            <Routes>
              <Route path="/accept-invite" element={<AcceptInvitePage />} />
            </Routes>
          </AccountProvider>
        </LanguageProvider>
      </MemoryRouter>,
    )
  }

  it('signs a signed-out visitor in with email and code, then asks for the password', async () => {
    const getCurrentUser = vi.fn<AuthService['getCurrentUser']>().mockResolvedValue(ok(null))
    const { auth, emit } = fakeAuth({ getCurrentUser })
    fake.auth = auth
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText(/^Email/), 'Rui@Test.pt')
    await user.type(screen.getByLabelText(/^Code from the email/), '4821 3907')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(auth.verifyEmailCode).toHaveBeenCalledWith('rui@test.pt', '48213907', 'invite')
    getCurrentUser.mockResolvedValue(ok(pendingOwner))
    await emit()
    expect(await screen.findByLabelText(/^Password/)).toBeInTheDocument()
  })

  it('explains a wrong or expired code', async () => {
    const { auth } = fakeAuth({
      verifyEmailCode: vi.fn(async () => ({ ok: false as const, error: { code: 'PERMISSION' as const, message: 'Token has expired or is invalid', reason: 'otp_expired' } })),
    })
    fake.auth = auth
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText(/^Email/), 'rui@test.pt')
    await user.type(screen.getByLabelText(/^Code from the email/), '12345678')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is wrong or has expired')
  })

  it('refuses a code that is not made of digits without calling the server', async () => {
    const { auth } = fakeAuth()
    fake.auth = auth
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText(/^Email/), 'rui@test.pt')
    await user.type(screen.getByLabelText(/^Code from the email/), 'abc123')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('It is made of digits only')
    expect(auth.verifyEmailCode).not.toHaveBeenCalled()
  })
})

// The reset page (ADR-0027, ADR-0066) has its own suite: src/features/auth/ResetPasswordPage.test.tsx.
