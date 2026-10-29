import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { RequirePermission } from '@/auth/usePermission'
import type { ModelRequest } from '@/domain/modelRequests'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { modelRequestAdminPath } from '@/lib/urls'
import { service } from '@/services'
import { fail, ok } from '@/services/catalogService'
import { resetMockAccount } from '@/services/mock/mockAccount'
import ModelRequestsPage from './ModelRequestsPage'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
  resetMockAccount()
  await service.resetDemoData()
})

afterEach(() => vi.restoreAllMocks())

function renderQueue(search = '') {
  const router = createMemoryRouter(
    [
      {
        path: '/admin/model-requests',
        element: (
          <RequirePermission need="models.manage">
            <ModelRequestsPage />
          </RequirePermission>
        ),
      },
    ],
    { initialEntries: [`/admin/model-requests${search}`] },
  )
  render(
    <AccountProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </AccountProvider>,
  )
  return router
}

const table = async () => within(await screen.findByRole('table', { name: '3D model requests' }))
/** The product names of the table's rows, in order. */
const productOrder = async () => {
  const t = await table()
  return (await t.findAllByTestId('request-product')).map((el) => el.textContent)
}

describe('ModelRequestsPage', () => {
  it('tabs Open (default, oldest first), Delivered, Declined, Cancelled, All (newest first) from ?status', async () => {
    const user = userEvent.setup()
    const router = renderQueue()
    expect(await screen.findByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true')
    for (const name of ['Delivered', 'Declined', 'Cancelled', 'All']) expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    // Seed: the round table (in progress, 6 days ago) is older than the bookcase (requested, 1 day ago).
    expect(await productOrder()).toEqual(['Atlantic Round Dining Table', 'Alfama Tall Bookcase'])
    await user.click(screen.getByRole('tab', { name: 'All' }))
    expect(router.state.location.search).toBe('?status=all')
    await waitFor(async () => expect(await productOrder()).toHaveLength(4))
    expect((await productOrder())[0]).toBe('Alfama Tall Bookcase')
    await user.click(screen.getByRole('tab', { name: 'Declined' }))
    expect(router.state.location.search).toBe('?status=rejected')
    await waitFor(async () => expect(await productOrder()).toEqual(['Atlantic Round Dining Table']))
  })

  it('columns: product (photo and name), business, target, photos, requested (date and age), status', async () => {
    renderQueue('?status=all')
    const t = await table()
    await t.findAllByTestId('request-product')
    for (const h of ['Product', 'Business', 'Target', 'Photos', 'Requested', 'Status']) expect(t.getByRole('columnheader', { name: h })).toBeInTheDocument()
    const row = t.getAllByRole('row').find((r) => within(r).queryByText('Alfama Tall Bookcase'))!
    expect(within(row).getByText('Casa Lisboa Interiors')).toBeInTheDocument()
    expect(within(row).getByText('Product')).toBeInTheDocument()
    expect(within(row).getByText(/yesterday|1 day ago/)).toBeInTheDocument()
    expect(within(row).getByText('Requested')).toBeInTheDocument()
  })

  it('shows the option name as the target of an option request', async () => {
    const real = await service.getModelRequests({ status: ['requested'] })
    if (!real.ok) throw new Error('seed')
    vi.spyOn(service, 'getModelRequests').mockResolvedValue(ok({ total: 1, items: [{ ...real.data.items[0]!, variantId: 'v1', variantName: { en: 'Walnut finish' } }] }))
    renderQueue()
    expect(await screen.findByText('Walnut finish')).toBeInTheDocument()
  })

  it('a business filter from ?business shows the business name with a clear link', async () => {
    renderQueue('?business=biz_casa&status=all')
    const chip = await screen.findByTestId('business-filter')
    await waitFor(() => expect(chip).toHaveTextContent('Casa Lisboa Interiors'))
    expect(screen.getByRole('link', { name: 'Clear business filter' })).toHaveAttribute('href', '/admin/model-requests?status=all')
  })

  it('50 per page with paging', async () => {
    const user = userEvent.setup()
    const base = await service.getModelRequests({})
    if (!base.ok) throw new Error('seed')
    const mk = (n: number): ModelRequest => ({ ...base.data.items[0]!, id: `mrq_${n}` })
    const spy = vi
      .spyOn(service, 'getModelRequests')
      .mockImplementation(async (q) => ok({ total: 120, items: Array.from({ length: q?.page === 3 ? 20 : 50 }, (_, i) => mk(i + ((q?.page ?? 1) - 1) * 50)) }))
    renderQueue()
    await screen.findByText('120')
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 50, page: 1 }))
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 50 })))
  })

  it('loading skeleton; empty per tab; error with Retry', async () => {
    const user = userEvent.setup()
    let release: (v: Awaited<ReturnType<typeof service.getModelRequests>>) => void = () => {}
    const spy = vi.spyOn(service, 'getModelRequests').mockReturnValue(new Promise((r) => (release = r)))
    renderQueue()
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument()
    release(ok({ items: [], total: 0 }))
    expect(await screen.findByText('No open requests.')).toBeInTheDocument()
    expect(screen.getByText('New requests from businesses appear here.')).toBeInTheDocument()
    spy.mockResolvedValue(ok({ items: [], total: 0 }))
    await user.click(screen.getByRole('tab', { name: 'Cancelled' }))
    expect(await screen.findByText('No cancelled requests.')).toBeInTheDocument()

    spy.mockResolvedValue(fail('UNKNOWN', 'boom'))
    await user.click(screen.getByRole('tab', { name: 'Delivered' }))
    expect(await screen.findByText("Couldn't load 3D model requests.")).toBeInTheDocument()
    spy.mockResolvedValue(ok({ items: [], total: 0 }))
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No delivered requests.')).toBeInTheDocument()
  })

  it('rows link to modelRequestAdminPath(id)', async () => {
    renderQueue()
    const t = await table()
    const links = await t.findAllByRole('link')
    const hrefs = links.map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(expect.arrayContaining([modelRequestAdminPath('mrq_bookcase'), modelRequestAdminPath('mrq_table')]))
  })

  it('a Team member without models.manage gets the no-access view', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'team' }))
    vi.spyOn(service, 'getMyAccess').mockResolvedValue(ok({ role: 'team', permissions: ['products.view'], status: 'active' }))
    renderQueue()
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument()
  })
})
