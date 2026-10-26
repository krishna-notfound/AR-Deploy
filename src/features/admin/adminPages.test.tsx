import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { DashboardContext } from '@/components/layout/dashboardContext'
import { Monogram } from '../applications/Monogram'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { account, service } from '@/services'
import { ok } from '@/services/catalogService'
import { DEMO_CODE, resetMockAccount } from '@/services/mock/mockAccount'
import AdminOverviewPage from './AdminOverviewPage'
import ApplicationsPage from './ApplicationsPage'
import BusinessesListPage from './BusinessesListPage'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
  resetMockAccount()
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** The demo seed has no applications: submit one so the list has an open row (a "Review" button). */
async function submitApplication() {
  const res = await service.submitApplication({
    businessName: 'Atelier Norte',
    website: 'atelier-norte.example',
    description: 'Solid oak furniture made in Porto.',
    category: 'furniture',
    country: 'Portugal',
    city: 'Porto',
    applicantName: 'Rita Sousa',
    applicantRole: '',
    applicantEmail: 'rita@atelier.test',
    applicantPhone: '',
    language: 'pt',
    productCount: '11-50',
    photoReadiness: 'all',
    modelReadiness: 'none',
    notes: '',
    consent: true,
    submissionKey: crypto.randomUUID(),
  })
  expect(res.ok).toBe(true)
}

function renderAt(path: string, element: React.ReactElement) {
  const router = createMemoryRouter([{ path, element }], { initialEntries: [path] })
  return render(
    <AccountProvider>
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ToastProvider>
    </AccountProvider>,
  )
}

