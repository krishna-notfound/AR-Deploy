import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { service } from '@/services'

type As = { role: 'super_admin'; platformRole?: 'owner' | 'admin' | 'team' } | { role: 'business_admin'; businessId: string }

const OWNER: As = { role: 'super_admin' }
const BUSINESS: As = { role: 'business_admin', businessId: 'biz_casa' }

function open(as: As, url: string) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(as))
  window.history.replaceState(null, '', url)
  return render(<App />)
}

const sections = () => screen.getByRole('navigation', { name: 'Settings sections' })
const groupNames = () => within(sections()).queryAllByRole('heading', { level: 2 }).map((h) => h.textContent)

/** Pretend the viewport is narrower than 640px (the hub's one breakpoint). */
function mockNarrow() {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

beforeAll(async () => {
  await Promise.all([
    import('@/features/settings/SettingsSectionPage'),
    import('@/features/settings/sections/AccountSection'),
    import('@/features/settings/sections/ProfileSection'),
    import('@/features/settings/sections/BusinessSection'),
    import('@/features/settings/sections/PlatformSection'),
    import('@/features/business/BusinessOverviewPage'),
    import('@/features/business/MyProductsPage'),
    import('@/features/demo/DemoEntryPage'),
  ])
}, 60_000)

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('Settings hub', () => {
  it('/dashboard/settings redirects to /dashboard/settings/account; unknown and hidden sections redirect to account', { timeout: 20_000 }, async () => {
    const first = open(BUSINESS, '/dashboard/settings')
    expect(await screen.findByRole('heading', { level: 1, name: 'My account' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/dashboard/settings/account')
    first.unmount()

    const unknown = open(BUSINESS, '/dashboard/settings/nope')
    await screen.findByRole('heading', { level: 1, name: 'My account' })
    expect(window.location.pathname).toBe('/dashboard/settings/account')
    unknown.unmount()

    // A business owner can't see the platform sections; an Admin can't see the Owner's.
    const hidden = open(BUSINESS, '/dashboard/settings/platform')
    await screen.findByRole('heading', { level: 1, name: 'My account' })
    expect(window.location.pathname).toBe('/dashboard/settings/account')
    hidden.unmount()

    open({ role: 'super_admin', platformRole: 'admin' }, '/admin/settings/platform')
    await screen.findByRole('heading', { level: 1, name: 'My account' })
    expect(window.location.pathname).toBe('/admin/settings/account')
    expect(screen.queryByText("You don't have access to this page")).toBeNull()
  })

  it('business owner sees Your account and Your business groups; Owner sees Your account and Platform; Admin and Team see Your account only', { timeout: 30_000 }, async () => {
    const biz = open(BUSINESS, '/dashboard/settings/account')
    await screen.findByRole('heading', { level: 1, name: 'My account' })
    expect(groupNames()).toEqual(['Your account', 'Your business'])
    expect(within(sections()).getByRole('link', { name: 'Business profile' })).toHaveAttribute('href', '/dashboard/settings/business')
    biz.unmount()

    const owner = open(OWNER, '/admin/settings/account')
    await screen.findByRole('heading', { level: 1, name: 'My account' })
    expect(groupNames()).toEqual(['Your account', 'Platform'])
    expect(within(sections()).getByRole('link', { name: 'General' })).toHaveAttribute('href', '/admin/settings/platform')
    expect(within(sections()).getByRole('link', { name: 'Security policy' })).toHaveAttribute('href', '/admin/settings/security-policy')
    owner.unmount()

    for (const platformRole of ['admin', 'team'] as const) {
      const r = open({ role: 'super_admin', platformRole }, '/admin/settings/account')
      await screen.findByRole('heading', { level: 1, name: 'My account' })
      expect(groupNames()).toEqual(['Your account'])
      const links = within(sections()).getAllByRole('link').map((l) => l.textContent)
      expect(links).toEqual(['My account', 'Profile', 'Security & 2FA', 'Notifications', 'Preferences', 'Security activity'])
      r.unmount()
    }
  })

  it('group headings are sentence case and not uppercase; the root carries data-surface=dashboard', { timeout: 20_000 }, async () => {
    const { container } = open(OWNER, '/admin/settings/account')
    await screen.findByRole('heading', { level: 1, name: 'My account' })
    const root = container.querySelector('[data-settings-root]')
    expect(root).toHaveAttribute('data-surface', 'dashboard')
    expect(document.body.dataset.surface).toBe('dashboard')
    expect(container.querySelector('.uppercase')).toBeNull()
    for (const h of within(sections()).getAllByRole('heading', { level: 2 })) {
      const text = h.textContent ?? ''
      expect(text).toBe(text.charAt(0) + text.slice(1).toLowerCase())
    }
  })

  it('Esc and the close button return to the page that opened settings, or to /dashboard when opened directly', { timeout: 30_000 }, async () => {
    const user = userEvent.setup()
    const direct = open(BUSINESS, '/dashboard/settings/profile')
    await screen.findByRole('heading', { level: 1, name: 'Profile' })
    await user.click(screen.getByRole('button', { name: 'Close settings' }))
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'))
    direct.unmount()

    // Opened from My products through the sidebar: Esc goes back there, even after moving between sections.
    open(BUSINESS, '/dashboard/products')
    await screen.findByRole('heading', { level: 1, name: 'My products' })
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Settings' }))
    await screen.findByRole('heading', { level: 1, name: 'My account' })
    await user.click(within(sections()).getByRole('link', { name: 'Profile' }))
    await screen.findByRole('heading', { level: 1, name: 'Profile' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard/products'))
    expect(await screen.findByRole('heading', { level: 1, name: 'My products' })).toBeInTheDocument()
  })

  it("below 640px the section list is shown first and choosing a section shows it with a 'Settings' back link", { timeout: 20_000 }, async () => {
    mockNarrow()
    const user = userEvent.setup()
    open(BUSINESS, '/dashboard/settings')
    await screen.findByRole('navigation', { name: 'Settings sections' })
    expect(window.location.pathname).toBe('/dashboard/settings')
    expect(screen.queryByRole('heading', { level: 1, name: 'My account' })).toBeNull()

    await user.click(within(sections()).getByRole('link', { name: 'Profile' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Settings sections' })).toBeNull()
    const back = screen.getByRole('link', { name: 'Settings' })
    expect(back).toHaveAttribute('href', '/dashboard/settings')
    await user.click(back)
    expect(await screen.findByRole('navigation', { name: 'Settings sections' })).toBeInTheDocument()
  })

  it('the sidebar user menu opens Account settings and Security & 2FA', { timeout: 30_000 }, async () => {
    const user = userEvent.setup()
    const first = open(BUSINESS, '/dashboard')
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    await user.click(within(nav).getByRole('button', { name: /Account menu/ }))
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent)
    expect(items).toEqual(['Account settings', 'Security & 2FA', 'Sign out'])
    await user.click(screen.getByRole('menuitem', { name: 'Security & 2FA' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Security & 2FA' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/dashboard/settings/security')
    first.unmount()

    open(OWNER, '/admin')
    await screen.findByRole('heading', { level: 1, name: 'Overview' })
    const adminNav = screen.getByRole('navigation', { name: 'Main' })
    // The switch-account and log-out icons are still there next to the menu.
    expect(within(adminNav).getByRole('button', { name: 'Switch account' })).toBeInTheDocument()
    expect(within(adminNav).getByRole('button', { name: 'Log out' })).toBeInTheDocument()
    await user.click(within(adminNav).getByRole('button', { name: /Account menu/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Account settings' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'My account' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/admin/settings/account')
    // Settings is full-screen: the dashboard shell is gone.
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
  })

  it('Sign out sits at the bottom of the section list and signs out', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    open(BUSINESS, '/dashboard/settings/account')
    await screen.findByRole('heading', { level: 1, name: 'My account' })
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Choose how to explore the platform.' })).toBeInTheDocument()
    expect(localStorage.getItem(ACCOUNT_KEY)).toBeNull()
  })

  it('Business profile section renders the existing BusinessForm', { timeout: 20_000 }, async () => {
    open(BUSINESS, '/dashboard/settings/business')
    expect(await screen.findByRole('heading', { level: 1, name: 'Business profile' })).toBeInTheDocument()
    expect(await screen.findByLabelText(/^Business name/)).toHaveValue('Casa Lisboa Interiors')
    expect(screen.getByText(/Changing your catalog address requires platform support./)).toBeInTheDocument()
  })

  it('Platform → General keeps the data backend card', { timeout: 20_000 }, async () => {
    open(OWNER, '/admin/settings/platform')
    expect(await screen.findByRole('heading', { level: 1, name: 'General' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Data backend' })).toBeInTheDocument()
    expect(screen.getByText('Sample asset credits')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset demo data' })).toBeInTheDocument()
    // The old Profile card (name, email, role) moved to the account sections.
    expect(screen.queryByText('Role', { selector: 'dt' })).toBeNull()
  })
})
