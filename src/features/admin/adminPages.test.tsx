import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { DashboardContext } from '@/components/layout/dashboardContext'
import { Monogram } from '../applications/Monogram'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { service } from '@/services'
import AdminOverviewPage from './AdminOverviewPage'
import ApplicationsPage from './ApplicationsPage'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
  await service.resetDemoData()
})

/** The demo seed has no applications: submit one so the list has an open row (a "Review" button). */
async function submitApplication() {
  const res = await service.submitApplication({
    businessName: 'Atelier Norte',
    website: 'atelier-norte.example',
    description: 'Solid oak furniture made in Porto.',
    category: 'furniture',
    country: 'Portugal',
    city: 'Porto',
    applicantName: 'Rita Sousa',
    applicantRole: '',
    applicantEmail: 'rita@atelier.test',
    applicantPhone: '',
    language: 'pt',
    productCount: '11-50',
    photoReadiness: 'all',
    modelReadiness: 'none',
    notes: '',
    consent: true,
    submissionKey: crypto.randomUUID(),
  })
  expect(res.ok).toBe(true)
}

function renderAt(path: string, element: React.ReactElement) {
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

describe('AdminOverviewPage', () => {
  it('does not show the "Recently added products" or "Recently created businesses" panels', async () => {
    renderAt('/admin', <AdminOverviewPage />)
    await screen.findByRole('heading', { name: 'Most viewed products' })
    expect(screen.queryByRole('heading', { name: 'Recently added products' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Recently created businesses' })).not.toBeInTheDocument()
  })

  it('shows "View catalogs" as a quiet text button and has exactly one primary button', async () => {
    const { container } = renderAt('/admin', <AdminOverviewPage />)
    const view = await screen.findByRole('link', { name: 'View catalogs' })
    expect(view.className).toMatch(/text-accent-ink|hover:bg-subtle/)
    expect(view.classList.contains('bg-ink')).toBe(false)
    expect(view.classList.contains('border')).toBe(false)
    const primary = [...container.querySelectorAll('a, button')].filter((el) => el.classList.contains('bg-ink'))
    expect(primary).toHaveLength(1)
    expect(primary[0]).toHaveTextContent('Create business')
  })
})

describe('ApplicationsPage', () => {
  beforeEach(submitApplication)

  it('shows "Review" as an outlined secondary button, not a filled one', async () => {
    renderAt('/admin/applications', <ApplicationsPage />)
    const reviews = await screen.findAllByRole('link', { name: 'Review' })
    expect(reviews.length).toBeGreaterThan(0)
    for (const r of reviews) {
      expect(r.classList.contains('bg-ink')).toBe(false)
      expect(r.classList.contains('border')).toBe(true)
      expect(r.classList.contains('border-line-strong')).toBe(true)
    }
  })

  it('renders the list through the shared table with sentence-case column headers', async () => {
    renderAt('/admin/applications', <ApplicationsPage />)
    const table = await screen.findByRole('table', { name: 'Business applications' })
    const headers = within(table).getAllByRole('columnheader')
    expect(headers.length).toBeGreaterThanOrEqual(4)
    for (const h of headers) expect(h.closest('thead')?.className ?? '').not.toMatch(/uppercase|tracking-/)
    expect(headers[0]?.closest('tr')?.className ?? '').toMatch(/text-\[13px\]/)
  })

  it('does not dim the tab counts', async () => {
    const { container } = renderAt('/admin/applications', <ApplicationsPage />)
    await screen.findAllByRole('link', { name: 'Review' })
    expect(container.querySelector('[role="tablist"] .opacity-75')).toBeNull()
  })
})

describe('Monogram', () => {
  it('is a 32px Inter 12/500 square inside the dashboard and the 40px serif mark elsewhere', () => {
    const { container, rerender } = render(<Monogram name="Oak & Ember" />)
    expect(container.firstElementChild).toHaveClass('size-10', 'font-display')
    rerender(
      <DashboardContext.Provider value={{ variant: 'admin', home: 'Sanctus Admin', homeTo: '/admin', eyebrow: '' }}>
        <Monogram name="Oak & Ember" />
      </DashboardContext.Provider>,
    )
    expect(container.firstElementChild).toHaveClass('size-8', 'text-[12px]', 'font-medium')
    expect(container.firstElementChild).not.toHaveClass('font-display')
    expect(container.firstElementChild).toHaveTextContent('OE')
  })
})
