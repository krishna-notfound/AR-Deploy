// Client round 3, R3-B (ADR-0062): the Sanctus wordmark in every public header, the company name written once (on the catalogue
// photograph), and whole pieces (object-contain) in the product thumbnails and "More photos". Whole-app renders in demo mode.
import { render, screen, within } from '@testing-library/react'
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

/** The sticky page header's Sanctus link. */
function wordmarkLink() {
  const header = screen.getByRole('banner')
  return within(header).getByRole('link', { name: 'Sanctus home' })
}

describe('public header (ADR-0062)', () => {
  it('shows the Sanctus wordmark linking to the home page, and no company name or logo, on the catalogue', async () => {
    openApp('/catalog/nordhaus')
    await screen.findByRole('heading', { name: 'Nordhaus Living', level: 1 })
    expect(wordmarkLink()).toHaveAttribute('href', '/')
    const header = screen.getByRole('banner')
    expect(within(header).queryByText(/Nordhaus/)).toBeNull()
    expect(header.querySelector('img')).toBeNull()
  })

  it('has the wordmark while the page loads and when the catalogue is not found', async () => {
    const view = openApp('/catalog/no-such-store')
    expect(wordmarkLink()).toHaveAttribute('href', '/') // the loading frame already has it
    await screen.findByRole('heading', { name: 'Catalog not found' })
    expect(wordmarkLink()).toHaveAttribute('href', '/')
    view.unmount()
    openApp('/products/nordhaus/no-such-piece')
    await screen.findByRole('heading', { name: 'Product not available' })
    expect(wordmarkLink()).toHaveAttribute('href', '/')
  })

  it('shows the wordmark and not the company name in the header of a product page', async () => {
    openApp('/products/nordhaus/fjord-shell-chair')
    await screen.findByRole('heading', { name: 'Fjord Shell Chair', level: 1 })
    expect(wordmarkLink()).toHaveAttribute('href', '/')
    expect(within(screen.getByRole('banner')).queryByText(/Nordhaus/)).toBeNull()
  })
})

describe('company name on the catalogue (ADR-0062)', () => {
  it('is written once, as the only h1, and not in the footer', async () => {
    openApp('/catalog/nordhaus')
    await screen.findByText(/^\d+ products$/)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getAllByText('Nordhaus Living')).toHaveLength(1)
    expect(within(screen.getByRole('contentinfo')).queryByText(/Nordhaus/)).toBeNull()
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Catalogue powered by Sanctus')
    expect(document.title).toBe('Nordhaus Living') // the tab title keeps the name
  })

  it('keeps the category chips, search and product links', async () => {
    openApp('/catalog/nordhaus')
    await screen.findByText(/^\d+ products$/)
    expect(screen.getByRole('group', { name: 'Categories' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Fjord Shell Chair/ })).toHaveAttribute('href', '/products/nordhaus/fjord-shell-chair')
  })
})

describe('whole pieces in product pictures (ADR-0062)', () => {
  it('uses object-contain for the thumbnails and never the default object-cover', async () => {
    openApp('/products/nordhaus/fjord-shell-chair')
    await screen.findByRole('heading', { name: 'Fjord Shell Chair', level: 1 })
    const strip = await screen.findByRole('list', { name: 'Product media' })
    const imgs = strip.querySelectorAll('img')
    expect(imgs.length).toBeGreaterThan(1)
    for (const img of imgs) {
      expect(img.className).toContain('object-contain')
      expect(img.className).not.toContain('object-cover')
    }
  })
})
