import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { DashboardContext } from '@/components/layout/dashboardContext'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import AdminSettingsPage from './AdminSettingsPage'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AccountProvider>
        <ToastProvider>
          <ConfirmProvider>
            <DashboardContext.Provider value={{ variant: 'admin', home: 'Sanctus Admin', homeTo: '/admin', eyebrow: 'Admin' }}>
              <main>
                <AdminSettingsPage />
              </main>
            </DashboardContext.Provider>
          </ConfirmProvider>
        </ToastProvider>
      </AccountProvider>
    </MemoryRouter>,
  )
}

describe('AdminSettingsPage', () => {
  it('lists the profile as sentence-case rows with no uppercase text', () => {
    const { container } = renderPage()
    expect(container.querySelector('main .uppercase')).toBeNull()
    for (const label of ['Name', 'Email', 'Role']) expect(screen.getByText(label, { selector: 'dt' })).toBeInTheDocument()
  })

  it('titles its cards in the dashboard sans, not the serif', () => {
    const { container } = renderPage()
    // The page title (h1) keeps the serif; card titles do not.
    const serif = [...container.querySelectorAll('main [class*="font-display"], main [class*="text-title"], main [class*="text-headline"]')].filter((el) => el.tagName !== 'H1')
    expect(serif).toEqual([])
  })

  it('still credits the sample assets', () => {
    renderPage()
    expect(screen.getByText('Sample asset credits')).toBeInTheDocument()
    expect(screen.getByText(/Photos from Unsplash/)).toBeInTheDocument()
  })
})
