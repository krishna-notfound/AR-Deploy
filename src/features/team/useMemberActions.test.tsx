// S1.5 Task 13 (R-W7-6): the Owner's notice toasts say whether the person was actually emailed.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { InviteOutcome, PlatformMember } from '@/domain/types'
import { type NoticeOutcome, service } from '@/services'
import { ok } from '@/services/catalogService'
import { useMemberActions, useNoticeToast } from './useMemberActions'

afterEach(() => {
  vi.restoreAllMocks()
})

function Probe({ done, notice, body }: { done: string; notice: NoticeOutcome; body?: string }) {
  const report = useNoticeToast()
  return (
    <button type="button" onClick={() => report(done, notice, body)}>
      Run
    </button>
  )
}

async function toastFor(done: string, notice: NoticeOutcome, body?: string) {
  const view = render(
    <ToastProvider>
      <Probe done={done} notice={notice} body={body} />
    </ToastProvider>,
  )
  await userEvent.setup().click(screen.getByRole('button', { name: 'Run' }))
  return view
}

describe('notice toasts (R-W7-6)', () => {
  it("toasts end '…. They were emailed.' only for accepted, else '…, but the notice email was not sent: {reason}.'", async () => {
    const a = await toastFor('Their 2FA was reset', { status: 'accepted' })
    expect(await screen.findByText('Their 2FA was reset. They were emailed.')).toBeInTheDocument()
    a.unmount()

    const b = await toastFor('Business restored', { status: 'blocked', error: 'email_not_configured' }, 'The catalog is back at its previous status.')
    expect(await screen.findByText('Business restored, but the notice email was not sent: The email service is not configured on the server yet.')).toBeInTheDocument()
    expect(screen.getByText('The catalog is back at its previous status.')).toBeInTheDocument()
    expect(screen.queryByText(/They were emailed/)).toBeNull()
    b.unmount()

    // A send that failed with no reason, and one the provider refused with its own words.
    const c = await toastFor('Closure completed', { status: 'failed' })
    expect(await screen.findByText('Closure completed, but the notice email was not sent: the email service did not take it.')).toBeInTheDocument()
    c.unmount()
    await toastFor('Their 2FA was reset', { status: 'blocked', error: 'no_recipient' })
    expect(await screen.findByText('Their 2FA was reset, but the notice email was not sent: The account has no email address.')).toBeInTheDocument()
  })

  it('never shows raw provider text: an unknown reason falls back to the generic sentence', async () => {
    await toastFor('Business restored', { status: 'failed', error: 'Resend 500: internal <b>oops</b> at api.resend.com' })
    expect(await screen.findByText('Business restored, but the notice email was not sent: the email service did not take it.')).toBeInTheDocument()
    expect(screen.queryByText(/Resend 500|oops|api\.resend\.com/)).toBeNull()
  })
})

// Final review: the invitation and removal toasts show fixed copy only, and say what happened to the login.
function ActionsProbe({ invite, member }: { invite?: InviteOutcome; member?: PlatformMember }) {
  const actions = useMemberActions()
  return (
    <>
      <button type="button" onClick={() => invite && actions.reportInvite(ok(invite), 'ana@studio.test')}>
        Invite
      </button>
      <button type="button" onClick={() => member && void actions.remove(member)}>
        Remove
      </button>
    </>
  )
}

const renderActions = (props: { invite?: InviteOutcome; member?: PlatformMember }) =>
  render(
    <ToastProvider>
      <ConfirmProvider>
        <ActionsProbe {...props} />
      </ConfirmProvider>
    </ToastProvider>,
  )

const FAILED: InviteOutcome = { memberId: 'm1', status: 'email_failed', sentAt: '2026-10-25T10:00:00Z', expiresAt: '2026-11-01T10:00:00Z' }

describe('invitation and removal toasts (final review)', () => {
  it('a failed invitation email never shows provider text; a known reason shows its fixed copy', async () => {
    const a = renderActions({ invite: { ...FAILED, error: 'Resend 500: internal provider detail' } })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Invite' }))
    expect(await screen.findByText('The email service did not take it. Try resending it.')).toBeInTheDocument()
    expect(screen.queryByText(/internal provider detail/)).toBeNull()
    a.unmount()

    renderActions({ invite: { ...FAILED, error: 'invalid_recipient' } })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Invite' }))
    expect(await screen.findByText('The email address is not valid.')).toBeInTheDocument()
  })

  it('removing a member who never signed in says there was no login to delete', async () => {
    const member = {
      id: 'mem_x', userId: null, email: 'x@studio.test', fullName: null, role: 'team', status: 'deactivated', invitedBy: null,
      createdAt: '2026-10-01T00:00:00Z', activatedAt: null, deactivatedAt: '2026-10-02T00:00:00Z', lastSignInAt: null, invite: null,
    } as unknown as PlatformMember
    vi.spyOn(service, 'removeMember').mockResolvedValue(ok({ loginDeleted: false }))
    renderActions({ member })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await user.click(await screen.findByRole('button', { name: 'Remove member' }))
    expect(await screen.findByText('x@studio.test was removed.')).toBeInTheDocument()
    expect(screen.getByText('They never signed in, so there was no login to delete.')).toBeInTheDocument()
  })
})
