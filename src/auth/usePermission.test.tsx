import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { service } from '@/services'
import { ACCOUNT_KEY } from './AccountProvider'

/** Renders the whole app at `url` as a demo platform user with the given role (ADR-0029). */
function openAs(platformRole: 'owner' | 'admin' | 'team', url: string) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole }))
  window.history.replaceState(null, '', url)
  return render(<App />)
}
const mainNav = () => screen.getByRole('navigation', { name: 'Main' })

beforeAll(async () => {
  await Promise.all([
    import('@/features/admin/AdminOverviewPage'),
    import('@/features/admin/AdminSettingsPage'),
    import('@/features/admin/AdminProductsPage'),
    import('@/features/admin/ApplicationsPage'),
  ])
}, 60_000)

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('permission-aware dashboard (ADR-0029)', () => {
  it('Team sees only the places its permissions allow', { timeout: 20_000 }, async () => {
    openAs('team', '/admin')
    await screen.findByRole('heading', { level: 1, name: 'Overview' })
    const nav = mainNav()
    expect(within(nav).getByRole('link', { name: /Analytics/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /All Products/ })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /Team & Access/ })).toBeNull()
    expect(within(nav).queryByRole('link', { name: /Settings/ })).toBeNull()
    expect(within(nav).queryByRole('link', { name: /Audit log/ })).toBeNull()
  })

  it('a blocked page says so instead of showing data', { timeout: 20_000 }, async () => {
    openAs('team', '/admin/settings')
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument()
    expect(screen.getByText('Ask the platform owner if you need it.')).toBeInTheDocument()
  })

  it('Team cannot publish or delete from the product list', { timeout: 20_000 }, async () => {
    openAs('team', '/admin/products')
    await screen.findByRole('heading', { level: 1, name: 'All products' })
    const [menu] = await screen.findAllByRole('button', { name: /^Actions for / })
    await userEvent.click(menu!)
    const items = (await screen.findAllByRole('menuitem')).map((i) => i.textContent)
    expect(items).toContain('Edit')
    expect(items.some((t) => /^(Publish|Unpublish|Delete)$/.test(t ?? ''))).toBe(false)
  })

  it('Owner keeps Publish and Delete in the product menu', { timeout: 20_000 }, async () => {
    openAs('owner', '/admin/products')
    const [menu] = await screen.findAllByRole('button', { name: /^Actions for / })
    await userEvent.click(menu!)
    const items = (await screen.findAllByRole('menuitem')).map((i) => i.textContent)
    expect(items).toContain('Delete')
    expect(items.some((t) => /^(Publish|Unpublish)$/.test(t ?? ''))).toBe(true)
  })

  it('Admin sees Applications; the Owner also sees Team & Access', { timeout: 20_000 }, async () => {
    const { unmount } = openAs('admin', '/admin')
    await screen.findByRole('heading', { level: 1, name: 'Overview' })
    expect(within(mainNav()).getByRole('link', { name: /Applications/ })).toBeInTheDocument()
    expect(within(mainNav()).queryByRole('link', { name: /Team & Access/ })).toBeNull()
    unmount()
    openAs('owner', '/admin')
    await screen.findByRole('heading', { level: 1, name: 'Overview' })
    expect(within(mainNav()).getByRole('link', { name: /Team & Access/ })).toBeInTheDocument()
  })
})
