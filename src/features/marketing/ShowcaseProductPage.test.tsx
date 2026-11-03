import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { service } from '@/services'
import { AR_TIPS_KEY } from '../public/ArTips'

// The real web component needs WebGL: the element is a plain custom tag here, and the tests play its events.
vi.mock('@google/model-viewer', () => ({}))

type FakeViewer = HTMLElement & { canActivateAR?: boolean; activateAR?: () => Promise<void>; loaded?: boolean; getDimensions?: () => { x: number; y: number; z: number } }

const open = (path: string) => {
  window.history.replaceState(null, '', path)
  return render(<App />)
}

const viewer = () => document.querySelector('model-viewer') as FakeViewer | null
async function loadedViewer(canActivateAR: boolean) {
  await waitFor(() => expect(viewer()).not.toBeNull(), { timeout: 4000 })
  await act(async () => {}) // let the wrapper attach its event listeners
  const el = viewer()!
  el.canActivateAR = canActivateAR
  el.loaded = true
  el.getDimensions = () => ({ x: 0.828, y: 0.687, z: 0.571 })
  el.activateAR = vi.fn(async () => {})
  act(() => {
    el.dispatchEvent(new Event('load'))
  })
}

/** The first showcase piece of the demo data (prd_house_1) and one other. */
async function housePieces() {
  const res = await service.getShowcase()
  if (!res.ok) throw new Error('showcase')
  const [first, second] = res.data.products
  if (!first || !second) throw new Error('need two house pieces')
  return { first, second }
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

describe('ShowcaseProductPage (ADR-0047)', () => {
  it('shows a house piece in the site chrome: switch inside the stage, actions, one Apply link, no business header, no analytics', { timeout: 30_000 }, async () => {
    const { first } = await housePieces()
    const record = vi.spyOn(service, 'recordEvent')
    open(`/showcase/${first.slug}`)

    expect(await screen.findByRole('heading', { level: 1, name: first.name.en }, { timeout: 8000 })).toBeInTheDocument()
    // The platform's own chrome, not the tenant shell.
    expect(document.querySelector('.public-soft')).toBeNull()
    expect(screen.queryByRole('link', { name: /Back to/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'All collections' })).toHaveAttribute('href', '/#colecoes')

    // Photo | 3D switch inside the stage, no side rail.
    const sw = await screen.findByRole('group', { name: 'Show photographs or the 3D model' })
    const photos = within(sw).getByRole('button', { name: 'Photos' })
    const three = within(sw).getByRole('button', { name: '3D' })
    expect(photos).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(three)
    expect(three).toHaveAttribute('aria-pressed', 'true')
    expect(photos).toHaveAttribute('aria-pressed', 'false')

    // Primary action: 3D where AR cannot open, AR where it can.
    await loadedViewer(false)
    const actions = document.querySelector('[data-ar-cta]') as HTMLElement
    expect(within(actions).getByRole('button', { name: 'View in 3D' })).toBeInTheDocument()
    expect(within(actions).getByRole('button', { name: 'Share' })).toBeInTheDocument()

    // Exactly one Apply button in the page body (the header keeps its own).
    const main = screen.getByRole('main')
    expect(within(main).getAllByRole('link').filter((a) => a.getAttribute('href') === '/apply')).toHaveLength(1)
    expect(within(main).getByText('This is how your customers will see your pieces.')).toBeInTheDocument()
    expect(record).not.toHaveBeenCalled()
  })

  it('offers "View in your room" where the phone can open AR', { timeout: 30_000 }, async () => {
    const { first } = await housePieces()
    open(`/showcase/${first.slug}`)
    await screen.findByRole('heading', { level: 1, name: first.name.en }, { timeout: 8000 })
    await loadedViewer(true)
    expect(await screen.findByRole('button', { name: 'View in your room' })).toBeInTheDocument()
  })

  it("renders the piece's own link as a real outlined button next to the main one, and the other house pieces", { timeout: 30_000 }, async () => {
    const { first, second } = await housePieces()
    const real = service.getPublicProduct.bind(service)
    vi.spyOn(service, 'getPublicProduct').mockImplementation(async (b, p, o) => {
      const r = await real(b, p, o)
      return r.ok ? { ...r, data: { ...r.data, product: { ...r.data.product, cta: { label: { en: 'Visit the maker' }, url: 'https://maker.example/piece' } } } } : r
    })
    open(`/showcase/${first.slug}`)
    await screen.findByRole('heading', { level: 1, name: first.name.en }, { timeout: 8000 })
    await loadedViewer(false)
    const link = await screen.findByRole('link', { name: 'Visit the maker' })
    expect(link).toHaveAttribute('href', 'https://maker.example/piece')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('data-product-link')
    expect(link.className).toContain('border-obsidian')
    expect(link.className).toContain('h-12')
    expect(link.parentElement).toBe(document.querySelector('[data-ar-cta]'))

    const more = screen.getByRole('list', { name: 'More pieces from the showcase' })
    expect(within(more).queryByText(first.name.en)).toBeNull()
    expect(within(more).getByRole('link', { name: new RegExp(second.name.en) })).toHaveAttribute('href', `/showcase/${second.slug}`)
  })

  it('answers an unknown piece with the public not-found message', { timeout: 30_000 }, async () => {
    open('/showcase/no-such-piece')
    expect(await screen.findByRole('heading', { name: 'Page not found' }, { timeout: 8000 })).toBeInTheDocument()
  })

  it('does not show a business piece under /showcase', { timeout: 30_000 }, async () => {
    const house = await service.getShowcase()
    const all = await service.getProducts({ status: 'published' })
    if (!house.ok || !all.ok) throw new Error('demo data')
    const taken = new Set(house.data.products.map((p) => p.slug))
    const business = all.data.find((p) => !taken.has(p.slug)) // a published piece of a real business
    if (!business) throw new Error('need a business-only piece')
    open(`/showcase/${business.slug}`)
    expect(await screen.findByRole('heading', { name: 'Page not found' }, { timeout: 8000 })).toBeInTheDocument()
  })

  it('redirects the old /products/sanctus-showcase/<slug> link to /showcase/<slug>', { timeout: 30_000 }, async () => {
    const { first } = await housePieces()
    open(`/products/sanctus-showcase/${first.slug}`)
    expect(await screen.findByRole('heading', { level: 1, name: first.name.en }, { timeout: 8000 })).toBeInTheDocument()
    expect(window.location.pathname).toBe(`/showcase/${first.slug}`)
  })
})
