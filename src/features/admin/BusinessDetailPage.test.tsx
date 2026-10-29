import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { Permission } from '@/domain/types'
import { account, service } from '@/services'
import { fail, ok } from '@/services/catalogService'
import { DEMO_CODE, resetMockAccount } from '@/services/mock/mockAccount'
import BusinessDetailPage from './BusinessDetailPage'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  // The page shows actions by platform permission (ADR-0029): sign in as the demo Owner.
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
  resetMockAccount()
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderPage(tab = 'products') {
  const router = createMemoryRouter([{ path: '/admin/businesses/:businessId', element: <BusinessDetailPage /> }], { initialEntries: [`/admin/businesses/biz_nord?tab=${tab}`] })
  render(
    <AccountProvider>
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ToastProvider>
    </AccountProvider>,
  )
}

describe('BusinessDetailPage', () => {
  it("the Details tab ends with the '3D models' card, whose switch saves for the business", async () => {
    const user = userEvent.setup()
    renderPage('details')
    const card = (await screen.findByRole('heading', { name: '3D models' })).closest('.shadow-\\[var\\(--shadow-card\\)\\]') as HTMLElement
    const sw = within(card).getByRole('switch', { name: 'Can upload its own 3D files' })
    expect(sw).toHaveAttribute('aria-checked', 'true') // Nordhaus may upload its own files
    await user.click(sw)
    await user.click(await screen.findByRole('button', { name: 'Turn off' }))
    await waitFor(() => expect(within(card).getByRole('switch', { name: 'Can upload its own 3D files' })).toHaveAttribute('aria-checked', 'false'))
  })

  // Regression (COR-06): a failed product load rendered "No products yet" and the delete dialog said "0 products".
  it('shows an error with retry, not "No products yet", when the products fail to load', async () => {
    const user = userEvent.setup()
    const original = service.getProductsByBusiness.bind(service)
    const spy = vi.spyOn(service, 'getProductsByBusiness').mockResolvedValue(fail('UNKNOWN', 'Network down.'))
    renderPage()
    expect(await screen.findByText(/Could not load this catalog’s products/)).toBeInTheDocument()
    expect(screen.queryByText('No products yet')).not.toBeInTheDocument()

    spy.mockImplementation(original)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect((await screen.findAllByText('Sheen Lounge Chair')).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Could not load this catalog’s products/)).not.toBeInTheDocument()
    expect(screen.queryByText('No products yet')).not.toBeInTheDocument()
  })

  it('never confirms a delete with a wrong product count when the count is unknown', async () => {
    const user = userEvent.setup()
    vi.spyOn(service, 'getProductsByBusiness').mockResolvedValue(fail('UNKNOWN', 'Network down.'))
    vi.spyOn(service, 'getCatalog').mockResolvedValue(fail('UNKNOWN', 'Network down.'))
    renderPage()
    await screen.findByText(/Could not load this catalog’s products/)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete Nordhaus Living?' })
    expect(within(dialog).getByText(/all of its products/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/0 products/)).not.toBeInTheDocument()
  })

  it('uses the catalogue total for the delete dialog when only the product list failed', async () => {
    const user = userEvent.setup()
    vi.spyOn(service, 'getProductsByBusiness').mockResolvedValue(fail('UNKNOWN', 'Network down.'))
    const catalog = await service.getCatalog('nordhaus')
    if (!catalog.ok) throw new Error('seed catalogue missing')
    renderPage()
    await screen.findByText(/Could not load this catalog’s products/)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const n = catalog.data.totalProductCount
    expect(within(await screen.findByRole('dialog')).getByText(new RegExp(`${n} product${n === 1 ? '' : 's'}\\.`))).toBeInTheDocument()
  })

  it("the delete dialog adds 'The owner's sign-in stays, but they lose access. The application that created it shows as 'Business deleted'.' (R-W2-2)", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete Nordhaus Living?' })
    expect(within(dialog).getByText(/The owner's sign-in stays, but they lose access\. The application that created it shows as 'Business deleted'\./)).toBeInTheDocument()
  })

  it('the delete dialog and the Products tab use the exact count, not the length of a capped product read (R-W5-6)', async () => {
    const user = userEvent.setup()
    // A product read stops at 1000 rows; business_product_counts (behind getCatalog, as on the list) has 1200.
    const catalog = await service.getCatalog('nordhaus')
    if (!catalog.ok) throw new Error('seed catalogue missing')
    vi.spyOn(service, 'getCatalog').mockResolvedValue(ok({ ...catalog.data, totalProductCount: 1200 }))
    renderPage()
    expect((await screen.findAllByText('Sheen Lounge Chair')).length).toBeGreaterThan(0)
    expect(await screen.findByRole('tab', { name: /Products\s*1200/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(within(await screen.findByRole('dialog')).getByText(/1200 products\./)).toBeInTheDocument()
  })

  it('scopes the products tab to one business: no Business column, no repeated name, short panel subtitle', async () => {
    renderPage()
    const table = await screen.findByRole('table')
    await within(table).findByRole('link', { name: 'Sheen Lounge Chair' })
    expect(within(table).queryByRole('columnheader', { name: 'Business' })).toBeNull()
    expect(within(table).queryByText('Nordhaus Living')).toBeNull()
    expect(screen.getByText('Products', { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByText(/’s catalog/)).toBeNull()
  })
})

describe('BusinessDetailPage header at narrow widths', () => {
  const inlineNames = () =>
    screen
      .getAllByRole('button')
      .filter((b) => b.classList.contains('max-sm:hidden'))
      .map((b) => b.textContent?.trim())

  it('keeps Open catalog as the primary and moves Deactivate and Delete to the More menu below sm', async () => {
    const user = userEvent.setup()
    renderPage('details')
    await screen.findByRole('heading', { level: 1, name: 'Nordhaus Living' })
    expect(screen.getByRole('button', { name: /Open catalog/ })).not.toHaveClass('max-sm:hidden')
    expect(inlineNames()).toEqual(['Deactivate', 'Delete'])
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent?.trim())).toEqual(['Deactivate', 'Delete'])
    // The same confirm dialog as the inline button.
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(await screen.findByRole('dialog', { name: 'Delete Nordhaus Living?' })).toBeInTheDocument()
  })

  it('offers in the More menu exactly the actions the role may use inline', async () => {
    const user = userEvent.setup()
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'team' }))
    renderPage('details')
    await screen.findByRole('heading', { level: 1, name: 'Nordhaus Living' })
    const inline = inlineNames()
    const trigger = screen.queryByRole('button', { name: 'More actions' })
    if (inline.length === 0) {
      expect(trigger).toBeNull()
      return
    }
    await user.click(trigger!)
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent?.trim())).toEqual(inline)
  })

  it('truncates the catalog path line', async () => {
    renderPage('details')
    await screen.findByRole('heading', { level: 1, name: 'Nordhaus Living' })
    expect(screen.getByText('/catalog/nordhaus')).toHaveClass('truncate')
  })
})

