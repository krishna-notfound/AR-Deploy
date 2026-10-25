import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { service } from '@/services'
import { fail } from '@/services/catalogService'
import BusinessDetailPage from './BusinessDetailPage'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  // The page shows actions by platform permission (ADR-0029): sign in as the demo Owner.
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
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
