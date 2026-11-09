// Client requests round 2, W3 (ADR-0054): no prices on public pages, the one shared product card, the company description
// kept off the catalogue header, and the Share button switch. Whole-app renders in demo mode.
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import type { Product } from '@/domain/types'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { ProductCard } from './ProductCard'

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

/** A currency symbol or code, or a formatted amount: what a price looks like in any of the demo currencies. */
const PRICE = /[€$£]|\b(EUR|USD|BRL)\b|\d[\d.,]*[.,]\d{2}\b/

async function product(slug: string): Promise<Product> {
  const r = await service.getPublicProduct('nordhaus', slug)
  if (!r.ok) throw new Error('seed')
  return r.data.product
}

describe('no prices on public pages', () => {
  it('the catalogue cards show no price', async () => {
    openApp('/catalog/nordhaus')
    await screen.findByText(/^\d+ products$/)
    expect(document.body.textContent).not.toMatch(PRICE)
  })

  it('the product page shows no price, and the finish picker no price difference', async () => {
    const chair = await product('sheen-lounge-chair')
    expect(chair.variants.length).toBeGreaterThan(0)
    openApp('/products/nordhaus/sheen-lounge-chair')
    await screen.findByRole('heading', { level: 1 })
    await screen.findAllByRole('radiogroup')
    expect(document.body.textContent).not.toMatch(PRICE)
    for (const swatch of screen.getAllByRole('radio')) expect(swatch.getAttribute('aria-label') ?? '').not.toMatch(/\+/)
  })

  it('the embedded product page shows no price', async () => {
    openApp('/embed/products/nordhaus/sheen-lounge-chair')
    await screen.findByRole('heading', { level: 1 })
    expect(document.body.textContent).not.toMatch(PRICE)
  })

  it('the showcase piece page and its other pieces show no price', async () => {
    const house = await service.getShowcase()
    if (!house.ok) throw new Error('seed')
    openApp(`/showcase/${house.data.products[0]!.slug}`)
    await screen.findByRole('heading', { level: 1 })
    await screen.findByRole('list', { name: 'More pieces from the showcase' })
    expect(document.body.textContent).not.toMatch(PRICE)
  })

  it('the dashboards still show prices', async () => {
    localStorage.setItem('arfurn:account', JSON.stringify({ role: 'business_admin', businessId: 'biz_nord' }))
    openApp('/dashboard/products')
    const table = await screen.findByRole('table')
    expect(await within(table).findAllByText(/[€$]|R\$|\d,\d{3}\.\d{2}/)).not.toHaveLength(0)
  })
})

describe('the shared product card', () => {
  it('is the same card on the catalogue and in the showcase "More pieces": category, serif name, 3D chip, contained 4:5 photo, focus ring', async () => {
    openApp('/catalog/nordhaus')
    await screen.findByText(/^\d+ products$/)
    const cards = Array.from(document.querySelectorAll<HTMLElement>('ul.grid > li > a'))
    expect(cards.length).toBeGreaterThan(1)
    const card = cards.find((a) => a.textContent?.includes('3D · AR')) as HTMLElement
    expect(card).toBeTruthy()
    expect(card.className).toContain('focus-visible:outline-2')
    const img = card.querySelector('img') as HTMLImageElement
    expect(img.className).toContain('object-contain')
    expect(img.className).toContain('aspect-[4/5]')
    expect(img.className).not.toContain('object-cover')
    expect(within(card).getByRole('heading', { level: 2 }).className).toContain('font-display')
    expect(card).toHaveTextContent(/View piece/)
    expect(card.querySelector('p')?.textContent).not.toBe('')
    // Two columns on a phone.
    expect(card.closest('ul')?.className).toContain('grid-cols-2')
  })

  it('shows the 3D · AR chip only for a piece that has a model', async () => {
    const withModel = await product('sheen-lounge-chair')
    expect(withModel.models.glb).toBeDefined()
    const photoOnly: Product = { ...withModel, id: 'x', slug: 'x', name: { en: 'Photo only' }, models: {}, variants: [] }
    render(
      <MemoryRouter>
        <LanguageProvider>
          <ProductCard product={withModel} href="/a" />
          <ProductCard product={photoOnly} href="/b" headingLevel="h3" />
        </LanguageProvider>
      </MemoryRouter>,
    )
    const [a, b] = screen.getAllByRole('link')
    expect(a).toHaveTextContent('3D · AR')
    expect(b).not.toHaveTextContent('3D')
    expect(within(b!).getByRole('heading', { level: 3, name: 'Photo only' })).toBeInTheDocument()
  })
})

describe('the company description is internal', () => {
  it('is not shown in the public catalogue header, while the service keeps it for the dashboards', async () => {
    const dash = await service.getBusinessById('biz_nord')
    if (!dash.ok) throw new Error('seed')
    expect(dash.data.description.length).toBeGreaterThan(10)
    const pub = await service.getBusinessBySlug('nordhaus')
    expect(pub.ok && pub.data.description).toBe('')
    openApp('/catalog/nordhaus')
    await screen.findByText(/^\d+ products$/)
    expect(document.body.textContent).not.toContain(dash.data.description)
  })
})

describe('the Share button switch', () => {
  it('shows Share by default and hides it on that company\'s product pages when the platform turns it off', async () => {
    const { unmount } = openApp('/products/nordhaus/sheen-lounge-chair')
    await screen.findByRole('heading', { level: 1 })
    expect(await screen.findByRole('button', { name: 'Share' })).toBeInTheDocument()
    unmount()

    expect((await service.setBusinessShareEnabled('biz_nord', false)).ok).toBe(true)
    openApp('/products/nordhaus/sheen-lounge-chair')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
    // Other companies keep theirs.
    expect((await service.getBusinessById('biz_casa')).ok && (await service.getBusinessById('biz_casa'))).toMatchObject({ data: { shareEnabled: true } })
  })
})