describe('BusinessDetailPage: Owner tools (closure requests, Reset 2FA)', () => {
  /** The demo Owner sets up their own authenticator, which leaves the session at aal2. */
  async function ownerAtAal2() {
    const e = await account.startTotpEnrollment()
    if (!e.ok) throw new Error('enrollment did not start')
    await account.confirmTotpEnrollment(e.data.factorId, DEMO_CODE)
  }

  /** The demo's one closure request, pointed at a seeded business (Oak & Ember, inactive), still read live. */
  function closureOn(businessId: string) {
    const original = account.listClosureRequests.bind(account)
    return vi.spyOn(account, 'listClosureRequests').mockImplementation(async () => {
      const r = await original()
      return r.ok ? ok(r.data.map((x) => ({ ...x, businessId, businessName: 'Oak & Ember Studio' }))) : r
    })
  }

  const ACCEPTED_OWNER = { userId: 'usr_rita', email: 'rita@nord.example', addedAt: '2026-09-01T10:00:00.000Z', invitedAt: '2026-09-01T10:00:00.000Z', acceptedAt: '2026-09-02T10:00:00.000Z' }

  function renderAt(id: string, tab = 'details') {
    const router = createMemoryRouter(
      [
        { path: '/admin/businesses/:businessId', element: <BusinessDetailPage /> },
        { path: '/admin/businesses', element: <h1>Businesses list</h1> },
      ],
      { initialEntries: [`/admin/businesses/${id}${tab === 'details' ? '' : `?tab=${tab}`}`] },
    )
    render(
      <AccountProvider>
        <ToastProvider>
          <ConfirmProvider>
            <RouterProvider router={router} />
          </ConfirmProvider>
        </ToastProvider>
      </AccountProvider>,
    )
  }

  it('Business detail with a closure request shows the banner; Complete closure needs the code and returns to the list; Restore removes the banner', { timeout: 20_000 }, async () => {
    await ownerAtAal2()
    closureOn('biz_oak')
    const complete = vi.spyOn(account, 'completeClosure')
    const user = userEvent.setup()

    // Complete closure: the action code is required, then back to the list.
    renderAt('biz_oak')
    const banner = await screen.findByRole('region', { name: 'Closure requested' })
    expect(within(banner).getByText(/closing@demo\.example/)).toBeInTheDocument()
    await user.click(within(banner).getByRole('button', { name: 'Complete closure' }))
    const dialog = await screen.findByRole('dialog', { name: 'Complete closure of Oak & Ember Studio?' })
    expect(within(dialog).getByText(/can't be undone/)).toBeInTheDocument()
    await within(dialog).findByText(/We emailed a 6-digit code/)
    await user.click(within(dialog).getByRole('button', { name: 'Complete closure' }))
    expect(within(dialog).getByText('Enter the 6-digit code.')).toBeInTheDocument()
    expect(complete).not.toHaveBeenCalled()
    await user.type(within(dialog).getByLabelText('6-digit code'), DEMO_CODE)
    await user.click(within(dialog).getByRole('button', { name: 'Complete closure' }))
    expect(await screen.findByRole('heading', { name: 'Businesses list' })).toBeInTheDocument()
    expect(complete).toHaveBeenCalledWith('demo-owner-biz_oak', DEMO_CODE)
    // S1.5 R-W7-6: demo mode sends no email, and the toast says so.
    expect(screen.getByText('Closure completed, but the notice email was not sent: Demo mode: no email is sent.')).toBeInTheDocument()
    cleanup()

    // Restore: confirmed, then the banner is gone.
    resetMockAccount()
    await service.resetDemoData() // Complete deleted the business
    await ownerAtAal2()
    renderAt('biz_oak')
    const banner2 = await screen.findByRole('region', { name: 'Closure requested' })
    await user.click(within(banner2).getByRole('button', { name: 'Restore' }))
    const confirm = await screen.findByRole('dialog', { name: 'Restore Oak & Ember Studio?' })
    await user.click(within(confirm).getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Closure requested' })).toBeNull())
    expect(screen.getByText('Business restored, but the notice email was not sent: Demo mode: no email is sent.')).toBeInTheDocument()
    const left = await account.listClosureRequests()
    expect(left.ok && left.data).toEqual([])
  })

  it('a refused Complete closure (aal2_required) keeps the dialog open with the reason and stays on the page', { timeout: 20_000 }, async () => {
    // Signed in without 2FA: the server refuses at aal1.
    closureOn('biz_oak')
    const user = userEvent.setup()
    renderAt('biz_oak')
    const banner = await screen.findByRole('region', { name: 'Closure requested' })
    await user.click(within(banner).getByRole('button', { name: 'Complete closure' }))
    const dialog = await screen.findByRole('dialog', { name: 'Complete closure of Oak & Ember Studio?' })
    await within(dialog).findByText(/We emailed a 6-digit code/)
    await user.type(within(dialog).getByLabelText('6-digit code'), DEMO_CODE)
    await user.click(within(dialog).getByRole('button', { name: 'Complete closure' }))
    expect(await within(dialog).findByText(/This needs 2FA/)).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Complete closure of Oak & Ember Studio?' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Businesses list' })).toBeNull()
    expect(screen.queryByText('Closure completed')).toBeNull()
  })

  it('a Restore that finds the request already handled (not_found) says so and removes the banner', { timeout: 20_000 }, async () => {
    await ownerAtAal2()
    closureOn('biz_oak')
    const user = userEvent.setup()
    renderAt('biz_oak')
    const banner = await screen.findByRole('region', { name: 'Closure requested' })
    // Handled elsewhere (another tab) after this page loaded.
    expect((await account.restoreClosure('demo-owner-biz_oak')).ok).toBe(true)
    await user.click(within(banner).getByRole('button', { name: 'Restore' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Restore Oak & Ember Studio?' })).getByRole('button', { name: 'Restore' }))
    expect(await screen.findByText('This closure was already handled.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Closure requested' })).toBeNull())
    expect(screen.queryByText('Could not restore the business')).toBeNull()
  })

  it('a Complete closure that finds the request already handled (not_found) closes the dialog, says so and stays', { timeout: 20_000 }, async () => {
    await ownerAtAal2()
    closureOn('biz_oak')
    const user = userEvent.setup()
    renderAt('biz_oak')
    const banner = await screen.findByRole('region', { name: 'Closure requested' })
    await user.click(within(banner).getByRole('button', { name: 'Complete closure' }))
    const dialog = await screen.findByRole('dialog', { name: 'Complete closure of Oak & Ember Studio?' })
    await within(dialog).findByText(/We emailed a 6-digit code/)
    expect((await account.restoreClosure('demo-owner-biz_oak')).ok).toBe(true)
    await user.type(within(dialog).getByLabelText('6-digit code'), DEMO_CODE)
    await user.click(within(dialog).getByRole('button', { name: 'Complete closure' }))
    expect(await screen.findByText('This closure was already handled.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Closure requested' })).toBeNull())
    expect(screen.queryByRole('heading', { name: 'Businesses list' })).toBeNull()
  })

  it('shows no banner for a business without a closure request', { timeout: 20_000 }, async () => {
    const list = closureOn('biz_oak')
    renderAt('biz_nord')
    await screen.findByRole('heading', { level: 1, name: 'Nordhaus Living' })
    await waitFor(() => expect(list).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: 'Closure requested' })).toBeNull()
  })

  // S1.5 R-W7-6: "They were emailed." only when the notice email was accepted.
  it("Reset 2FA on the business owner panel opens the action-code dialog and toasts 'Their 2FA was reset. They were emailed.' when the email was accepted", { timeout: 20_000 }, async () => {
    await ownerAtAal2()
    vi.spyOn(service, 'getBusinessMembers').mockResolvedValue(ok([ACCEPTED_OWNER]))
    const reset = vi.spyOn(account, 'ownerReset2fa').mockResolvedValue(ok({ notice: { status: 'accepted' as const } }))
    const user = userEvent.setup()
    renderAt('biz_nord', 'owners')
    await user.click(await screen.findByRole('button', { name: 'Reset 2FA for rita@nord.example' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reset 2FA for rita@nord.example?' })
    await within(dialog).findByText(/We emailed a 6-digit code/)
    await user.type(within(dialog).getByLabelText('6-digit code'), DEMO_CODE)
    await user.click(within(dialog).getByRole('button', { name: 'Reset 2FA' }))
    expect(await screen.findByText('Their 2FA was reset. They were emailed.')).toBeInTheDocument()
    expect(reset).toHaveBeenCalledWith('usr_rita', DEMO_CODE)
  })

  it('offers no Reset 2FA for an owner who has not accepted the invitation yet', { timeout: 20_000 }, async () => {
    vi.spyOn(service, 'getBusinessMembers').mockResolvedValue(ok([{ ...ACCEPTED_OWNER, acceptedAt: undefined }]))
    renderAt('biz_nord', 'owners')
    expect(await screen.findByText('rita@nord.example')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reset 2FA/ })).toBeNull()
  })

  it('none of these appear for Admin or Team', { timeout: 20_000 }, async () => {
    const list = closureOn('biz_oak')
    vi.spyOn(service, 'getBusinessMembers').mockResolvedValue(ok([ACCEPTED_OWNER]))
    for (const platformRole of ['admin', 'team'] as const) {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole }))
      renderAt('biz_oak', 'owners')
      expect(await screen.findByText('rita@nord.example')).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Closure requested' })).toBeNull()
      expect(screen.queryByRole('button', { name: /Reset 2FA/ })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Complete closure' })).toBeNull()
      cleanup()
    }
    // R-W1-3: loaded for everyone with businesses.view, for the read-only badge; Complete and Restore stay the Owner's.
    expect(list).toHaveBeenCalled()
  })
})

