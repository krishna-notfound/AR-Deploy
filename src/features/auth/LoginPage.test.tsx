// LoginPage (Supabase mode): what a signed-in account without dashboard access is told.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountProvider } from '@/auth/AccountProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { AccountService, AuthService, SignedInAccount } from '@/services'
import { ok } from '@/services/catalogService'
import { fakeAccount, fakeAuth } from '@/test/securityFakes'
import LoginPage from './LoginPage'

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

function renderLogin(session: SignedInAccount | null) {
  const a = fakeAuth(session)
  fake.auth = a.auth
  fake.account = fakeAccount({}, a.fire).account
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/login']}>
        <AccountProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </AccountProvider>
      </MemoryRouter>
    </ToastProvider>,
  )
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

describe('LoginPage: signed in without dashboard access', () => {
  it("a deactivated member sees 'Your platform access was turned off by the Owner. Contact them if you need it back.'", async () => {
    renderLogin({ email: 'ana@test', user: null, deactivated: true })
    expect(await screen.findByText('Your platform access was turned off by the Owner. Contact them if you need it back.')).toBeInTheDocument()
    expect(screen.getByText('ana@test')).toBeInTheDocument()
    expect(screen.queryByText(/does not manage a business/)).toBeNull()
    expect(screen.queryByText(/Business owners get access by invitation/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('anyone else without a role still sees the business-owner explanation', async () => {
    renderLogin({ email: 'new@test', user: null })
    expect(await screen.findByText(/does not manage a business/)).toBeInTheDocument()
    expect(screen.queryByText(/turned off by the Owner/)).toBeNull()
  })
})

describe('LoginPage: sign-in form', () => {
  // Owner 2026-11-04: no Google sign-in; the form offers email and password only.
  it('has no Google button and no "or" divider', async () => {
    renderLogin(null)
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Google/ })).toBeNull()
    expect(screen.queryByText('Coming soon')).toBeNull()
  })

  // AUTH9: between a successful sign-in and the account reload the button used to be pressable again.
  it('keeps the button busy from a successful sign-in until the account has loaded', async () => {
    const a = fakeAuth(null)
    fake.auth = a.auth
    fake.account = fakeAccount({}, a.fire).account
    let loads = 0
    a.auth.getCurrentUser = vi.fn(async () => {
      if (loads++ === 0) return ok<SignedInAccount | null>(null)
      await new Promise((r) => setTimeout(r, 400)) // the account reload after SIGNED_IN
      return ok<SignedInAccount | null>({ email: 'ana@test', user: { id: 'u1', name: 'Ana', email: 'ana@test', role: 'super_admin' } })
    })
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/login']}>
          <AccountProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/admin" element={<p>admin home</p>} />
            </Routes>
          </AccountProvider>
        </MemoryRouter>
      </ToastProvider>,
    )
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(/^Email/), 'ana@test')
    await user.type(screen.getByLabelText(/^Password/), 'right-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(a.auth.signInWithPassword).toHaveBeenCalledTimes(1)
    // The sign-in has returned, the account is still loading: the button is busy, not clickable.
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
    expect(await screen.findByText('admin home')).toBeInTheDocument()
    expect(a.auth.signInWithPassword).toHaveBeenCalledTimes(1)
  })

  it('makes the button usable again when the sign-in is refused', async () => {
    const a = fakeAuth(null)
    fake.auth = a.auth
    fake.account = fakeAccount({}, a.fire).account
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/login']}>
          <AccountProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
            </Routes>
          </AccountProvider>
        </MemoryRouter>
      </ToastProvider>,
    )
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(/^Email/), 'ana@test')
    await user.type(screen.getByLabelText(/^Password/), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })
})
