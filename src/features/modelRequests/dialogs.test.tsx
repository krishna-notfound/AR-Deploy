import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DECLINE_HINT, DeclineDialog } from './DeclineDialog'
import { DeliverDialog, NO_USDZ_WARNING, reviewToast } from './DeliverDialog'

describe('S4 Task 6: deliver and decline dialogs', () => {
  it('deliver dialog title, body for the product and for an option, and the no-USDZ sentence only without a staged USDZ', async () => {
    const onConfirm = vi.fn()
    const { rerender } = render(<DeliverDialog open onClose={() => {}} onConfirm={onConfirm} productName="Alfama Bookcase" hasUsdz={false} />)
    expect(screen.getByRole('dialog', { name: 'Deliver the 3D model for Alfama Bookcase?' })).toBeInTheDocument()
    expect(screen.getByText(/These files replace the current 3D files of the product\. If the product is published, customers see the 3D view and AR right away\. The business owner is emailed\./)).toBeInTheDocument()
    expect(screen.getByText(NO_USDZ_WARNING)).toBeInTheDocument()
    rerender(<DeliverDialog open onClose={() => {}} onConfirm={onConfirm} productName="Alfama Bookcase" optionName="Oak" hasUsdz />)
    expect(screen.getByText(/replace the current 3D files of the option Oak\./)).toBeInTheDocument()
    expect(screen.queryByText(NO_USDZ_WARNING)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Deliver model' }))
    expect(onConfirm).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it("decline needs a reason, labelled 'Reason (sent to the business)' with the hint, and refuses blank", async () => {
    const onConfirm = vi.fn()
    render(<DeclineDialog open onClose={() => {}} onConfirm={onConfirm} />)
    expect(screen.getByRole('dialog', { name: 'Decline this request?' })).toBeInTheDocument()
    const field = screen.getByRole('textbox', { name: /Reason \(sent to the business\)/ })
    expect(screen.getByText(DECLINE_HINT)).toBeInTheDocument()
    await userEvent.type(field, '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Decline request' }))
    expect(screen.getByText('Write a reason. It is sent to the business.')).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
    await userEvent.type(field, ' Too dark ')
    await userEvent.click(screen.getByRole('button', { name: 'Decline request' }))
    expect(onConfirm).toHaveBeenCalledWith('Too dark')
  })

  it('toasts for each email status, and the partial clean-up suffix', () => {
    expect(reviewToast('deliver', { status: 'delivered', email: { status: 'accepted' } })).toEqual({ tone: 'success', title: 'Model delivered. The business owner was emailed.' })
    expect(reviewToast('decline', { status: 'rejected', email: { status: 'accepted' } })).toEqual({ tone: 'success', title: 'Request declined. The business owner was emailed.' })
    expect(reviewToast('deliver', { status: 'delivered', email: { status: 'failed', error: 'email_not_configured' } })).toEqual({
      tone: 'error', title: 'Model delivered, but the email was not sent: The email service is not configured on the server yet.',
    })
    expect(reviewToast('decline', { status: 'rejected', email: { status: 'blocked', error: 'no_recipient' } }).title).toBe('Request declined, but the email was not sent: The account has no email address.')
    // Fix round 1: unknown (provider) text is never shown, only the fixed fallback.
    const leaked = reviewToast('deliver', { status: 'delivered', email: { status: 'failed', error: 'Resend 500: upstream token sk_live_123 rejected' } })
    expect(leaked).toEqual({ tone: 'error', title: 'Model delivered, but the email was not sent: the email service did not take it.' })
    expect(leaked.title).not.toContain('Resend')
    expect(reviewToast('deliver', { status: 'delivered', email: { status: 'skipped' } }).title).toBe('Model delivered. The business has no owner, so no email was sent.')
    expect(reviewToast('deliver', { status: 'delivered', email: { status: 'demo' } }).title).toBe('Model delivered. Demo: no email was sent.')
    expect(reviewToast('decline', { status: 'rejected', email: { status: 'demo' } }).title).toBe('Request declined. Demo: no email was sent.')
    expect(reviewToast('start', { status: 'in_progress' }).title).toBe('Work started.')
    expect(reviewToast('deliver', { status: 'delivered', email: { status: 'accepted' }, cleanup: 'partial' }).title).toBe("Model delivered. The business owner was emailed. Some old files couldn't be removed.")
  })
})
