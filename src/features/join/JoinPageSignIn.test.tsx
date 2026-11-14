// JoinPage in Supabase mode (EF-14): the account is created first, then the page signs in with it. The invitation is used up
// by the creation, so a sign-in that fails must say why and retry only the sign-in, never the creation.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountProvider } from '@/auth/AccountProvider'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { type AuthService, service } from '@/services'
import { ok } from '@/services/catalogService'
import { fakeAuth } from '@/test/securityFakes'
import JoinPage from './JoinPage'

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

const failure = (reason: string) => ({ ok: false as const, error: { code: 'UNKNOWN' as const, message: 'raw provider text', reason } })

beforeEach(async () => {
  sessionStorage.clear()
  sessionStorage.setItem('arfurn:lang', 'en')
  window.history.replaceState(null, '', '/join#t=demo-invite-token')
  await service.resetDemoData()
})
afterEach(() => {
  fake.auth = null
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

function renderJoin() {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/join']}>
        <AccountProvider>
          <Routes>
            <Route path="/join" element={<JoinPage />} />
            <Route path="/admin" element={<p>admin home</p>} />
            <Route path="/login" element={<p>sign-in page</p>} />
          </Routes>
        </AccountProvider>
      </MemoryRouter>
    </LanguageProvider>,
  )
}

describe('JoinPage: sign-in after the account was created (EF-14)', () => {
  it('says why the sign-in failed and retries only the sign-in, with the form locked', { timeout: 30_000 }, async () => {
    const create = vi.spyOn(service, 'acceptInviteCreate').mockResolvedValue(ok({ email: 'marta@sanctus.test' } as never))
    const { auth } = fakeAuth(null)
    auth.signInWithPassword = vi.fn().mockResolvedValueOnce(failure('network')).mockResolvedValueOnce(failure('over_request_rate_limit')).mockResolvedValue(ok(undefined))
    fake.auth = auth
    const user = userEvent.setup()
    renderJoin()
    await screen.findByDisplayValue('marta.lopes@sanctus.example')
    await user.type(screen.getByLabelText('Full name'), 'Marta Lopes')
    await user.type(screen.getByLabelText('Password'), 'a-long-passphrase')
    await user.type(screen.getByLabelText('Confirm password'), 'a-long-passphrase')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    // The reason is shown (not one generic line), and the button now only signs in.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Your account is ready, but signing in failed.')
    expect(alert).toHaveTextContent(/connection/i)
    expect(create).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAttribute('readonly')
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/login')

    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many|wait/i)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('admin home')).toBeInTheDocument()
    expect(auth.signInWithPassword).toHaveBeenCalledTimes(3)
    expect(auth.signInWithPassword).toHaveBeenLastCalledWith('marta@sanctus.test', 'a-long-passphrase')
    // The invitation was used once.
    expect(create).toHaveBeenCalledTimes(1)
  })
})
