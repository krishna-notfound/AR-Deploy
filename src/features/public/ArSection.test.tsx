import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import type { ArMode } from '../ar/capability'
import { ArSection } from './ArSection'

function setup(mode: ArMode, extra: { startFailed?: boolean; canOpenNative?: boolean } = {}) {
  const on = { onActivate: vi.fn(), onOpenNative: vi.fn(), onPrecise: vi.fn(), onShowTips: vi.fn() }
  render(
    <LanguageProvider>
      <ArSection mode={mode} startFailed={extra.startFailed ?? false} canOpenNative={extra.canOpenNative ?? false} {...on} />
    </LanguageProvider>,
  )
  return { on, user: userEvent.setup() }
}

describe('ArSection', () => {
  it('offers precise placement (WebXR beta) next to the native viewer when both are available', async () => {
    const { on, user } = setup({ mode: 'native', webxrBeta: true })
    await user.click(screen.getByRole('button', { name: 'Precise placement (beta)' }))
    expect(on.onPrecise).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'View in my home' }))
    expect(on.onActivate).toHaveBeenCalledOnce()
  })

  it('shows no beta link when only the native viewer exists', () => {
    setup({ mode: 'native', webxrBeta: false })
    expect(screen.queryByRole('button', { name: 'Precise placement (beta)' })).toBeNull()
  })

  it('after every AR path failed: an honest notice, no AR button, no phone hand-off', () => {
    setup({ mode: 'none', reason: 'failed' }, { startFailed: true })
    expect(screen.getByRole('alert')).toHaveTextContent('AR could not start on this device')
    expect(screen.queryByRole('button', { name: 'View in my home' })).toBeNull()
    expect(screen.queryByText('View in your room on a phone')).toBeNull()
  })
})
