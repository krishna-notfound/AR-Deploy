import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type LogoutResult, AccountProvider, SupabaseAccountProvider, useAccount } from '@/auth/AccountProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import AcceptInvitePage from '@/features/auth/AcceptInvitePage'
import ResetPasswordPage from '@/features/auth/ResetPasswordPage'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { type AuthService, type SignedInAccount, service } from '@/services'
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
    updateDisplayName: vi.fn(async () => ok(undefined)),
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
    const { auth } = fakeAuth({ getCurrentUser: vi.fn(async () => ok<SignedInAccount | null>(owner)), completeOwnerOnboarding })
    fake.auth = auth
    const user = userEvent.setup()
    const first = renderPage()
    await user.type(await screen.findByLabelText(/^Password/), 'a-long-password')
    await user.type(screen.getByLabelText(/^Repeat the password/), 'a-long-password')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(await screen.findByText(/could not finish the setup/)).toBeInTheDocument()
    expect(auth.updatePassword).toHaveBeenCalledTimes(1)

    first.unmount() // the page asks the owner to reload
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('owner dashboard')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument()
    expect(auth.updatePassword).toHaveBeenCalledTimes(1)
  })

  it('shows auth errors in the visitor language', async () => {
    sessionStorage.setItem(LANG_KEY, 'pt')
    const { auth } = fakeAuth({
      getCurrentUser: vi.fn(async () => ok<SignedInAccount | null>(owner)),
      updatePassword: vi.fn(async () => ({ ok: false as const, error: { code: 'VALIDATION' as const, message: 'Choose a stronger password.', reason: 'weak_password' } })),
    })
    fake.auth = auth
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText(/^Palavra-passe/), 'password1234')
    await user.type(screen.getByLabelText(/^Repita a palavra-passe/), 'password1234')
    await user.click(screen.getByRole('button', { name: 'Guardar e continuar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha uma palavra-passe mais forte')
    expect(auth.completeOwnerOnboarding).not.toHaveBeenCalled()
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
    getCurrentUser.mockResolvedValue(ok(owner))
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

describe('ResetPasswordPage: reset code (ADR-0027)', () => {
  it('requests a code, verifies it and shows the new-password form', async () => {
    const { auth } = fakeAuth()
    fake.auth = auth
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <LanguageProvider>
          <ToastProvider>
            <Routes>
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Routes>
          </ToastProvider>
        </LanguageProvider>
      </MemoryRouter>,
    )
    await user.type(await screen.findByLabelText(/^Email/), 'rui@test.pt')
    await user.click(screen.getByRole('button', { name: 'Send code' }))
    expect(auth.requestPasswordReset).toHaveBeenCalledWith('rui@test.pt', expect.stringMatching(/\/reset-password$/))
    await user.type(await screen.findByLabelText(/^Code from the email/), '48213907')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(auth.verifyEmailCode).toHaveBeenCalledWith('rui@test.pt', '48213907', 'recovery')
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
  })
})
