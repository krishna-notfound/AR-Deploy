// LoginPage (Supabase mode): what a signed-in account without dashboard access is told.
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountProvider } from '@/auth/AccountProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { AccountService, AuthService, SignedInAccount } from '@/services'
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

function renderLogin(session: SignedInAccount) {
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
