// QA 2026-11-14: accent-insensitive business search (#7) and a message for a reversed date range (#8).
import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { service } from '@/services'
import { ok } from '@/services/catalogService'
import { resetMockAccount } from '@/services/mock/mockAccount'
import ApplicationsPage from './ApplicationsPage'
import BusinessesListPage from './BusinessesListPage'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
  resetMockAccount()
  await service.resetDemoData()
})

afterEach(() => vi.restoreAllMocks())

function renderAt(route: string, path: string, element: React.ReactElement) {
  const router = createMemoryRouter([{ path, element }], { initialEntries: [route] })
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

describe('BusinessesListPage search ignores accents (QA #7)', () => {
  it("'Moveis' finds 'Web Móveis'", async () => {
    const real = await service.getCatalogs()
    if (!real.ok) throw new Error('no catalogs')
    const [first, ...rest] = real.data
    const renamed = { ...first!, business: { ...first!.business, name: 'Web Móveis', slug: 'web-lda' } }
    vi.spyOn(service, 'getCatalogs').mockResolvedValue(ok([renamed, ...rest]))
    renderAt('/admin/businesses?q=Moveis', '/admin/businesses', <BusinessesListPage />)
    expect((await screen.findAllByRole('link', { name: 'Web Móveis' })).length).toBeGreaterThan(0)
    // The other businesses do not match, so only the renamed one is listed.
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Nordhaus Living' })).toBeNull())
  })
})

describe('ApplicationsPage reversed date range (QA #8)', () => {
  it('says so on the end date when it is before the start date', async () => {
    renderAt('/admin/applications?from=2026-11-10&to=2026-11-01', '/admin/applications', <ApplicationsPage />)
    expect(await screen.findByText('The end date is before the start date. Choose an end date on or after it.')).toBeInTheDocument()
    expect(screen.getByLabelText('to')).toHaveAttribute('aria-invalid', 'true')
  })

  it('says nothing for a valid range', async () => {
    renderAt('/admin/applications?from=2026-11-01&to=2026-11-10', '/admin/applications', <ApplicationsPage />)
    await screen.findByLabelText('to')
    expect(screen.queryByText(/The end date is before the start date/)).toBeNull()
  })
})
