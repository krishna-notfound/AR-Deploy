// S4 Task 5 (R-S4-10): the "3D requests" nav item follows models.manage and counts the requests waiting to start.
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { service } from '@/services'
import { ok } from '@/services/catalogService'
import { resetMockAccount } from '@/services/mock/mockAccount'
import { DashboardShell } from './DashboardShell'
import { adminNav } from './nav'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
  resetMockAccount()
  await service.resetDemoData()
})

afterEach(() => vi.restoreAllMocks())

function renderShell() {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/admin']}>
        <AccountProvider>
          <Routes>
            <Route path="/admin" element={<DashboardShell nav={adminNav} variant="admin" />}>
              <Route index element={<p>Admin home</p>} />
            </Route>
          </Routes>
        </AccountProvider>
      </MemoryRouter>
    </ToastProvider>,
  )
}

describe('3D requests nav item', () => {
  it("shows with models.manage and its count of requested rows (', {n} waiting to start' for screen readers)", async () => {
    renderShell()
    const link = await screen.findByRole('link', { name: /^3D requests/ })
    expect(link).toHaveAttribute('href', '/admin/model-requests')
    // The demo seed has one request still waiting to start.
    expect(await screen.findByText(', 1 waiting to start')).toBeInTheDocument()
  })

  it('asks only for requested rows, one row at a time', async () => {
    const spy = vi.spyOn(service, 'getModelRequests')
    renderShell()
    await screen.findByText(', 1 waiting to start')
    expect(spy).toHaveBeenCalledWith({ status: ['requested'], pageSize: 1 })
  })

  it('is hidden without models.manage and never asks for the count', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'team' }))
    vi.spyOn(service, 'getMyAccess').mockResolvedValue(ok({ role: 'team', permissions: ['products.view', 'businesses.view'], status: 'active' }))
    const spy = vi.spyOn(service, 'getModelRequests')
    renderShell()
    await screen.findByRole('link', { name: /^Businesses/ })
    expect(screen.queryByRole('link', { name: /^3D requests/ })).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })
})
