// R-W3-3: business actions follow the permission they need (UX only; the database refuses the rest).
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { Permission } from '@/domain/types'
import { service } from '@/services'
import { ok } from '@/services/catalogService'
import { resetMockAccount } from '@/services/mock/mockAccount'
import BusinessCreatePage from './BusinessCreatePage'
import BusinessesListPage from './BusinessesListPage'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  resetMockAccount()
  await service.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
})

/** Signed in as a Team member whose role holds exactly `permissions`. */
function renderAs(permissions: Permission[], path: string, element: React.ReactElement) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'team' }))
  vi.spyOn(service, 'getMyAccess').mockResolvedValue(ok({ role: 'team', permissions }))
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

async function rowMenu() {
  const user = userEvent.setup()
  const [trigger] = await screen.findAllByRole('button', { name: 'Actions for Nordhaus Living' })
  await user.click(trigger!)
  return within(screen.getByRole('menu')).getAllByRole('menuitem').map((m) => m.textContent?.trim())
}

describe('BusinessesListPage (R-W3-3)', () => {
  it("'View products' and 'View QR code' hidden without products.view", async () => {
    renderAs(['businesses.view'], '/admin/businesses', <BusinessesListPage />)
    const items = await rowMenu()
    expect(items).toContain('View details')
    expect(items).not.toContain('View products')
    expect(items).not.toContain('View QR code')
  })

  it("'View products' and 'View QR code' shown with products.view", async () => {
    renderAs(['businesses.view', 'products.view'], '/admin/businesses', <BusinessesListPage />)
    const items = await rowMenu()
    expect(items).toContain('View products')
    expect(items).toContain('View QR code')
  })
})

describe('BusinessCreatePage (R-W3-3)', () => {
  it("'Create business (active)' only with businesses.status; otherwise only 'Save as draft'", async () => {
    const view = renderAs(['businesses.view', 'businesses.edit'], '/admin/businesses/new', <BusinessCreatePage />)
    expect(await screen.findByRole('button', { name: 'Save as draft' })).toBeInTheDocument()
    // Let the role load, so a button that depends on it would have appeared.
    const access = vi.mocked(service.getMyAccess)
    await waitFor(() => expect(access).toHaveBeenCalled())
    await act(async () => {
      await access.mock.results[0]!.value
    })
    expect(screen.queryByRole('button', { name: 'Create business' })).toBeNull()
    view.unmount()

    renderAs(['businesses.view', 'businesses.edit', 'businesses.status'], '/admin/businesses/new', <BusinessCreatePage />)
    expect(await screen.findByRole('button', { name: 'Create business' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save as draft' })).toBeInTheDocument()
  })
})
