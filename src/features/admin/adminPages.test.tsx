import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import type { Permission } from '@/domain/types'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { DashboardContext } from '@/components/layout/dashboardContext'
import { Monogram } from '../applications/Monogram'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { account, service } from '@/services'
import { fail, ok } from '@/services/catalogService'
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
    acceptedTerms: true,
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
    // R-W1-3: the requests are loaded for everyone with businesses.view (for the read-only badge); the filter and
    // the orphan requests stay the Owner's.
    expect(list).toHaveBeenCalled()
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
    // S1.5 R-W7-6: demo mode sends no email, and the toast says so.
    expect(await screen.findByText('Closure completed, but the notice email was not sent: Demo mode: no email is sent.')).toBeInTheDocument()
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

describe('BusinessesListPage: an open closure is visible and blocks activation (R-W1-3)', () => {
  const CLOSURE_PENDING = 'This business has an open closure request. Only the platform Owner can restore it or complete it.'
  const OAK_REQUEST = { userId: 'usr_oak', email: 'owner@oak.example', businessId: 'biz_oak', businessName: 'Oak & Ember Studio', requestedAt: '2026-10-20T10:00:00.000Z' }

  /** The menu items of one business row (the desktop table; the mobile list repeats them). */
  async function menuItemsFor(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click((await screen.findAllByRole('button', { name: `Actions for ${name}` }))[0]!)
    const items = screen.getAllByRole('menuitem').map((m) => m.textContent?.trim())
    await user.keyboard('{Escape}')
    return items
  }

  it("'Closure requested on {date}' badge for a businesses.view user", async () => {
    vi.spyOn(account, 'listClosureRequests').mockResolvedValue(ok([OAK_REQUEST]))
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'team' }))
    renderAt('/admin/businesses', <BusinessesListPage />)
    const badges = await screen.findAllByText(/^Closure requested on .*2026/)
    expect(badges.length).toBeGreaterThan(0)
    // Only on the business that asked.
    for (const b of badges) expect(b.closest('tr, li')?.textContent).toContain('Oak & Ember Studio')
  })

  it('Activate is hidden while a request is open, with the closure_pending copy as its tooltip', async () => {
    vi.spyOn(account, 'listClosureRequests').mockResolvedValue(ok([OAK_REQUEST]))
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
    const user = userEvent.setup()
    renderAt('/admin/businesses', <BusinessesListPage />)
    const badge = (await screen.findAllByText(/^Closure requested on /))[0]!
    expect(badge.closest('[title]')).toHaveAttribute('title', CLOSURE_PENDING)
    expect(await menuItemsFor(user, 'Oak & Ember Studio')).not.toContain('Activate catalog')
    // A business without a request keeps its status action.
    expect(await menuItemsFor(user, 'Nordhaus Living')).toContain('Deactivate catalog')
  })

  it('offers Activate for an inactive business only once the closure list has loaded without a request for it', async () => {
    vi.spyOn(account, 'listClosureRequests').mockResolvedValue(ok([]))
    const user = userEvent.setup()
    renderAt('/admin/businesses', <BusinessesListPage />)
    await waitFor(async () => expect(await menuItemsFor(user, 'Oak & Ember Studio')).toContain('Activate catalog'))
    expect(screen.queryByText(/^Closure requested on /)).toBeNull()
  })

  it('a request opened after the page loaded: Activate is refused with the closure_pending copy', async () => {
    // The page's list is stale (no request), and the service refuses as the database does (closure_pending).
    vi.spyOn(account, 'listClosureRequests').mockResolvedValue(ok([]))
    vi.spyOn(service, 'setBusinessStatus').mockResolvedValue({ ok: false, error: { code: 'CONFLICT', message: CLOSURE_PENDING, reason: 'closure_pending' } })
    const user = userEvent.setup()
    renderAt('/admin/businesses', <BusinessesListPage />)
    await waitFor(async () => expect(await menuItemsFor(user, 'Oak & Ember Studio')).toContain('Activate catalog'))
    await user.click((await screen.findAllByRole('button', { name: 'Actions for Oak & Ember Studio' }))[0]!)
    await user.click(screen.getByRole('menuitem', { name: 'Activate catalog' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Activate catalog' }))
    expect(await screen.findByText('Catalog not activated')).toBeInTheDocument()
    expect(screen.getByText(CLOSURE_PENDING)).toBeInTheDocument()
  })

  it('while the closure list loads, Activate is not offered', async () => {
    vi.spyOn(account, 'listClosureRequests').mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    renderAt('/admin/businesses', <BusinessesListPage />)
    expect((await screen.findAllByText('Oak & Ember Studio')).length).toBeGreaterThan(0)
    expect(await menuItemsFor(user, 'Oak & Ember Studio')).not.toContain('Activate catalog')
  })

  it('a failed closure list shows an error with retry, and Activate comes back once it loads', async () => {
    const list = vi.spyOn(account, 'listClosureRequests').mockResolvedValue(fail('UNKNOWN', 'Network down.'))
    const user = userEvent.setup()
    renderAt('/admin/businesses', <BusinessesListPage />)
    expect(await screen.findByText('Could not load the closure requests. Network down.')).toBeInTheDocument()
    expect(await menuItemsFor(user, 'Oak & Ember Studio')).not.toContain('Activate catalog')
    list.mockResolvedValue(ok([]))
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByText(/Could not load the closure requests/)).toBeNull())
    expect(await menuItemsFor(user, 'Oak & Ember Studio')).toContain('Activate catalog')
  })
})

