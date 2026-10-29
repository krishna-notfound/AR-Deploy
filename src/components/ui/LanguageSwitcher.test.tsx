// One language switch, the landing page's, on every surface (ADR-0044).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { service } from '@/services'

function open(url: string, account?: object) {
  if (account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account))
  window.history.replaceState(null, '', url)
  return render(<App />)
}

const switches = () => screen.queryAllByRole('radiogroup', { name: 'Language' })

beforeAll(async () => {
  await Promise.all([
    import('@/features/auth/LoginPage'),
    import('@/features/demo/DemoEntryPage'),
    import('@/features/join/JoinPage'),
    import('@/features/settings/SettingsLayout'),
    import('@/features/settings/SettingsSectionPage'),
    import('@/features/settings/sections/AccountSection'),
    import('@/features/admin/AdminOverviewPage'),
  ])
}, 60_000)

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
  document.documentElement.lang = ''
})

describe('LanguageSwitcher placements', () => {
  it('is in the dashboard top bar and in the mobile menu', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    open('/admin', { role: 'super_admin' })
    await screen.findByRole('link', { name: /^Businesses/ })
    expect(switches()).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const drawer = await screen.findByRole('dialog', { name: 'Navigation' })
    expect(within(drawer).getByRole('radiogroup', { name: 'Language' })).toBeInTheDocument()
  })

  it('is in the business dashboard top bar', { timeout: 20_000 }, async () => {
    open('/dashboard', { role: 'business_admin', businessId: 'biz_casa' })
    await screen.findByRole('link', { name: /^My Products/ })
    expect(switches()).toHaveLength(1)
  })

  it('is in the settings hub, wide and narrow', { timeout: 20_000 }, async () => {
    const first = open('/admin/settings/account', { role: 'super_admin' })
    await screen.findByRole('heading', { level: 1, name: 'My account' })
    expect(switches()).toHaveLength(1)
    first.unmount()

    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} }))
    open('/admin/settings')
    await screen.findByRole('heading', { level: 1, name: 'Settings' })
    expect(switches()).toHaveLength(1)
  })

  it('is on the sign-in page, the demo entry page and the join page', { timeout: 20_000 }, async () => {
    for (const url of ['/login', '/demo', '/join']) {
      const view = open(url)
      await screen.findByRole('main')
      expect(switches(), url).toHaveLength(1)
      view.unmount()
    }
  })

  it('choosing PT switches the dashboard text and sets the document language', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    open('/admin', { role: 'super_admin' })
    await screen.findByRole('link', { name: /^Businesses/ })
    await user.click(within(switches()[0]!).getByRole('radio', { name: 'PT' }))
    expect(document.documentElement.lang).toBe('pt-PT')
    expect(localStorage.getItem('arfurn:lang')).toBe('pt')
    expect(await screen.findByRole('link', { name: /^Empresas/ })).toBeInTheDocument()
  })
})
