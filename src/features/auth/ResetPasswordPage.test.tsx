// ResetPasswordPage (Supabase mode): setting a new password also finishes an owner's onboarding (S1.5 R-W2-3).
import type { Session } from '@supabase/supabase-js'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import type { AuthService, SignedInAccount } from '@/services'
import { ok } from '@/services/catalogService'
import { ADMIN, DRAFT_OWNER, fakeAuth } from '@/test/securityFakes'
import ResetPasswordPage from './ResetPasswordPage'

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

/** A recovery session (from the emailed code) for `account`, on the "new password" step. */
function renderWithSession(account: SignedInAccount) {
  const a = fakeAuth(account)
  a.auth.getSession = vi.fn(async () => ok({ user: { id: account.user?.id ?? 'u0' } } as Session))
  fake.auth = a.auth
  render(
    <LanguageProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={['/reset-password']}>
          <Routes>
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/login" element={<p>Login page</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </LanguageProvider>,
  )
  return a.auth
}

async function setPassword() {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('New password'), 'a-long-new-password')
  await user.type(screen.getByLabelText('Repeat new password'), 'a-long-new-password')
  await user.click(screen.getByRole('button', { name: 'Save new password' }))
  await screen.findByText('Login page')
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.setItem('arfurn:lang', 'en')
})
afterEach(() => {
  fake.auth = null
  vi.restoreAllMocks()
})

describe('ResetPasswordPage: owner onboarding after a new password (R-W2-3)', () => {
  it('after a successful password set, a business_admin calls completeOwnerOnboarding once; platform staff don’t', async () => {
    const owner = renderWithSession(DRAFT_OWNER)
    await setPassword()
    expect(owner.updatePassword).toHaveBeenCalledWith('a-long-new-password')
    expect(owner.completeOwnerOnboarding).toHaveBeenCalledTimes(1)

    cleanup()
    const staff = renderWithSession(ADMIN)
    await setPassword()
    expect(staff.updatePassword).toHaveBeenCalledTimes(1)
    expect(staff.completeOwnerOnboarding).not.toHaveBeenCalled()
  })

  it('a failed password set does not complete onboarding', async () => {
    const a = fakeAuth(DRAFT_OWNER)
    a.auth.getSession = vi.fn(async () => ok({ user: { id: 'u2' } } as Session))
    a.auth.updatePassword = vi.fn(async () => ({ ok: false as const, error: { code: 'VALIDATION' as const, message: 'Choose a stronger password.' } }))
    fake.auth = a.auth
    render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/reset-password']}>
            <ResetPasswordPage />
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>,
    )
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('New password'), 'a-long-new-password')
    await user.type(screen.getByLabelText('Repeat new password'), 'a-long-new-password')
    await user.click(screen.getByRole('button', { name: 'Save new password' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(a.auth.completeOwnerOnboarding).not.toHaveBeenCalled()
  })
})
