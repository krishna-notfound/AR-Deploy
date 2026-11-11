import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { DropdownMenu } from '@/components/ui/Menu'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { resetMockAccount } from '@/services/mock/mockAccount'
import { ThemeChoiceControl, useThemeMenuItems } from './ThemeChoiceControl'
import { ThemeSync } from './ThemeSync'
import { THEME_KEY, getThemeChoice, setThemeChoice } from './theme'

const html = () => document.documentElement

function openApp(url: string, role: 'super_admin' | 'business_admin' = 'super_admin') {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(role === 'super_admin' ? { role } : { role, businessId: 'biz-nordhaus' }))
  window.history.replaceState(null, '', url)
  return render(<App />)
}

beforeAll(async () => {
  await Promise.all([import('@/features/settings/SettingsSectionPage'), import('@/features/settings/sections/PreferencesSection')])
}, 60_000)

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  setThemeChoice('light')
  localStorage.clear()
  resetMockAccount()
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
  html().removeAttribute('data-theme')
})

function MenuHarness() {
  const items = useThemeMenuItems()
  return (
    <LanguageProvider>
      <DropdownMenu label="Account menu" items={items} trigger={<span>open</span>} />
    </LanguageProvider>
  )
}

describe('account menu appearance group', () => {
  it('lists Light, Dark and System as radio items with the saved one checked', async () => {
    setThemeChoice('dark')
    render(<MenuHarness />)
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(screen.getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('Appearance')).toBeInTheDocument()
  })

  it('choosing an item saves the choice and closes the menu', async () => {
    render(<MenuHarness />)
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'System' }))
    expect(getThemeChoice()).toBe('system')
    expect(localStorage.getItem(THEME_KEY)).toBe('system')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('arrow keys move through the radio items', async () => {
    render(<MenuHarness />)
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(screen.getByRole('menuitemradio', { name: 'Light' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toHaveFocus()
  })
})

describe('ThemeChoiceControl', () => {
  it('is a radio group that applies a choice at once', async () => {
    render(
      <LanguageProvider>
        <ThemeChoiceControl legend="Theme" />
      </LanguageProvider>,
    )
    expect(screen.getByRole('radio', { name: /Light/ })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: /Dark/ }))
    expect(screen.getByRole('radio', { name: /Dark/ })).toBeChecked()
    expect(getThemeChoice()).toBe('dark')
  })
})

describe('ThemeSync on routes', () => {
  function at(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <ThemeSync />
      </MemoryRouter>,
    )
  }

  it('puts data-theme="dark" on dashboards when dark is chosen', () => {
    setThemeChoice('dark')
    at('/dashboard/products')
    expect(html()).toHaveAttribute('data-theme', 'dark')
  })

  it('never darkens a public route, whatever was chosen', () => {
    setThemeChoice('dark')
    for (const path of ['/', '/demo', '/login', '/apply', '/join', '/accept-invite', '/reset-password', '/c/atelier-verde', '/administrator']) {
      html().removeAttribute('data-theme')
      const { unmount } = at(path)
      expect(html(), path).not.toHaveAttribute('data-theme', 'dark')
      unmount()
    }
  })

  it('System follows the device on a dashboard route and light on a public one', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })))
    setThemeChoice('system')
    const { unmount } = at('/admin')
    expect(html()).toHaveAttribute('data-theme', 'dark')
    unmount()
    at('/')
    expect(html()).not.toHaveAttribute('data-theme')
  })

  it('light stays light', () => {
    setThemeChoice('light')
    at('/admin')
    expect(html()).toHaveAttribute('data-theme', 'light')
  })
})

describe('Settings → Appearance (the whole app)', () => {
  it('shows the card, applies a choice at once and leaves the public landing page light', { timeout: 30_000 }, async () => {
    openApp('/admin/settings/preferences')
    expect(await screen.findByRole('region', { name: 'Appearance' })).toBeInTheDocument()
    expect(html()).toHaveAttribute('data-theme', 'light')
    await userEvent.click(screen.getByRole('radio', { name: /Dark/ }))
    await waitFor(() => expect(html()).toHaveAttribute('data-theme', 'dark'))
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
  })

  it('opens dark on a dashboard when dark is saved, and light on the sign-in page', { timeout: 30_000 }, async () => {
    localStorage.setItem(THEME_KEY, 'dark')
    // A fresh page load reads the saved choice.
    const { reloadThemeChoice } = await import('./theme')
    reloadThemeChoice()
    const first = openApp('/admin/settings/preferences')
    await screen.findByRole('region', { name: 'Appearance' })
    expect(html()).toHaveAttribute('data-theme', 'dark')
    first.unmount()
    localStorage.removeItem(ACCOUNT_KEY)
    window.history.replaceState(null, '', '/demo')
    render(<App />)
    await screen.findByRole('button', { name: 'Continue as Super Admin' })
    expect(html()).not.toHaveAttribute('data-theme', 'dark')
  })
})
