import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { account } from '@/services'
import { accountFail } from '@/services/accountService'
import { ok } from '@/services/catalogService'
import { resetMockAccount } from '@/services/mock/mockAccount'
import { ActionCodeDialog } from './ActionCodeDialog'

function renderDialog(onConfirm = vi.fn(async () => ok(undefined)), onClose = vi.fn()) {
  render(
    <ActionCodeDialog
      open
      purpose="request_closure"
      title="Confirm closure request"
      description="Enter the code to request closure."
      confirmLabel="Request closure"
      destructive
      onClose={onClose}
      onConfirm={onConfirm}
    />,
  )
  return { onConfirm, onClose }
}

const codeInput = () => screen.getByLabelText('6-digit code')
const confirmButton = () => screen.getByRole('button', { name: 'Request closure' })

beforeEach(() => {
  resetMockAccount()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ActionCodeDialog', () => {
  it('sends a code on open and shows the masked address', async () => {
    const send = vi.spyOn(account, 'sendActionCode')
    renderDialog()
    expect(await screen.findByText(/We emailed a 6-digit code to/)).toHaveTextContent('d•••@demo.example')
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('request_closure')
    expect(screen.getByRole('dialog', { name: 'Confirm closure request' })).toBeInTheDocument()
  })

  it('Resend is disabled for 30 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const send = vi.spyOn(account, 'sendActionCode')
    renderDialog()
    await screen.findByText(/We emailed a 6-digit code to/)
    expect(screen.getByRole('button', { name: /Resend code/ })).toBeDisabled()
    await act(async () => {
      vi.advanceTimersByTime(29_000)
    })
    expect(screen.getByRole('button', { name: /Resend code/ })).toBeDisabled()
    await act(async () => {
      vi.advanceTimersByTime(1_500)
    })
    const resend = screen.getByRole('button', { name: 'Resend code' })
    expect(resend).toBeEnabled()
    await user.click(resend)
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: /Resend code/ })).toBeDisabled()
  })

  it('maps invalid_code, code_expired, too_many_attempts and rate_limited to plain messages', async () => {
    const user = userEvent.setup()
    const onConfirm = vi
      .fn()
      .mockResolvedValueOnce(accountFail('invalid_code'))
      .mockResolvedValueOnce(accountFail('code_expired'))
      .mockResolvedValueOnce(accountFail('too_many_attempts'))
      .mockResolvedValueOnce(accountFail('rate_limited'))
      .mockResolvedValueOnce({ ok: false, error: { code: 'UNKNOWN', message: 'Plain server sentence.', reason: 'something_new' } })
    renderDialog(onConfirm)
    await screen.findByText(/We emailed a 6-digit code to/)
    const attempt = async () => {
      await user.clear(codeInput())
      await user.type(codeInput(), '000000')
      await user.click(confirmButton())
    }
    await attempt()
    expect(await screen.findByText("That code isn't right. Check it and try again.")).toBeInTheDocument()
    await attempt()
    expect(await screen.findByText('That code has expired. Send a new code and try again.')).toBeInTheDocument()
    await attempt()
    expect(await screen.findByText('Too many wrong attempts. Send a new code and try again.')).toBeInTheDocument()
    await attempt()
    expect(await screen.findByText('Too many codes were requested. Wait a few minutes and try again.')).toBeInTheDocument()
    await attempt()
    expect(await screen.findByText('Plain server sentence.')).toBeInTheDocument()
    expect(onConfirm).toHaveBeenCalledTimes(5)
  })

  it('shows the send failure with a resend option', async () => {
    const user = userEvent.setup()
    const send = vi.spyOn(account, 'sendActionCode').mockResolvedValueOnce(accountFail('email_failed'))
    const { onConfirm } = renderDialog()
    expect(await screen.findByText("We couldn't send the code. Try again.")).toBeInTheDocument()
    expect(screen.queryByText(/We emailed a 6-digit code to/)).toBeNull()
    // Nothing runs without a sent code.
    expect(confirmButton()).toBeDisabled()
    expect(onConfirm).not.toHaveBeenCalled()
    const resend = screen.getByRole('button', { name: 'Resend code' })
    expect(resend).toBeEnabled()
    await user.click(resend)
    expect(await screen.findByText(/We emailed a 6-digit code to/)).toHaveTextContent('d•••@demo.example')
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('runs onConfirm only with a 6-digit code', async () => {
    const user = userEvent.setup()
    const { onConfirm, onClose } = renderDialog()
    await screen.findByText(/We emailed a 6-digit code to/)
    expect(codeInput()).toHaveAttribute('inputmode', 'numeric')
    expect(codeInput()).toHaveAttribute('autocomplete', 'one-time-code')
    await user.type(codeInput(), '12a345')
    expect(codeInput()).toHaveValue('12345')
    await user.click(confirmButton())
    expect(await screen.findByText('Enter the 6-digit code.')).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
    await user.type(codeInput(), '6')
    await user.click(confirmButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('123456'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
