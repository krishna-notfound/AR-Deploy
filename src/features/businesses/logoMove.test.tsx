import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { service } from '@/services'
import { BusinessForm } from './BusinessForm'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})
afterEach(() => vi.restoreAllMocks())

describe('create business with a logo that could not be moved (R-W3-4)', () => {
  it("shows 'Business created' with \"The logo couldn't be moved into the business folder; upload it again.\"", async () => {
    const user = userEvent.setup()
    const created = await service.getBusinessById('biz_nord')
    if (!created.ok) throw new Error('no demo business')
    vi.spyOn(service, 'createBusiness').mockResolvedValue({ ok: true, data: { ...created.data, logoMoveFailed: true } })
    const router = createMemoryRouter([{ path: '/admin/businesses/new', element: <BusinessForm business={null} mode="create" /> }], { initialEntries: ['/admin/businesses/new'] })
    render(
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ToastProvider>,
    )
    await user.type(await screen.findByLabelText(/^Business name/), 'Casa Nova')
    await user.click(screen.getByRole('button', { name: /^Create business$/ }))
    await waitFor(() => expect(screen.getByText('Business created')).toBeInTheDocument())
    expect(screen.getByText("The logo couldn't be moved into the business folder; upload it again.")).toBeInTheDocument()
  })
})
