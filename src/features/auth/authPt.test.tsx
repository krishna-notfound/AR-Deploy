// The auth, join and demo screens in Portuguese (ADR-0044): the language comes from the saved choice.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { AccountProvider } from '@/auth/AccountProvider'
import { beforeEach, describe, expect, it } from 'vitest'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { DemoAccounts } from '../demo/DemoAccounts'
import NotFoundPage from '../demo/NotFoundPage'
import { TwoFactorStep } from './TwoFactorStep'
import { authErrorText } from './authErrors'
import { translate } from '@/i18n/translate'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(LANG_KEY, 'pt')
})

const inPt = (ui: React.ReactNode) =>
  render(
    <LanguageProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </LanguageProvider>,
  )

describe('auth, join and demo in Portuguese', () => {
  it('the 404 page', () => {
    inPt(<NotFoundPage />)
    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument()
    expect(screen.getByText('Erro 404')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir para a página inicial' })).toBeInTheDocument()
  })

  it('the 2FA step, its labels and its refusal', async () => {
    const user = userEvent.setup()
    inPt(<TwoFactorStep onVerified={() => {}} onRecovered={() => {}} onSignOut={() => {}} />)
    expect(screen.getByText('Introduza o código de 6 dígitos da sua aplicação de autenticação')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verificar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Terminar sessão' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Usar um código de recuperação' }))
    await user.click(screen.getByRole('button', { name: 'Entrar com código de recuperação' }))
    expect(screen.getAllByText('Introduza um dos seus códigos de recuperação.').length).toBeGreaterThan(0)
  })

  it('the demo account picker', async () => {
    inPt(
      <AccountProvider>
        <DemoAccounts />
      </AccountProvider>,
    )
    expect(await screen.findByText('Catálogos públicos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar como Super Administrador' })).toBeInTheDocument()
    expect(await screen.findAllByText(/produtos? publicados?/)).not.toHaveLength(0)
  })

  it('Supabase Auth errors are sentences in the language', () => {
    const t = (key: Parameters<typeof translate>[1]) => translate('pt', key)
    expect(authErrorText(t, { code: 'UNKNOWN', message: 'x', reason: 'invalid_credentials' })).toBe('E-mail ou palavra-passe incorretos.')
  })
})
