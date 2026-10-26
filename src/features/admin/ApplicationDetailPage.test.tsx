import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { BusinessApplication } from '@/domain/types'
import { service } from '@/services'
import { fail, ok } from '@/services/catalogService'
import { resetMockAccount } from '@/services/mock/mockAccount'
import ApplicationDetailPage from './ApplicationDetailPage'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
  resetMockAccount()
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** The demo seed has no applications: submit one to review. */
async function submitApplication(): Promise<string> {
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
  if (!res.ok) throw new Error(res.error.message)
  return res.data.id
}

function renderPage(id: string) {
  const router = createMemoryRouter([{ path: '/admin/applications/:applicationId', element: <ApplicationDetailPage /> }], { initialEntries: [`/admin/applications/${id}`] })
  render(
    <AccountProvider>
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ToastProvider>
    </AccountProvider>,
  )
}

async function openReject() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Reject' }))
  const dialog = await screen.findByRole('dialog')
  return { user, dialog }
}

describe('ApplicationDetailPage', () => {
  it('shows the empty state for an unknown application', async () => {
    renderPage('app_missing')
    expect(await screen.findByText('Application not found')).toBeInTheDocument()
  })

  it('shows an error with retry when the application fails to load', async () => {
    vi.spyOn(service, 'getApplication').mockResolvedValue(fail('UNKNOWN', 'Network down.'))
    renderPage('app_x')
    expect(await screen.findByText('Network down.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('shows the application once it has loaded', async () => {
    const id = await submitApplication()
    renderPage(id)
    expect(await screen.findByRole('heading', { name: 'Atelier Norte' })).toBeInTheDocument()
  })

  it("the reject modal has 'Include the reason in the email', off by default, with the hint", async () => {
    const id = await submitApplication()
    renderPage(id)
    const { dialog } = await openReject()
    const box = within(dialog).getByRole('checkbox', { name: 'Include the reason in the email' })
    expect(box).not.toBeChecked()
    expect(within(dialog).getByText('Off: the applicant is told the application was not approved, with no reason.')).toBeInTheDocument()
  })

  it("toast 'Application rejected. The applicant was emailed.' when the status is accepted, and the tick is sent", async () => {
    const id = await submitApplication()
    const app = (await service.getApplication(id)) as { ok: true; data: BusinessApplication }
    const spy = vi.spyOn(service, 'reviewApplication').mockResolvedValue(ok({ ...app.data, status: 'rejected', decisionReason: 'Too small', decisionEmail: { status: 'accepted' } }))
    renderPage(id)
    const { user, dialog } = await openReject()
    await user.type(within(dialog).getByRole('textbox'), 'Too small')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Include the reason in the email' }))
    await user.click(within(dialog).getByRole('button', { name: 'Reject application' }))
    expect(await screen.findByText('Application rejected. The applicant was emailed.')).toBeInTheDocument()
    expect(spy).toHaveBeenCalledWith(id, 'reject', 'Too small', { includeReason: true })
  })

  it("toast 'Application rejected, but the email was not sent: {reason}.' otherwise (demo mode records the attempt)", async () => {
    const id = await submitApplication()
    const spy = vi.spyOn(service, 'reviewApplication')
    renderPage(id)
    const { user, dialog } = await openReject()
    await user.type(within(dialog).getByRole('textbox'), 'Outside our region')
    await user.click(within(dialog).getByRole('button', { name: 'Reject application' }))
    expect(await screen.findByText('Application rejected, but the email was not sent: Demo mode: no email is sent.')).toBeInTheDocument()
    expect(spy).toHaveBeenCalledWith(id, 'reject', 'Outside our region', { includeReason: false })
    const emails = await service.getEmailAttempts({ applicationId: id })
    expect(emails.ok && emails.data.filter((e) => e.kind === 'application_decision')).toHaveLength(1)
  })
})
