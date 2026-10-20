import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { service } from '@/services'
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