describe('BusinessesListPage: owner state on every row (S1.5 Task 17: R-W2-5)', () => {
  const STATES = [
    { businessId: 'biz_casa', state: 'needs_owner' as const, lastInvitedAt: null, emailFailed: false },
    { businessId: 'biz_nord', state: 'invite_pending' as const, lastInvitedAt: '2026-10-20T10:00:00.000Z', emailFailed: false },
    { businessId: 'biz_verde', state: 'invite_pending' as const, lastInvitedAt: '2026-10-19T10:00:00.000Z', emailFailed: true },
    { businessId: 'biz_oak', state: 'owner_active' as const, lastInvitedAt: '2026-10-01T10:00:00.000Z', emailFailed: false },
  ]
  const shown = (name: string) => screen.queryAllByText(name).length > 0

  it("the owner column shows 'Needs owner', 'Invite pending', 'Invite pending · email not sent' and 'Owner active'; the filter narrows the rows", async () => {
    vi.spyOn(service, 'getOwnerStates').mockResolvedValue(ok(STATES))
    const user = userEvent.setup()
    renderAt('/admin/businesses', <BusinessesListPage />)
    expect(await screen.findByRole('columnheader', { name: /Owner/ })).toBeInTheDocument()
    expect((await screen.findAllByText('Invite pending · email not sent')).length).toBeGreaterThan(0)
    const table = screen.getByRole('table')
    for (const label of ['Needs owner', 'Invite pending', 'Invite pending · email not sent', 'Owner active']) expect(within(table).getByText(label)).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by owner' }), 'needs_owner')
    await waitFor(() => expect(shown('Nordhaus Living')).toBe(false))
    expect(shown('Casa Lisboa Interiors')).toBe(true)
    // "Invite pending" includes the ones whose email was not sent.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by owner' }), 'invite_pending')
    await waitFor(() => expect(shown('Casa Lisboa Interiors')).toBe(false))
    expect(shown('Nordhaus Living')).toBe(true)
    expect(shown('Atelier Verde')).toBe(true)
    expect(shown('Oak & Ember Studio')).toBe(false)
  })

  it("while the states load the column shows a placeholder; on an error the list still renders, with 'Couldn't load owner states.' above it and no owner filter", async () => {
    vi.spyOn(service, 'getOwnerStates').mockReturnValue(new Promise(() => {}))
    const first = renderAt('/admin/businesses', <BusinessesListPage />)
    expect((await screen.findAllByText('Nordhaus Living')).length).toBeGreaterThan(0)
    expect(within(screen.getByRole('table')).getAllByText('Loading owner state').length).toBe(4)
    expect(screen.queryByRole('combobox', { name: 'Filter by owner' })).toBeNull()
    first.unmount()

    vi.spyOn(service, 'getOwnerStates').mockResolvedValue(fail('UNKNOWN', 'Network down'))
    renderAt('/admin/businesses', <BusinessesListPage />)
    expect(await screen.findByText("Couldn't load owner states.")).toBeInTheDocument()
    expect((await screen.findAllByText('Nordhaus Living')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('combobox', { name: 'Filter by owner' })).toBeNull()
    expect(screen.queryByText('Needs owner')).toBeNull()
  })
})

describe('AdminOverviewPage: Recent activity from audit events (R-W5-5)', () => {
  const feed = () => screen.getByRole('region', { name: 'Recent activity' })

  it("unpublishing shows '{name} was unpublished'; a draft is never 'was published'; a paused catalog and a deleted product appear", async () => {
    const all = await service.getProducts()
    if (!all.ok) throw new Error('seed products missing')
    const [live, gone] = all.data.filter((p) => p.status === 'published')
    const draft = all.data.find((p) => p.status === 'draft')!
    expect(await service.unpublishProduct(live!.id)).toMatchObject({ ok: true })
    expect(await service.setBusinessStatus('biz_casa', 'inactive')).toMatchObject({ ok: true })
    expect(await service.deleteProduct(gone!.id)).toMatchObject({ ok: true })
    renderAt('/admin', <AdminOverviewPage />)
    expect(await within(feed()).findByText(`${live!.name.en} was unpublished`)).toBeInTheDocument()
    expect(within(feed()).getByText('Catalog for Casa Lisboa Interiors was paused')).toBeInTheDocument()
    expect(within(feed()).getByText(`${gone!.name.en} was deleted`)).toBeInTheDocument()
    // Newest first: the delete, the pause, the unpublish.
    expect(within(feed()).getAllByRole('listitem').slice(0, 3).map((li) => li.querySelector('p')?.textContent)).toEqual([
      `${gone!.name.en} was deleted`,
      'Catalog for Casa Lisboa Interiors was paused',
      `${live!.name.en} was unpublished`,
    ])
    // A product that was never published never reads "was published", anywhere in its history.
    const history = await service.getRecentActivity({ limit: 500 })
    if (!history.ok) throw new Error(history.error.message)
    expect(history.data.map((a) => a.message)).toContain(`${draft.name.en} was added`)
    expect(history.data.map((a) => a.message)).not.toContain(`${draft.name.en} was published`)
  })

  it('shows loading, then the empty state', async () => {
    let resolve!: (v: Awaited<ReturnType<typeof service.getRecentActivity>>) => void
    vi.spyOn(service, 'getRecentActivity').mockReturnValue(new Promise((r) => (resolve = r)))
    renderAt('/admin', <AdminOverviewPage />)
    expect(await within(await screen.findByRole('region', { name: 'Recent activity' })).findByRole('status', { name: 'Loading' })).toBeInTheDocument()
    resolve(ok([]))
    expect(await within(feed()).findByText('No activity yet')).toBeInTheDocument()
  })

  it('shows an error with retry', async () => {
    const spy = vi.spyOn(service, 'getRecentActivity').mockResolvedValue(fail('UNKNOWN', 'Could not load the activity.'))
    const user = userEvent.setup()
    renderAt('/admin', <AdminOverviewPage />)
    expect(await within(await screen.findByRole('region', { name: 'Recent activity' })).findByText('Could not load the activity.')).toBeInTheDocument()
    spy.mockResolvedValue(ok([{ id: 'a1', at: new Date().toISOString(), kind: 'product_created', message: 'Oslo sofa was added' }]))
    await user.click(within(feed()).getByRole('button', { name: 'Try again' }))
    expect(await within(feed()).findByText('Oslo sofa was added')).toBeInTheDocument()
  })
})

describe('AdminOverviewPage follows permissions (R-W5-1)', () => {
  /** The Overview for a Team member whose role holds exactly `permissions`; resolves once the page has loaded. */
  async function overviewAs(permissions: Permission[]) {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'team' }))
    vi.spyOn(service, 'getMyAccess').mockResolvedValue(ok({ role: 'team', permissions, status: 'active' }))
    const view = renderAt('/admin', <AdminOverviewPage />)
    await screen.findByRole('region', { name: 'Recent activity' })
    return view
  }
  const figures = () => within(screen.getByRole('region', { name: 'Key figures' }))

  it("without analytics.view: 'You don't have access to analytics.'", async () => {
    await overviewAs(['products.view', 'businesses.view'])
    expect(await screen.findByText("You don't have access to analytics.")).toBeInTheDocument()
    await waitFor(() => expect(figures().getByText('Drafts')).toBeInTheDocument())
    expect(figures().queryByText('Product page views')).toBeNull()
    expect(figures().queryByText('AR launch attempts')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Views and AR launch attempts' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Most viewed products' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Open analytics|Full ranking/ })).toBeNull()
  })

  it('product counts need products.view, business counts need businesses.view', async () => {
    const first = await overviewAs(['analytics.view', 'products.view'])
    await waitFor(() => expect(figures().getByText('Products')).toBeInTheDocument())
    expect(figures().getByText('Published')).toBeInTheDocument()
    expect(figures().getByText('Drafts')).toBeInTheDocument()
    expect(figures().queryByText('Businesses')).toBeNull()
    expect(screen.queryByText("You don't have access to analytics.")).toBeNull()
    first.unmount()

    await overviewAs(['analytics.view', 'businesses.view'])
    await waitFor(() => expect(figures().getByText('Businesses')).toBeInTheDocument())
    expect(figures().queryByText('Products')).toBeNull()
    expect(figures().queryByText('Published')).toBeNull()
    expect(figures().queryByText('Drafts')).toBeNull()
    expect(figures().getByText('Product page views')).toBeInTheDocument()
    // Most viewed still names the products the database lets this role read (published ones), without edit links.
    const card = (await screen.findByRole('heading', { name: 'Most viewed products' })).closest('.shadow-\\[var\\(--shadow-card\\)\\]') as HTMLElement
    await waitFor(() => expect(within(card).getAllByRole('listitem').length).toBeGreaterThan(0))
    expect(within(card).queryByText('No product activity yet')).toBeNull()
    expect(within(card).queryAllByRole('link').filter((a) => /\/edit$/.test(a.getAttribute('href') ?? ''))).toHaveLength(0)
  })

  it("analytics.view without products.view: viewed products it can't name are explained, not called 'no activity'", async () => {
    // As under RLS with no readable product: the analytics rows are there, the names are not.
    vi.spyOn(service, 'getProducts').mockResolvedValue(ok([]))
    await overviewAs(['analytics.view', 'businesses.view'])
    const card = (await screen.findByRole('heading', { name: 'Most viewed products' })).closest('.shadow-\\[var\\(--shadow-card\\)\\]') as HTMLElement
    expect(await within(card).findByText("Product names need the 'View products' permission.")).toBeInTheDocument()
    expect(within(card).queryByText('No product activity yet')).toBeNull()
  })

  it("Team without applications.view never sees 'No applications awaiting review'", async () => {
    const apps = vi.spyOn(service, 'getApplications')
    await overviewAs(['analytics.view', 'products.view', 'businesses.view'])
    await screen.findByRole('heading', { name: 'Most viewed products' })
    expect(screen.queryByText('No applications awaiting review')).toBeNull()
    expect(screen.queryByRole('link', { name: /applications/i })).toBeNull()
    expect(apps).not.toHaveBeenCalled()
  })

  it('Most viewed rows link to edit only with products.edit', async () => {
    const first = await overviewAs(['analytics.view', 'products.view'])
    const list = async () => {
      const card = (await screen.findByRole('heading', { name: 'Most viewed products' })).closest('.shadow-\\[var\\(--shadow-card\\)\\]') as HTMLElement
      await waitFor(() => expect(within(card).getAllByRole('listitem').length).toBeGreaterThan(0))
      return card
    }
    expect(within(await list()).queryAllByRole('link').filter((a) => /\/edit$/.test(a.getAttribute('href') ?? ''))).toHaveLength(0)
    first.unmount()

    await overviewAs(['analytics.view', 'products.view', 'products.edit'])
    const card = await list()
    const rows = within(card).getAllByRole('listitem')
    for (const li of rows) expect(within(li).getByRole('link')).toHaveAttribute('href', expect.stringMatching(/^\/admin\/products\/[^/]+\/edit$/))
  })
})
