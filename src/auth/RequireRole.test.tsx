import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { RequireRole } from './RequireRole'

const account = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('./AccountProvider', () => ({ useAccount: () => ({ retry: () => {}, logout: async () => ({ signedOut: true }), ...account.value }) }))

function renderGuard() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <MemoryRouter>
          <RequireRole allow="super_admin">
            <p>inside</p>
          </RequireRole>
        </MemoryRouter>
      </ToastProvider>
    </LanguageProvider>,
  )
}

describe('RequireRole wording', () => {
  beforeEach(() => localStorage.setItem(LANG_KEY, 'pt'))
  afterEach(() => localStorage.clear())

  it('words a failed account load in Portuguese, from the error code', () => {
    account.value = { user: undefined, accountError: 'Database unavailable', accountFailure: { code: 'UNKNOWN', message: 'Database unavailable' } }
    renderGuard()
    expect(screen.getByText(/Não foi possível carregar a sua conta\./)).toBeInTheDocument()
    expect(screen.queryByText(/Database unavailable/)).not.toBeInTheDocument()
  })

  it('names the roles in Portuguese on the wrong-area screen', () => {
    account.value = { user: { role: 'business_admin' } }
    renderGuard()
    expect(screen.getByRole('heading')).toHaveTextContent('Esta área é para contas de Super Administrador')
  })
})
