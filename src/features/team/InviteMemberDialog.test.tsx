import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { service } from '@/services'
import { teamFail } from '@/services/catalogService'
import { InviteMemberDialog } from './InviteMemberDialog'

function renderDialog(onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <ToastProvider>
        <ConfirmProvider>
          <InviteMemberDialog open onClose={onClose} />
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
  return within(screen.getByRole('dialog'))
}

beforeEach(async () => {
  localStorage.clear()
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin' }))
  await service.resetDemoData()
})
afterEach(() => vi.restoreAllMocks())

describe('Invite member dialog (ADR-0030)', () => {
  it('checks the email before going on', async () => {
    const user = userEvent.setup()
    const d = renderDialog()
    await user.click(d.getByRole('button', { name: 'Review invitation' }))
    expect(d.getByText('Enter a valid email address.')).toBeInTheDocument()
    await user.type(d.getByLabelText(/Email address/), 'not-an-email')
    await user.click(d.getByRole('button', { name: 'Review invitation' }))
    expect(d.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(d.queryByText('Check the invitation')).toBeNull()
  })

  it('shows what the chosen role can do', async () => {
    const user = userEvent.setup()
    const d = renderDialog()
    await user.click(d.getByRole('radio', { name: /Team/ }))
    const list = await d.findByRole('list', { name: 'Team permissions' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'View businesses',
      'View applications',
      'View products and catalogues',
      'Create and edit products',
      'View analytics',
    ])
  })

  it('reviews, sends and reports the result honestly', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(service, 'inviteMember')
    const d = renderDialog()
    await user.type(d.getByLabelText(/Email address/), 'New@Studio.test')
    await user.click(d.getByRole('radio', { name: /Admin/ }))
    await user.type(d.getByLabelText(/Note/), 'Welcome aboard')
    await user.click(d.getByRole('button', { name: 'Review invitation' }))
    expect(await d.findByText('Check the invitation')).toBeInTheDocument()
    expect(d.getByText('new@studio.test')).toBeInTheDocument()
    await user.click(d.getByRole('button', { name: 'Send invitation' }))
    expect(await d.findByText(/Invitation sent to new@studio.test/)).toBeInTheDocument()
    expect(spy).toHaveBeenCalledWith({ email: 'new@studio.test', role: 'admin', note: 'Welcome aboard' })
  })

  it('never shows success when the email failed', async () => {
    const user = userEvent.setup()
    vi.spyOn(service, 'inviteMember').mockResolvedValue({ ok: true, data: { memberId: 'm1', status: 'email_failed', sentAt: '2026-10-25T10:00:00Z', expiresAt: '2026-11-01T10:00:00Z', error: 'provider down' } })
    const d = renderDialog()
    await user.type(d.getByLabelText(/Email address/), 'a@studio.test')
    await user.click(d.getByRole('button', { name: 'Review invitation' }))
    await user.click(await d.findByRole('button', { name: 'Send invitation' }))
    expect(await d.findByText(/Invitation saved, but the email wasn't delivered/)).toBeInTheDocument()
    expect(d.queryByText(/Invitation sent to/)).toBeNull()
    expect(d.getByRole('button', { name: 'Try sending again' })).toBeInTheDocument()
  })

  it('returns to the form with the reason when the server refuses', async () => {
    const user = userEvent.setup()
    vi.spyOn(service, 'inviteMember').mockResolvedValue(teamFail('already_member'))
    const d = renderDialog()
    await user.type(d.getByLabelText(/Email address/), 'ana.ribeiro@sanctus.example')
    await user.click(d.getByRole('button', { name: 'Review invitation' }))
    await user.click(await d.findByRole('button', { name: 'Send invitation' }))
    expect(await d.findByText('This email already has platform access.')).toBeInTheDocument()
    expect(d.getByLabelText(/Email address/)).toBeInTheDocument()
  })

  it('disables Send while the invitation is going out', async () => {
    const user = userEvent.setup()
    let release: () => void = () => {}
    vi.spyOn(service, 'inviteMember').mockImplementation(
      () => new Promise((r) => (release = () => r({ ok: true, data: { memberId: 'm', status: 'sent', sentAt: '2026-10-25T10:00:00Z', expiresAt: '2026-11-01T10:00:00Z' } }))),
    )
    const d = renderDialog()
    await user.type(d.getByLabelText(/Email address/), 'b@studio.test')
    await user.click(d.getByRole('button', { name: 'Review invitation' }))
    await user.click(await d.findByRole('button', { name: 'Send invitation' }))
    await waitFor(() => expect(d.getByRole('button', { name: /Send invitation/ })).toBeDisabled())
    release()
    expect(await d.findByText(/Invitation sent to/)).toBeInTheDocument()
  })
})
