import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { service } from '@/services'
import { fail } from '@/services/catalogService'
import BusinessDetailPage from './BusinessDetailPage'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderPage(tab = 'products') {
  const router = createMemoryRouter([{ path: '/admin/businesses/:businessId', element: <BusinessDetailPage /> }], { initialEntries: [`/admin/businesses/biz_nord?tab=${tab}`] })
  render(
    <ToastProvider>
      <ConfirmProvider>
        <RouterProvider router={router} />
      </ConfirmProvider>
    </ToastProvider>,
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
})
