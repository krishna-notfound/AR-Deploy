// The phone's sticky main action (round 2): shown only while the page's own action row is below the screen and the model has
// loaded; never without IntersectionObserver; one button in view at a time.
import { act, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { StickyActionBar } from './StickyActionBar'
import type { ProductStage } from './useProductStage'

type Callback = (entries: Array<Partial<IntersectionObserverEntry>>) => void
let callback: Callback | undefined

const stage = (over: Partial<ProductStage> = {}) => ({ modelState: 'loaded', availability: 'available', launching: false, onActivate: vi.fn(), open3d: vi.fn(), ...over }) as unknown as ProductStage

function Harness({ s }: { s: ProductStage }) {
  const [row, setRow] = useState<HTMLElement | null>(null)
  return (
    <LanguageProvider>
      <div ref={setRow}>actions</div>
      <StickyActionBar stage={s} arLabel="View in my home" row={row} />
    </LanguageProvider>
  )
}

describe('StickyActionBar', () => {
  beforeEach(() => {
    localStorage.setItem(LANG_KEY, 'en')
    callback = undefined
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: Callback) {
          callback = cb
        }
        observe() {}
        disconnect() {}
      },
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('shows the main action while the row is below the screen, and hides it once the row is in view', () => {
    render(<Harness s={stage()} />)
    expect(screen.queryByRole('button')).toBeNull()
    act(() => callback?.([{ isIntersecting: false, boundingClientRect: { top: 900 } as DOMRectReadOnly }]))
    expect(screen.getByRole('button', { name: /View in my home/ })).toBeInTheDocument()
    act(() => callback?.([{ isIntersecting: true, boundingClientRect: { top: 400 } as DOMRectReadOnly }]))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('stays hidden once the row has been scrolled past (above the screen)', () => {
    render(<Harness s={stage()} />)
    act(() => callback?.([{ isIntersecting: false, boundingClientRect: { top: -300 } as DOMRectReadOnly }]))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows nothing before the model has loaded (the row has no action either)', () => {
    render(<Harness s={stage({ modelState: 'loading' })} />)
    act(() => callback?.([{ isIntersecting: false, boundingClientRect: { top: 900 } as DOMRectReadOnly }]))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows nothing without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    render(<Harness s={stage()} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