describe('BusinessDetailPage: an open closure is visible and blocks activation (R-W1-3)', () => {
  const CLOSURE_PENDING = 'This business has an open closure request. Only the platform Owner can restore it or complete it.'
  const OAK_REQUEST = { userId: 'usr_oak', email: 'owner@oak.example', businessId: 'biz_oak', businessName: 'Oak & Ember Studio', requestedAt: '2026-10-20T10:00:00.000Z' }

  function renderOak() {
    const router = createMemoryRouter([{ path: '/admin/businesses/:businessId', element: <BusinessDetailPage /> }], { initialEntries: ['/admin/businesses/biz_oak'] })
    render(
      <AccountProvider>
        <ToastProvider>
          <ConfirmProvider>
            <RouterProvider router={router} />
          </ConfirmProvider>
        </ToastProvider>
      </AccountProvider>,
    )
  }
  const as = (platformRole?: 'admin' | 'team') =>
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(platformRole ? { role: 'super_admin', platformRole } : { role: 'super_admin' }))
  /** Every place the status action can be: the inline button and the More menu. */
  async function statusActions(user: ReturnType<typeof userEvent.setup>) {
    const inline = screen.queryAllByRole('button', { name: /^(Activate|Deactivate)$/ }).map((b) => b.textContent?.trim())
    const more = screen.queryByRole('button', { name: 'More actions' })
    if (!more) return inline
    await user.click(more)
    const items = screen.getAllByRole('menuitem').map((m) => m.textContent?.trim()).filter((t) => t === 'Activate' || t === 'Deactivate')
    await user.keyboard('{Escape}')
    return [...inline, ...items]
  }

  it("'Closure requested on {date}' badge for a businesses.view user", async () => {
    vi.spyOn(account, 'listClosureRequests').mockResolvedValue(ok([OAK_REQUEST]))
    as('team')
    renderOak()
    expect(await screen.findByText(/^Closure requested on .*2026/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Closure requested' })).toBeNull()
  })

  it('Activate is hidden while a request is open, with the closure_pending copy as its tooltip', async () => {
    vi.spyOn(account, 'listClosureRequests').mockResolvedValue(ok([OAK_REQUEST]))
    const user = userEvent.setup()
    for (const role of ['admin', undefined] as const) {
      as(role)
      renderOak()
      const badge = await screen.findByText(/^Closure requested on /)
      expect(badge.closest('[title]')).toHaveAttribute('title', CLOSURE_PENDING)
      expect(await statusActions(user)).toEqual([])
      cleanup()
    }
  })

  it('Complete and Restore show for the Owner only', async () => {
    vi.spyOn(account, 'listClosureRequests').mockResolvedValue(ok([OAK_REQUEST]))
    for (const role of ['admin', 'team'] as const) {
      as(role)
      renderOak()
      await screen.findByText(/^Closure requested on /)
      expect(screen.queryByRole('button', { name: 'Complete closure' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull()
      cleanup()
    }
    as()
    renderOak()
    const banner = await screen.findByRole('region', { name: 'Closure requested' })
    expect(within(banner).getByRole('button', { name: 'Complete closure' })).toBeInTheDocument()
    expect(within(banner).getByRole('button', { name: 'Restore' })).toBeInTheDocument()
  })

  it('the offline sentence is chosen from the real status (draft vs inactive)', async () => {
    vi.spyOn(account, 'listClosureRequests').mockResolvedValue(ok([OAK_REQUEST]))
    renderOak()
    let banner = await screen.findByRole('region', { name: 'Closure requested' })
    expect(within(banner).getByText(/The catalog is inactive and offline until you complete the closure/)).toBeInTheDocument()
    cleanup()

    expect((await service.setBusinessStatus('biz_oak', 'draft')).ok).toBe(true)
    renderOak()
    banner = await screen.findByRole('region', { name: 'Closure requested' })
    expect(within(banner).getByText(/The catalog is a draft and offline until you complete the closure/)).toBeInTheDocument()
    expect(within(banner).queryByText(/inactive/)).toBeNull()
  })

  it('while the closure list loads, Activate is not offered', async () => {
    vi.spyOn(account, 'listClosureRequests').mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    as('admin')
    renderOak()
    await screen.findByRole('heading', { level: 1, name: 'Oak & Ember Studio' })
    expect(await statusActions(user)).toEqual([])
  })

  it('a failed closure list shows an error with retry; Activate is offered once it loads without a request', async () => {
    const list = vi.spyOn(account, 'listClosureRequests').mockResolvedValue(fail('UNKNOWN', 'Network down.'))
    const user = userEvent.setup()
    as('admin')
    renderOak()
    expect(await screen.findByText('Could not check for a closure request. Something went wrong. Try again in a moment.')).toBeInTheDocument()
    expect(await statusActions(user)).toEqual([])
    list.mockResolvedValue(ok([]))
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByText(/Could not check for a closure request/)).toBeNull())
    expect(await statusActions(user)).toEqual(['Activate', 'Activate'])
  })
})

describe('BusinessDetailPage: catalog button by status (R-W3-8)', () => {
  it("a non-active business shows 'Preview catalog' linking with preview; an active one shows 'Open catalog'", async () => {
    const user = userEvent.setup()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    renderPage('details')
    await screen.findByRole('heading', { level: 1, name: 'Nordhaus Living' })
    await user.click(screen.getByRole('button', { name: /Open catalog/ }))
    expect(open).toHaveBeenLastCalledWith('/catalog/nordhaus', '_blank', 'noopener')
    cleanup()
    expect((await service.setBusinessStatus('biz_nord', 'draft')).ok).toBe(true)
    renderPage('details')
    await screen.findByRole('heading', { level: 1, name: 'Nordhaus Living' })
    expect(screen.queryByRole('button', { name: /Open catalog/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: /Preview catalog/ }))
    expect(open).toHaveBeenLastCalledWith('/catalog/nordhaus?preview=1', '_blank', 'noopener')
  })
})

describe('BusinessDetailPage: history gating (R-W7-8)', () => {
  function renderAsTeam(permissions: Permission[]) {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'team' }))
    vi.spyOn(service, 'getMyAccess').mockResolvedValue(ok({ role: 'team', permissions, status: 'active' }))
    renderPage('owners')
  }

  it("without records.view, History and Email activity say 'This business's history needs 'View the audit log and email log'.'", async () => {
    const events = vi.spyOn(service, 'getAuditEvents')
    const emails = vi.spyOn(service, 'getEmailAttempts')
    renderAsTeam(['businesses.view'])
    expect(await screen.findByText("This business's history needs 'View the audit log and email log'.")).toBeInTheDocument()
    expect(screen.queryByText('Email activity')).not.toBeInTheDocument()
    expect(events).not.toHaveBeenCalled()
    expect(emails).not.toHaveBeenCalled()
  })

  it('with records.view, both panels render', async () => {
    renderAsTeam(['businesses.view', 'records.view'])
    expect(await screen.findByText('Email activity')).toBeInTheDocument()
    expect(screen.queryByText("This business's history needs 'View the audit log and email log'.")).not.toBeInTheDocument()
  })
})

describe('S2 Task 2: the details tab follows businesses.edit (R-W3-5)', () => {
  function renderAsTeam(permissions: Permission[]) {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'team' }))
    vi.spyOn(service, 'getMyAccess').mockResolvedValue(ok({ role: 'team', permissions, status: 'active' }))
    renderPage('details')
  }

  it('a default Team member (businesses.view only) sees no editable inputs on the details tab', async () => {
    renderAsTeam(['businesses.view'])
    expect(await screen.findByText("You can view this business. Editing needs 'Create and edit businesses'.")).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByLabelText(/^Business name/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  it('an Admin with businesses.edit sees the form', async () => {
    renderAsTeam(['businesses.view', 'businesses.edit'])
    expect(await screen.findByLabelText(/^Business name/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    expect(screen.queryByText("You can view this business. Editing needs 'Create and edit businesses'.")).toBeNull()
  })
})
