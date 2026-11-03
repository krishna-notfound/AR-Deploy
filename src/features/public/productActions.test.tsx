import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { service } from '@/services'
import { AR_TIPS_KEY } from './ArTips'

vi.mock('@google/model-viewer', () => ({}))

const open = (path: string) => {
  window.history.replaceState(null, '', path)
  return render(<App />)
}

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(AR_TIPS_KEY, '1')
  await service.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('business product page: stage switch and real buttons (ADR-0047)', () => {
  it('has the Photos | 3D switch inside the stage, not a side rail', { timeout: 30_000 }, async () => {
    open('/products/casa-lisboa/glam-velvet-sofa')
    await screen.findByRole('heading', { level: 1, name: 'Glam Velvet Sofa' }, { timeout: 8000 })
    const sw = await screen.findByRole('group', { name: 'Show photographs or the 3D model' })
    // Inside the framed stage card.
    expect(sw.closest('figure')).not.toBeNull()
    const photos = within(sw).getByRole('button', { name: 'Photos' })
    const three = within(sw).getByRole('button', { name: '3D' })
    expect(photos).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(three)
    expect(three).toHaveAttribute('aria-pressed', 'true')
    // The old rail was a list beside the stage with a labelled action; it is gone.
    expect(document.querySelector('figure ~ ul')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Photos' })).toHaveLength(1)
  })

  it("renders the product's own link and Share as real outlined buttons of the same height as the main one", { timeout: 30_000 }, async () => {
    open('/products/casa-lisboa/glam-velvet-sofa')
    await screen.findByRole('heading', { level: 1, name: 'Glam Velvet Sofa' }, { timeout: 8000 })
    const link = document.querySelector('[data-product-link]') as HTMLAnchorElement
    expect(link).toHaveAttribute('href', 'https://casalisboa.example/contact')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.className).toContain('border-obsidian')
    expect(link.className).toContain('h-12')
    // Next to the main 3D / AR button, in the call-to-action row.
    expect(link.closest('[data-ar-cta]')).not.toBeNull()
    const share = screen.getByRole('button', { name: 'Share' })
    expect(share.className).toContain('border-obsidian')
    expect(share.className).toContain('h-12')
  })

  it('records the view event (only the showcase skips analytics)', { timeout: 30_000 }, async () => {
    const record = vi.spyOn(service, 'recordEvent')
    open('/products/casa-lisboa/glam-velvet-sofa')
    await screen.findByRole('heading', { level: 1, name: 'Glam Velvet Sofa' }, { timeout: 8000 })
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ type: 'view' }))
  })
})
