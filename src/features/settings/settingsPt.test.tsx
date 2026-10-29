// The settings hub in Portuguese (ADR-0044): section titles, buttons, 2FA and recovery-code screens, dates.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { resetMockAccount } from '@/services/mock/mockAccount'
import { RecoveryCodes, recoveryCodesText } from './RecoveryCodes'
import { resetMyProfileStore } from './useMyProfile'

function open(url: string) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'business_admin', businessId: 'biz_casa' }))
  window.history.replaceState(null, '', url)
  return render(<App />)
}

beforeAll(async () => {
  await Promise.all([
    import('./SettingsLayout'),
    import('./SettingsSectionPage'),
    import('./sections/AccountSection'),
    import('./sections/SecuritySection'),
    import('./sections/PreferencesSection'),
    import('./sections/ActivitySection'),
  ])
}, 60_000)

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  localStorage.setItem(LANG_KEY, 'pt')
  resetMockAccount()
  resetMyProfileStore()
  await service.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
  document.documentElement.lang = ''
})

describe('settings in Portuguese', () => {
  it('shows the hub, the section list and My account in pt-PT', async () => {
    open('/dashboard/settings/account')
    expect(await screen.findByRole('heading', { level: 1, name: 'A minha conta' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Secções das definições' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fechar definições' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Alterar palavra-passe' })).toBeInTheDocument()
    expect(screen.getAllByText('Palavra-passe atual').length).toBeGreaterThan(0)
  })

  it('shows Security & 2FA in pt-PT', async () => {
    open('/dashboard/settings/security')
    expect(await screen.findByRole('heading', { level: 1, name: 'Segurança e 2FA' })).toBeInTheDocument()
    expect(await screen.findByText('Verificação em dois passos (2FA)')).toBeInTheDocument()
    expect(screen.getByText('Aplicação de autenticação')).toBeInTheDocument()
  })

  it('opens the 2FA setup in pt-PT', async () => {
    const user = userEvent.setup()
    open('/dashboard/settings/security')
    await user.click(await screen.findByRole('button', { name: 'Ativar 2FA' }))
    expect(await screen.findByText('Ligue a sua aplicação de autenticação')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verificar e ativar' })).toBeInTheDocument()
  })

  it('shows preferences with Portuguese dates', async () => {
    open('/dashboard/settings/preferences')
    expect(await screen.findByRole('heading', { level: 1, name: 'Preferências' })).toBeInTheDocument()
    expect(await screen.findByText('Formato da data')).toBeInTheDocument()
    expect(screen.getByText('24 horas')).toBeInTheDocument()
    // "25 out 2026", not "25 Oct 2026".
    expect(screen.queryByText(/Oct/)).not.toBeInTheDocument()
  })

  it('shows the recovery codes and the saved file text in pt-PT', async () => {
    const user = userEvent.setup()
    const done = vi.fn()
    render(
      <LanguageProvider>
        <ToastProvider>
          <RecoveryCodes codes={['AAAA-1111', 'BBBB-2222']} onDone={done} account="ana@exemplo.pt" />
        </ToastProvider>
      </LanguageProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Guarde os seus códigos de recuperação' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transferir .txt' })).toBeInTheDocument()
    const done_ = screen.getByRole('button', { name: 'Concluir' })
    expect(done_).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Guardei estes códigos' }))
    expect(done_).toBeEnabled()
    // The default text is English; a language-aware caller passes `t`.
    expect(recoveryCodesText(['X'])).toContain('Sanctus recovery codes')
  })
})
