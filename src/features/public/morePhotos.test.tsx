// Owner decision 2026-11-16: the product page's "More photos" shows each additional photo in its own saved shape, in a
// staggered column layout, not forced into the 4:5 product frame. Whole-app renders in demo mode.
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { service } from '@/services'

function openApp(url: string) {
  window.history.replaceState(null, '', url)
  return render(<App />)
}

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('More photos (own shape, staggered columns)', () => {
  it('shows the heading and every additional photo at natural height, without the 4:5 frame or a letterbox', async () => {
    openApp('/products/casa-lisboa/glam-velvet-sofa')
    const heading = await screen.findByRole('heading', { name: 'More photos' })
    const section = heading.closest('section') as HTMLElement
    const imgs = section.querySelectorAll('img')
    expect(imgs).toHaveLength(2)
    for (const img of imgs) {
      expect(img.className).toContain('h-auto')
      expect(img.className).toContain('w-full')
      expect(img.className).not.toContain('aspect-')
      expect(img.className).not.toContain('object-contain')
      expect(img.className).not.toContain('bg-subtle')
      expect(img.getAttribute('loading')).toBe('lazy')
    }
  })

  it('lays the photos out in CSS columns whose items do not split across columns', async () => {
    openApp('/products/casa-lisboa/glam-velvet-sofa')
    const heading = await screen.findByRole('heading', { name: 'More photos' })
    const list = (heading.closest('section') as HTMLElement).querySelector('ul') as HTMLElement
    expect(list.className).toMatch(/(^|\s)columns-2(\s|$)/)
    expect(list.className).not.toContain('grid')
    const items = list.querySelectorAll(':scope > li')
    expect(items).toHaveLength(2)
    for (const li of items) expect(li.className).toContain('break-inside-avoid')
  })

  it('renders nothing for a product with no additional photos', async () => {
    openApp('/products/nordhaus/fjord-shell-chair')
    await screen.findByRole('heading', { name: 'Fjord Shell Chair', level: 1 })
    expect(screen.queryByRole('heading', { name: 'More photos' })).toBeNull()
  })
})
