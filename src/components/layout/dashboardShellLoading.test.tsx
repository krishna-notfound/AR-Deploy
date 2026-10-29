// Editor load speed: the shell shows a page-shaped skeleton while a route's code downloads, and the Editor nav item
// warms its code on intent (pointer, focus, touch) without importing editor code into the shell.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { lazy } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { service } from '@/services'
import { resetMockAccount } from '@/services/mock/mockAccount'
import { DashboardShell } from './DashboardShell'
import type { NavItem } from './nav'
import { adminNav } from './nav'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  resetMockAccount()
  await service.resetDemoData()
})
afterEach(() => vi.restoreAllMocks())

function renderShell(nav: NavItem[], child: React.ReactNode = <p>Admin home</p>) {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/admin']}>
        <AccountProvider>
          <Routes>
            <Route path="/admin" element={<DashboardShell nav={nav} variant="admin" />}>
              <Route index element={child} />
            </Route>
          </Routes>
        </AccountProvider>
      </MemoryRouter>
    </ToastProvider>,
  )
}

describe('dashboard shell loading fallback', () => {
  it('renders the page skeleton (a labelled status), not a spinner, while a route loads', async () => {
    const Never = lazy(() => new Promise<{ default: () => React.ReactElement }>(() => {}))
    renderShell(adminNav, <Never />)
    const status = await screen.findByRole('status', { name: 'Loading…' })
    // A title bar, a subtitle bar and table rows: several flat skeleton bars, no spinning icon.
    expect(status.querySelectorAll('span[aria-hidden]').length).toBeGreaterThan(8)
    expect(status.querySelector('.animate-spin')).toBeNull()
  })
})

describe('nav preload on intent', () => {
  it('the Editor item has a preload; others do not', () => {
    expect(adminNav.find((i) => i.to === '/admin/editor')?.preload).toBeTypeOf('function')
    expect(adminNav.find((i) => i.to === '/admin/products')?.preload).toBeUndefined()
  })

  it('hover, focus and touch call the item preload once (repeats within a moment are ignored)', async () => {
    const preload = vi.fn()
    const nav: NavItem[] = adminNav.map((i) => (i.to === '/admin/editor' ? { ...i, preload } : i))
    renderShell(nav)
    const link = await screen.findByRole('link', { name: /website editor/i })
    const user = userEvent.setup()
    await user.hover(link)
    expect(preload).toHaveBeenCalledTimes(1)
    link.focus()
    await user.pointer({ keys: '[TouchA]', target: link })
    expect(preload).toHaveBeenCalledTimes(1)
  })

  it('an item without a preload does nothing on hover', async () => {
    renderShell(adminNav)
    const user = userEvent.setup()
    await user.hover(await screen.findByRole('link', { name: /^All products/i }))
  })
})