describe('AdminOverviewPage', () => {
  it('does not show the "Recently added products" or "Recently created businesses" panels', async () => {
    renderAt('/admin', <AdminOverviewPage />)
    await screen.findByRole('heading', { name: 'Most viewed products' })
    expect(screen.queryByRole('heading', { name: 'Recently added products' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Recently created businesses' })).not.toBeInTheDocument()
  })

  it('shows "View catalogs" as a quiet text button and has exactly one primary button', async () => {
    const { container } = renderAt('/admin', <AdminOverviewPage />)
    const view = await screen.findByRole('link', { name: 'View catalogs' })
    expect(view.className).toMatch(/text-accent-ink|hover:bg-subtle/)
    expect(view.classList.contains('bg-ink')).toBe(false)
    expect(view.classList.contains('border')).toBe(false)
    const primary = [...container.querySelectorAll('a, button')].filter((el) => el.classList.contains('bg-ink'))
    expect(primary).toHaveLength(1)
    expect(primary[0]).toHaveTextContent('Create business')
  })
})

describe('ApplicationsPage', () => {
  beforeEach(submitApplication)

  it('shows "Review" as an outlined secondary button, not a filled one', async () => {
    renderAt('/admin/applications', <ApplicationsPage />)
    const reviews = await screen.findAllByRole('link', { name: 'Review' })
    expect(reviews.length).toBeGreaterThan(0)
    for (const r of reviews) {
      expect(r.classList.contains('bg-ink')).toBe(false)
      expect(r.classList.contains('border')).toBe(true)
      expect(r.classList.contains('border-line-strong')).toBe(true)
    }
  })

  it('renders the list through the shared table with sentence-case column headers', async () => {
    renderAt('/admin/applications', <ApplicationsPage />)
    const table = await screen.findByRole('table', { name: 'Business applications' })
    const headers = within(table).getAllByRole('columnheader')
    expect(headers.length).toBeGreaterThanOrEqual(4)
    for (const h of headers) expect(h.closest('thead')?.className ?? '').not.toMatch(/uppercase|tracking-/)
    expect(headers[0]?.closest('tr')?.className ?? '').toMatch(/text-\[13px\]/)
  })

  it('does not dim the tab counts', async () => {
    const { container } = renderAt('/admin/applications', <ApplicationsPage />)
    await screen.findAllByRole('link', { name: 'Review' })
    expect(container.querySelector('[role="tablist"] .opacity-75')).toBeNull()
  })
})

describe('Monogram', () => {
  it('is a 32px Inter 12/500 square inside the dashboard and the 40px serif mark elsewhere', () => {
    const { container, rerender } = render(<Monogram name="Oak & Ember" />)
    expect(container.firstElementChild).toHaveClass('size-10', 'font-display')
    rerender(
      <DashboardContext.Provider value={{ variant: 'admin', home: 'Sanctus Admin', homeTo: '/admin', eyebrow: '' }}>
        <Monogram name="Oak & Ember" />
      </DashboardContext.Provider>,
    )
    expect(container.firstElementChild).toHaveClass('size-8', 'text-[12px]', 'font-medium')
    expect(container.firstElementChild).not.toHaveClass('font-display')
    expect(container.firstElementChild).toHaveTextContent('OE')
  })
})

describe('AdminOverviewPage header at narrow widths', () => {
  it('keeps Create business inline and moves View catalogs and Add product to the More menu below sm', async () => {
    const user = userEvent.setup()
    renderAt('/admin', <AdminOverviewPage />)
    const create = await screen.findByRole('link', { name: 'Create business' })
    expect(create).not.toHaveClass('max-sm:hidden')
    expect(screen.getByRole('link', { name: 'View catalogs' })).toHaveClass('max-sm:hidden')
    expect(screen.getByRole('link', { name: 'Add product' })).toHaveClass('max-sm:hidden')
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    const menu = screen.getByRole('menu', { name: 'More actions' })
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent?.trim())).toEqual(['View catalogs', 'Add product'])
  })
})

describe('BusinessesListPage: closure requests (Owner only)', () => {
  /** The demo's one closure request, pointed at a seeded business (Oak & Ember, inactive). */
  function closureOn(businessId: string) {
    const original = account.listClosureRequests.bind(account)
    return vi.spyOn(account, 'listClosureRequests').mockImplementation(async () => {
      const r = await original()
      return r.ok ? ok(r.data.map((x) => ({ ...x, businessId }))) : r
    })
  }

  it('Businesses: Closure requested filter lists requested businesses', async () => {
    closureOn('biz_oak')
    const user = userEvent.setup()
    renderAt('/admin/businesses', <BusinessesListPage />)
    expect((await screen.findAllByText('Nordhaus Living')).length).toBeGreaterThan(0)
    const chip = await screen.findByRole('button', { name: 'Closure requested 1' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await user.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText('Oak & Ember Studio').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Nordhaus Living')).toHaveLength(0)
    expect(screen.queryAllByText('Casa Lisboa Interiors')).toHaveLength(0)
    // Off again: every business.
    await user.click(chip)
    expect(screen.getAllByText('Nordhaus Living').length).toBeGreaterThan(0)
  })

  it('says so when no business has asked to close', async () => {
    vi.spyOn(account, 'listClosureRequests').mockResolvedValue(ok([]))
    const user = userEvent.setup()
    renderAt('/admin/businesses', <BusinessesListPage />)
    const chip = await screen.findByRole('button', { name: 'Closure requested 0' })
    await user.click(chip)
    expect(await screen.findByText('No closure requests')).toBeInTheDocument()
  })

  it('none of these appear for Admin or Team', async () => {
    const list = closureOn('biz_oak')
    for (const platformRole of ['admin', 'team'] as const) {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole }))
      const { unmount } = renderAt('/admin/businesses', <BusinessesListPage />)
      expect((await screen.findAllByText('Nordhaus Living')).length).toBeGreaterThan(0)
      expect(screen.queryByRole('button', { name: /Closure requested/ })).toBeNull()
      expect(screen.queryByRole('region', { name: 'Requests without a business' })).toBeNull()
      unmount()
    }
    expect(list).not.toHaveBeenCalled()
  })

  it('lists a closure request whose business is gone, and completes it with the action code', async () => {
    // The demo request names a business that is not on the platform (as after a partly finished closure).
    const e = await account.startTotpEnrollment()
    if (!e.ok) throw new Error('enrollment did not start')
    await account.confirmTotpEnrollment(e.data.factorId, DEMO_CODE)
    const complete = vi.spyOn(account, 'completeClosure')
    const user = userEvent.setup()
    renderAt('/admin/businesses', <BusinessesListPage />)
    const chip = await screen.findByRole('button', { name: 'Closure requested 1' })
    expect(screen.queryByRole('region', { name: 'Requests without a business' })).toBeNull()
    await user.click(chip)
    const orphans = await screen.findByRole('region', { name: 'Requests without a business' })
    expect(within(orphans).getByText('closing@demo.example')).toBeInTheDocument()
    await user.click(within(orphans).getByRole('button', { name: 'Complete closure for closing@demo.example' }))
    const dialog = await screen.findByRole('dialog', { name: 'Complete closure for closing@demo.example?' })
    await within(dialog).findByText(/We emailed a 6-digit code/)
    await user.type(within(dialog).getByLabelText('6-digit code'), DEMO_CODE)
    await user.click(within(dialog).getByRole('button', { name: 'Complete closure' }))
    expect(await screen.findByText('Closure completed')).toBeInTheDocument()
    expect(complete).toHaveBeenCalledWith('demo-closing-owner', DEMO_CODE)
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Requests without a business' })).toBeNull())
    expect(screen.getByRole('button', { name: 'Closure requested 0' })).toBeInTheDocument()
  })
})

describe('BusinessesListPage: catalog menu item by status (R-W3-8)', () => {
  it("a non-active business shows 'Preview catalog' linking with preview; an active one shows 'Open catalog'", async () => {
    const user = userEvent.setup()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    renderAt('/admin/businesses', <BusinessesListPage />)
    expect((await screen.findAllByText('Nordhaus Living')).length).toBeGreaterThan(0)
    // Nordhaus is active; Oak & Ember is inactive.
    await user.click((await screen.findAllByRole('button', { name: /Actions for Nordhaus Living/ }))[0]!)
    await user.click(await screen.findByRole('menuitem', { name: 'Open catalog' }))
    expect(open).toHaveBeenLastCalledWith('/catalog/nordhaus', '_blank', 'noopener')
    await user.click((await screen.findAllByRole('button', { name: /Actions for Oak & Ember Studio/ }))[0]!)
    expect(screen.queryByRole('menuitem', { name: 'Open catalog' })).toBeNull()
    await user.click(await screen.findByRole('menuitem', { name: 'Preview catalog' }))
    expect(open).toHaveBeenLastCalledWith('/catalog/oak-ember?preview=1', '_blank', 'noopener')
  })
})
