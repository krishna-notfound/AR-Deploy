import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { BusinessApplication, Permission } from '@/domain/types'
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

/** Signed in as a Team member whose role holds exactly `permissions`. */
function renderAsTeam(id: string, permissions: Permission[]) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'team' }))
  vi.spyOn(service, 'getMyAccess').mockResolvedValue(ok({ role: 'team', permissions, status: 'active' }))
  renderPage(id)
}

/** An application approved in the demo whose business was then deleted (R-W2-2). */
async function approvedThenDeleted(): Promise<string> {
  const id = await submitApplication()
  const approved = await service.reviewApplication(id, 'approve')
  if (!approved.ok) throw new Error(approved.error.message)
  await service.deleteBusiness(approved.data.businessId!)
  return id
}

async function approveFromPage() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Approve' }))
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve' }))
}

describe('ApplicationDetailPage: deleted business, reopen, duplicates, approval result (R-W2-2, R-W2-6, R-W2-9)', () => {
  // jsdom has no scrolling; the approval scrolls to the owner invitation.
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  it("an approved application with businessDeletedAt shows 'Business deleted on {date}'; with no business and no date it shows 'The business created from this application was deleted.'", async () => {
    const id = await approvedThenDeleted()
    renderPage(id)
    expect(await screen.findByText(/^Business deleted on .+/)).toBeInTheDocument()
    expect(screen.queryByText('The business created from this application was deleted.')).not.toBeInTheDocument()
    cleanup()

    // L1: deleted before S1.5, so no date is known.
    const app = (await service.getApplication(id)) as { ok: true; data: BusinessApplication }
    vi.spyOn(service, 'getApplication').mockResolvedValue(ok({ ...app.data, businessDeletedAt: undefined }))
    renderPage(id)
    expect(await screen.findByText('The business created from this application was deleted.')).toBeInTheDocument()
    expect(screen.queryByText(/^Business deleted on/)).not.toBeInTheDocument()
  })

  it("Reopen for review shows only with applications.approve and only for that state; it calls reviewApplication(id, 'reopen')", async () => {
    const id = await approvedThenDeleted()
    const spy = vi.spyOn(service, 'reviewApplication')
    renderPage(id)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Reopen for review' }))
    expect(spy).toHaveBeenCalledWith(id, 'reopen', undefined, { includeReason: false })
    expect(await screen.findByText('Reopened for review')).toBeInTheDocument()
    const after = (await service.getApplication(id)) as { ok: true; data: BusinessApplication }
    expect(after.data.status).toBe('under_review')
    cleanup()

    // Without applications.approve: hidden (a fresh demo, so the same applicant can apply again).
    await service.resetDemoData()
    const other = await approvedThenDeleted()
    renderAsTeam(other, ['applications.view', 'applications.reject'])
    expect(await screen.findByText(/^Business deleted on .+/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reopen for review' })).not.toBeInTheDocument()
  })

  it('Reopen for review is not offered while the business exists or before approval', async () => {
    const id = await submitApplication()
    renderPage(id)
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reopen for review' })).not.toBeInTheDocument()
    await approveFromPage()
    expect(await screen.findByRole('link', { name: 'Open business' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reopen for review' })).not.toBeInTheDocument()
  })

  it('Approve stays enabled while the duplicates panel is shown', async () => {
    const id = await submitApplication()
    vi.spyOn(service, 'getApplicationDuplicates').mockResolvedValue(ok({
      applications: [{ id: 'app-old', reference: 'OLD12345', businessName: 'Atelier Norte', status: 'approved', createdAt: '2026-10-01T10:00:00Z', match: 'both' }],
      businesses: [],
    }))
    const spy = vi.spyOn(service, 'reviewApplication')
    renderPage(id)
    const heading = await screen.findByRole('heading', { name: 'Possible duplicates' })
    const approveButton = screen.getByRole('button', { name: 'Approve' })
    expect(approveButton).toBeEnabled()
    // R-W2-9: the panel comes before the review actions in reading order (both widths share one DOM order).
    expect(heading.compareDocumentPosition(approveButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    for (const name of ['Start review', 'Reject']) expect(heading.compareDocumentPosition(screen.getByRole('button', { name })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await approveFromPage()
    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith(id, 'approve', undefined, { includeReason: false }))
  })

  it("with owners.manage and businesses.view: today's toast and 'Go to owner invitation'", async () => {
    const id = await submitApplication()
    renderAsTeam(id, ['applications.view', 'applications.approve', 'businesses.view', 'owners.manage'])
    await approveFromPage()
    expect(await screen.findByText('Next: invite the owner so they can set up the catalogue.')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Go to owner invitation' })).toBeInTheDocument()
  })

  it("without owners.manage: 'Approved. A draft business was created. Someone with 'Invite and remove business owners' must invite the owner.'", async () => {
    const id = await submitApplication()
    renderAsTeam(id, ['applications.view', 'applications.approve', 'businesses.view'])
    await approveFromPage()
    expect(await screen.findByText("Approved. A draft business was created. Someone with 'Invite and remove business owners' must invite the owner.")).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Open business' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Go to owner invitation' })).not.toBeInTheDocument()
    expect(screen.queryByText('Next: invite the owner so they can set up the catalogue.')).not.toBeInTheDocument()
  })

  it("without businesses.view: the business card and owner panel are replaced by 'A draft business was created. Your role can't open businesses.' and there is no 'Business not found'", async () => {
    const id = await submitApplication()
    const lookups = vi.spyOn(service, 'getBusinessById')
    renderAsTeam(id, ['applications.view', 'applications.approve'])
    await approveFromPage()
    expect(await screen.findByText("A draft business was created. Your role can't open businesses.")).toBeInTheDocument()
    expect(screen.queryByText('Business not found')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open business' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Owner' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Go to owner invitation' })).not.toBeInTheDocument()
    expect(lookups).not.toHaveBeenCalled()
  })
})

describe('ApplicationDetailPage: history gating (R-W7-8)', () => {
  it("without records.view: 'Showing application events only.' and the history asks for the application only", async () => {
    const id = await submitApplication()
    const spy = vi.spyOn(service, 'getAuditEvents')
    renderAsTeam(id, ['applications.view', 'businesses.view'])
    expect(await screen.findByText('Showing application events only.')).toBeInTheDocument()
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ applicationId: id, businessId: undefined }))
  })

  it('with records.view: no note', async () => {
    const id = await submitApplication()
    renderAsTeam(id, ['applications.view', 'records.view'])
    expect(await screen.findByText('History')).toBeInTheDocument()
    expect(await screen.findByText('Email activity')).toBeInTheDocument()
    expect(screen.queryByText('Showing application events only.')).not.toBeInTheDocument()
  })
})
