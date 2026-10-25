import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { RecoveryCodes, recoveryCodesText } from './RecoveryCodes'

const CODES = ['ABCDE-FGHJK', 'MNPQR-STUVW', 'XYZ23-45678', '9ABCD-EFGHJ', 'KMNPQ-RSTUV', 'WXYZ2-34567', '89ABC-DEFGH', 'JKMNP-QRSTU']

afterEach(() => {
  vi.restoreAllMocks()
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
})
