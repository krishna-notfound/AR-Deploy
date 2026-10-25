import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { DashboardContext } from '@/components/layout/dashboardContext'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { service } from '@/services'
import AdminProductsPage from './AdminProductsPage'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
  await service.resetDemoData()
})

async function renderPage() {
  render(
    <MemoryRouter initialEntries={['/admin/products']}>
      <AccountProvider>
        <ToastProvider>
          <ConfirmProvider>
            <DashboardContext.Provider value={{ variant: 'admin', home: 'Sanctus Admin', homeTo: '/admin', eyebrow: 'Admin' }}>
              <AdminProductsPage />
            </DashboardContext.Provider>
          </ConfirmProvider>
        </ToastProvider>
      </AccountProvider>
    </MemoryRouter>,
  )
  await screen.findAllByRole('row')
  await screen.findAllByRole('link', { name: /sofa|chair|table|lamp|shelves|bookcase/i })
}

describe('AdminProductsPage', () => {
  it('names each filter with a visible label above its control', async () => {
    await renderPage()
    for (const label of ['Search', 'Business', 'Status', 'Category', '3D / AR']) {
      expect(screen.getByText(label, { selector: 'label > span' })).toBeVisible()
    }
  })

  it('keeps the Business and Updated cells on one line so rows stay the same height', async () => {
    await renderPage()
    const table = screen.getByRole('table', { name: /products/i })
    const rows = within(table).getAllByRole('row')
    const cells = within(rows[1]!).getAllByRole('cell')
    const headers = within(rows[0]!).getAllByRole('columnheader').map((h) => h.textContent)
    const business = cells[headers.indexOf('Business')]!
    const updated = cells[headers.findIndex((h) => h?.startsWith('Updated'))]!
    expect(business.querySelector('.truncate')).not.toBeNull()
    expect(updated.querySelector('.whitespace-nowrap')).not.toBeNull()
  })
})
