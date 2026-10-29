import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { Permission } from '@/domain/types'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { ok } from '@/services/catalogService'
import { useServiceQuery } from '@/services/hooks'
import { BusinessForm } from './BusinessForm'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Like BusinessDetailPage: the form gets the live business, which refreshes after every store change. */
function EditRoute() {
  const q = useServiceQuery(() => service.getBusinessById('biz_nord'), [])
  return q.data ? <BusinessForm business={q.data} mode="edit" /> : <p>loading</p>
}

function renderEdit() {
  const router = createMemoryRouter([{ path: '/admin/businesses/biz_nord', element: <EditRoute /> }], { initialEntries: ['/admin/businesses/biz_nord'] })
  render(
    <ToastProvider>
      <ConfirmProvider>
        <RouterProvider router={router} />
      </ConfirmProvider>
    </ToastProvider>,
  )
}

describe('BusinessForm (edit)', () => {
  // Regression (COR-04): deactivating from the page header while the form had unsaved edits, then saving,
  // re-sent the stale status 'active' and silently re-activated the catalogue.
  it('does not re-send a stale status after the catalogue was deactivated elsewhere', async () => {
    const user = userEvent.setup()
    const update = vi.spyOn(service, 'updateBusiness')
    renderEdit()
    const description = await screen.findByLabelText('Description')
    await user.clear(description)
    await user.type(description, 'New description')

    await act(async () => {
      await service.setBusinessStatus('biz_nord', 'inactive')
    })
    // The untouched status field follows the stored value; the unsaved description is kept.
    await waitFor(() => expect(screen.getByLabelText('Catalog status')).toHaveValue('inactive'))
    expect(screen.getByLabelText('Description')).toHaveValue('New description')

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update.mock.calls[0]![1]).toEqual({ description: 'New description' })
    const saved = await service.getBusinessById('biz_nord')
    expect(saved.ok && saved.data.status).toBe('inactive')
    expect(saved.ok && saved.data.description).toBe('New description')
  })

  // COR-05: changing the catalogue address breaks printed QR codes, so it needs an explicit confirmation.
  it('asks before changing the catalogue address, naming the old and new address', async () => {
    const user = userEvent.setup()
    const update = vi.spyOn(service, 'updateBusiness')
    renderEdit()
    const slug = await screen.findByLabelText(/Catalog address/)
    await user.clear(slug)
    await user.type(slug, 'nordhaus-living')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const dialog = await screen.findByRole('dialog', { name: 'Change the catalog address?' })
    expect(within(dialog).getByText(/nordhaus\.example\.com/)).toBeInTheDocument()
    expect(within(dialog).getByText(/nordhaus-living\.example\.com/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Printed QR codes/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(update).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Change address' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('biz_nord', { slug: 'nordhaus-living' }))
  })

  it('saves other edits without asking about the address', async () => {
    const user = userEvent.setup()
    const update = vi.spyOn(service, 'updateBusiness')
    renderEdit()
    await user.type(await screen.findByLabelText(/^Phone/), '1')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(Object.keys(update.mock.calls[0]![1])).toEqual(['contact'])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('S2 Task 2: field limits and the status select (R-W3-5, R-W3-7)', () => {
  function renderEditAs(permissions: Permission[]) {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'team' }))
    vi.spyOn(service, 'getMyAccess').mockResolvedValue(ok({ role: 'team', permissions, status: 'active' }))
    const router = createMemoryRouter([{ path: '/admin/businesses/biz_nord', element: <EditRoute /> }], { initialEntries: ['/admin/businesses/biz_nord'] })
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

  it('inputs carry maxLength name 80, slug 63, description 1000, email 320, phone 50, address 500', async () => {
    renderEdit()
    expect(await screen.findByLabelText(/^Business name/)).toHaveAttribute('maxLength', '80')
    expect(screen.getByLabelText(/Catalog address/)).toHaveAttribute('maxLength', '63')
    expect(screen.getByLabelText('Description')).toHaveAttribute('maxLength', '1000')
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('maxLength', '320')
    expect(screen.getByLabelText(/^Phone/)).toHaveAttribute('maxLength', '50')
    expect(screen.getByLabelText(/^Address/)).toHaveAttribute('maxLength', '500')
  })

  it("a 501-character address shows 'Use 500 characters or fewer.' and makes no service call", async () => {
    const user = userEvent.setup()
    const update = vi.spyOn(service, 'updateBusiness')
    renderEdit()
    // maxLength stops typing past the limit; a pasted or stored value can still be longer.
    fireEvent.change(await screen.findByLabelText(/^Address/), { target: { value: 'a'.repeat(501) } })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Use 500 characters or fewer.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Address/)).toHaveAttribute('aria-invalid', 'true')
    expect(update).not.toHaveBeenCalled()
  })

  it('the status select shows only with businesses.status', async () => {
    renderEditAs(['businesses.view', 'businesses.edit'])
    await screen.findByLabelText(/^Business name/)
    expect(screen.queryByLabelText('Catalog status')).toBeNull()
    cleanup()
    renderEditAs(['businesses.view', 'businesses.edit', 'businesses.status'])
    expect(await screen.findByLabelText('Catalog status')).toBeInTheDocument()
  })

  it('a stored 1200-character description gets the description field error on save, not only a toast', async () => {
    const user = userEvent.setup()
    const stored = await service.getBusinessById('biz_nord')
    if (!stored.ok) throw new Error('seed missing')
    vi.spyOn(service, 'getBusinessById').mockResolvedValue(ok({ ...stored.data, description: 'd'.repeat(1200) }))
    const update = vi.spyOn(service, 'updateBusiness')
    renderEdit()
    await user.type(await screen.findByLabelText(/^Phone/), '1')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Use 1000 characters or fewer.')).toBeInTheDocument()
    expect(screen.getByLabelText('Description')).toHaveAttribute('aria-invalid', 'true')
    expect(update).not.toHaveBeenCalled()
  })
})

describe('validation messages follow the language', () => {
  it('shows the field limit message in Portuguese when the language is pt', async () => {
    localStorage.setItem('arfurn:lang', 'pt')
    const user = userEvent.setup()
    const router = createMemoryRouter([{ path: '/admin/businesses/biz_nord', element: <EditRoute /> }], { initialEntries: ['/admin/businesses/biz_nord'] })
    render(
      <LanguageProvider>
        <ToastProvider>
          <ConfirmProvider>
            <RouterProvider router={router} />
          </ConfirmProvider>
        </ToastProvider>
      </LanguageProvider>,
    )
    const description = await screen.findByLabelText('Description')
    fireEvent.change(description, { target: { value: 'd'.repeat(1001) } })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Use 1000 caracteres ou menos.')).toBeInTheDocument()
  })
})
