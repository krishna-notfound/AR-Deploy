import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { RecoveryCodes, recoveryCodesText } from './RecoveryCodes'

const CODES = ['ABCDE-FGHJK', 'MNPQR-STUVW', 'XYZ23-45678', '9ABCD-EFGHJ', 'KMNPQ-RSTUV', 'WXYZ2-34567', '89ABC-DEFGH', 'JKMNP-QRSTU']

const originalUrl = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  URL.createObjectURL = originalUrl.create
  URL.revokeObjectURL = originalUrl.revoke
})

describe('RecoveryCodes', () => {
  it('lists every code, copies them all, and finishes only once saving is confirmed', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    const writeText = vi.fn(async (_t: string) => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(
      <ToastProvider>
        <RecoveryCodes codes={CODES} onDone={onDone} />
      </ToastProvider>,
    )
    const items = within(screen.getByRole('list', { name: 'Recovery codes' })).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(CODES)
    expect(screen.getByText(/Each code works once/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Copy codes' }))
    expect(writeText).toHaveBeenCalledWith(recoveryCodesText(CODES))
    expect(await screen.findByText('Recovery codes copied')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(onDone).not.toHaveBeenCalled()
    await user.click(screen.getByRole('checkbox', { name: 'I saved these codes' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('the text file holds one code per line', () => {
    const text = recoveryCodesText(CODES)
    for (const c of CODES) expect(text).toContain(`${c}\n`)
    expect(text).toMatch(/Sanctus recovery codes/)
  })

  it('focuses its heading when it appears', () => {
    render(
      <ToastProvider>
        <RecoveryCodes codes={CODES} onDone={() => {}} />
      </ToastProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Save your recovery codes' })).toHaveFocus()
  })

  it('downloads a .txt with the account and date, and releases the blob URL afterwards', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-25T12:00:00Z'))
    const createObjectURL = vi.fn((_b: Blob) => 'blob:recovery')
    const revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(
      <ToastProvider>
        <RecoveryCodes codes={CODES} account="owner@studio.pt" onDone={() => {}} />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Download .txt' }))
    expect(click).toHaveBeenCalledTimes(1)
    const a = click.mock.contexts[0] as HTMLAnchorElement
    expect(a.download).toMatch(/\.txt$/)
    expect(a.href).toBe('blob:recovery')
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:recovery')
    vi.useRealTimers()
    const text = await createObjectURL.mock.calls[0]![0].text()
    expect(text).toContain('Account: owner@studio.pt')
    expect(text).toContain('Created: 2026-10-25')
    expect(text).toContain(CODES[7])
  })
})
