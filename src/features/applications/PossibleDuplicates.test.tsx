// R-W2-9: the possible-duplicates warning on the application detail page.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import type { ApplicationDuplicates, Permission } from '@/domain/types'
import { applicationAdminPath, businessAdminPath } from '@/lib/urls'
import { service } from '@/services'
import { fail, ok } from '@/services/catalogService'
import { resetMockAccount } from '@/services/mock/mockAccount'
import { PossibleDuplicates } from './PossibleDuplicates'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetMockAccount()
})
afterEach(() => {
  vi.restoreAllMocks()
})

const FOUND: ApplicationDuplicates = {
  applications: [{ id: 'app-2', reference: 'AB12CD34', businessName: 'Casa Nova', status: 'approved', createdAt: '2026-10-20T10:00:00Z', match: 'email' }],
  businesses: [{ id: 'biz-9', name: 'Casa', status: 'active', match: 'name' }],
}

/** As the platform Owner, or as a Team member whose role holds exactly `permissions`. */
function renderPanel(permissions?: Permission[]) {
  if (permissions) {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'team' }))
    vi.spyOn(service, 'getMyAccess').mockResolvedValue(ok({ role: 'team', permissions, status: 'active' }))
  } else localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
  const router = createMemoryRouter([{ path: '/', element: <PossibleDuplicates applicationId="app-1" /> }], { initialEntries: ['/'] })
  return render(
    <AccountProvider>
      <RouterProvider router={router} />
    </AccountProvider>,
  )
}

describe('PossibleDuplicates (R-W2-9)', () => {
  it("shows 'Checking for possible duplicates…' while loading", async () => {
    vi.spyOn(service, 'getApplicationDuplicates').mockReturnValue(new Promise(() => {}))
    renderPanel()
    expect(await screen.findByText('Checking for possible duplicates…')).toBeInTheDocument()
  })

  it('renders nothing when both lists are empty', async () => {
    const spy = vi.spyOn(service, 'getApplicationDuplicates').mockResolvedValue(ok({ applications: [], businesses: [] }))
    const { container } = renderPanel()
    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith('app-1'))
    await vi.waitFor(() => expect(screen.queryByText('Checking for possible duplicates…')).not.toBeInTheDocument())
    expect(screen.queryByText('Possible duplicates')).not.toBeInTheDocument()
    expect(container.textContent).toBe('')
  })

  it("shows 'Couldn't check for possible duplicates. You can still review this application.' on an error", async () => {
    vi.spyOn(service, 'getApplicationDuplicates').mockResolvedValue(fail('UNKNOWN', 'Network down.'))
    renderPanel()
    expect(await screen.findByText("Couldn't check for possible duplicates. You can still review this application.")).toBeInTheDocument()
    expect(screen.queryByText('Network down.')).not.toBeInTheDocument()
  })

  it("the error state offers 'Try again', which re-checks", async () => {
    const spy = vi.spyOn(service, 'getApplicationDuplicates').mockResolvedValueOnce(fail('UNKNOWN', 'Network down.')).mockResolvedValueOnce(ok(FOUND))
    renderPanel()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Possible duplicates')).toBeInTheDocument()
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it("an application row reads 'Application {reference} · {businessName} · {status label} · same email' and links to applicationAdminPath(id)", async () => {
    vi.spyOn(service, 'getApplicationDuplicates').mockResolvedValue(ok(FOUND))
    renderPanel()
    expect(await screen.findByRole('heading', { name: 'Possible duplicates' })).toBeInTheDocument()
    expect(screen.getByText('Check these before you decide. This is only a warning; every action stays available.')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Application AB12CD34 · Casa Nova · Approved · same email' })
    expect(link).toHaveAttribute('href', applicationAdminPath('app-2'))
  })

  it('match wording: same business name, both, and the business owner matches', async () => {
    vi.spyOn(service, 'getApplicationDuplicates').mockResolvedValue(ok({
      applications: [
        { id: 'a', reference: 'R1', businessName: 'Casa', status: 'submitted', createdAt: '2026-10-20T10:00:00Z', match: 'name' },
        { id: 'b', reference: 'R2', businessName: 'Casa', status: 'under_review', createdAt: '2026-10-19T10:00:00Z', match: 'both' },
      ],
      businesses: [
        { id: 'c', name: 'Shop', status: 'draft', match: 'owner_email' },
        { id: 'd', name: 'Casa', status: 'inactive', match: 'both' },
      ],
    }))
    renderPanel()
    expect(await screen.findByText('Application R1 · Casa · Submitted · same business name')).toBeInTheDocument()
    expect(screen.getByText('Application R2 · Casa · Under review · same email and business name')).toBeInTheDocument()
    expect(screen.getByText('Business Shop · Draft · its owner uses this email')).toBeInTheDocument()
    expect(screen.getByText('Business Casa · Inactive · same business name, and its owner uses this email')).toBeInTheDocument()
  })

  it('a business row links to businessAdminPath(id) only with businesses.view; without it the name is plain text', async () => {
    vi.spyOn(service, 'getApplicationDuplicates').mockResolvedValue(ok(FOUND))
    const first = renderPanel(['applications.view', 'businesses.view'])
    expect(await screen.findByRole('link', { name: 'Business Casa · Active · same business name' })).toHaveAttribute('href', businessAdminPath('biz-9'))
    first.unmount()

    renderPanel(['applications.view'])
    expect(await screen.findByText('Business Casa · Active · same business name')).toBeInTheDocument()
    await vi.waitFor(() => expect(service.getMyAccess).toHaveBeenCalled())
    await vi.waitFor(() => expect(screen.queryByRole('link', { name: /Business Casa/ })).not.toBeInTheDocument())
    expect(screen.getByText('Business Casa · Active · same business name').tagName).toBe('SPAN')
    // Application rows still link.
    expect(screen.getByRole('link', { name: /Application AB12CD34/ })).toBeInTheDocument()
  })
})
