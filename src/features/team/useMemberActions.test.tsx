// S1.5 Task 13 (R-W7-6): the Owner's notice toasts say whether the person was actually emailed.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { NoticeOutcome } from '@/services'
import { useNoticeToast } from './useMemberActions'

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
