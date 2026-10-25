import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { DashboardContext } from '@/components/layout/dashboardContext'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import PlatformSection from './PlatformSection'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
})

function renderSection() {
  return render(
    <MemoryRouter>
      <AccountProvider>
        <ToastProvider>
          <ConfirmProvider>
            <DashboardContext.Provider value={{ variant: 'admin', home: 'Sanctus Admin', homeTo: '/admin', eyebrow: 'Settings' }}>
              <main>
                <PlatformSection />
              </main>
            </DashboardContext.Provider>
          </ConfirmProvider>
        </ToastProvider>
      </AccountProvider>
    </MemoryRouter>,
  )
}

describe('PlatformSection (Platform → General)', () => {
  it('has no uppercase text and no profile card (that lives in the account sections)', () => {
    const { container } = renderSection()
    expect(container.querySelector('main .uppercase')).toBeNull()
    expect(screen.queryByText('Role', { selector: 'dt' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Data backend' })).toBeInTheDocument()
  })

  it('titles its cards in the dashboard sans, not the serif', () => {
    const { container } = renderSection()
    // The section title (h1) keeps the serif; card titles do not.
    const serif = [...container.querySelectorAll('main [class*="font-display"], main [class*="text-title"], main [class*="text-headline"]')].filter((el) => el.tagName !== 'H1')
    expect(serif).toEqual([])
  })

  it('still credits the sample assets', () => {
    renderSection()
    expect(screen.getByText('Sample asset credits')).toBeInTheDocument()
    expect(screen.getByText(/Photos from Unsplash/)).toBeInTheDocument()
  })
})
