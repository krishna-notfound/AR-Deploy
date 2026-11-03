import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import type { LandingCollection } from '@/domain/siteContent'
import { emptySiteContent } from '@/domain/siteContent'
import { content, service } from '@/services'
import { type Targets, hrefOf } from './LandingCollections'

const openLanding = () => {
  window.history.replaceState(null, '', '/')
  return render(<App />)
}

/** Publishes `cards` through the demo service, as the Editor does. */
async function publishCards(cards: LandingCollection[]) {
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  const s = await content.getContentDraft()
  if (!s.ok) throw new Error('draft')
  const doc = { ...emptySiteContent(), landing: { collections: cards } }
  const saved = await content.saveContentDraft(doc, s.data.draftUpdatedAt)
  if (!saved.ok) throw new Error('save')
  const p = await content.publishContent(saved.data.draftUpdatedAt)
  if (!p.ok) throw new Error(JSON.stringify(p.error))
  localStorage.clear() // the visitor is not signed in
}

const section = async () => within(await screen.findByRole('region', { name: /Shapes that|Formas que/ }))

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

describe('LandingCollections: nothing published', () => {
  it('shows the four built-in cards, each one link to its own collection page, with no "01 // COLLECTION" label', { timeout: 30_000 }, async () => {
    openLanding()
    const s = await section()
    const cards = await s.findAllByRole('link', { name: /Sofas|Tables|Armchairs|Decor/ })
    expect(cards.map((c) => c.querySelector('h3')?.textContent)).toEqual(['Sofas', 'Tables', 'Armchairs', 'Decor'])
    expect(cards.map((c) => c.getAttribute('href'))).toEqual(['/collections/sofas', '/collections/tables', '/collections/armchairs', '/collections/decor'])
    for (const card of cards) {
      // The whole card is the link: the photo and the title are inside it.
      expect(card.querySelector('img')).not.toBeNull()
    }
    expect(screen.queryByText(/\/\/ Collection/i)).toBeNull()
    // Never a business catalogue.
    expect(cards.some((c) => c.getAttribute('href')?.startsWith('/catalog'))).toBe(false)
  })
})

describe('LandingCollections: published cards', () => {
  let cardSeq = 0
  const card = (over: Partial<LandingCollection>): LandingCollection => ({ id: crypto.randomUUID(), slug: `card-${++cardSeq}`, products: [], title: { en: 'X' }, image: 'lamp-vase', link: { kind: 'none' }, ...over })

  it('shows the published cards instead of the built-in ones, skips hidden ones, and links each by its kind', { timeout: 30_000 }, async () => {
    const published = await service.getProducts({ status: 'published' })
    const catalogs = await service.getCatalogs()
    if (!published.ok || !catalogs.ok) throw new Error('demo data')
    const active = catalogs.data.filter((c) => c.business.status === 'active').map((c) => c.business)
    const product = published.data.find((p) => active.some((b) => b.id === p.businessId))!
    const business = active.find((b) => b.id === product.businessId)!
    await publishCards([
      card({ title: { en: 'See a chair in 3D', pt: 'Veja uma cadeira em 3D' }, text: { en: 'Open it in AR', pt: 'Abra em RA' }, image: 'ar-phone', link: { kind: 'product', businessSlug: business.slug, productSlug: product.slug } }),
      card({ title: { en: 'Browse a catalogue' }, link: { kind: 'catalog', businessSlug: business.slug, category: product.category } }),
      card({ title: { en: 'Sell with Sanctus' }, image: 'showroom-qr', link: { kind: 'apply' } }),
      card({ title: { en: 'Just a picture' }, link: { kind: 'none' } }),
      card({ title: { en: 'Not shown' }, hidden: true, link: { kind: 'apply' } }),
      card({ title: { en: 'Own page' }, slug: 'own-page', link: { kind: 'collection' } }),
    ])
    openLanding()
    const s = await section()
    await s.findByRole('heading', { name: 'See a chair in 3D' })
    expect(s.queryByRole('heading', { name: 'Sofas' })).toBeNull() // the built-in four are replaced
    expect(s.queryByText('Not shown')).toBeNull()

    const productCard = s.getByRole('link', { name: /See a chair in 3D/ })
    expect(productCard).toHaveAttribute('href', `/products/${business.slug}/${product.slug}`)
    expect(productCard).toHaveTextContent('Open it in AR') // the text is part of the same link
    expect(s.getByRole('link', { name: /Browse a catalogue/ })).toHaveAttribute('href', `/catalog/${business.slug}?category=${product.category}`)
    expect(s.getByRole('link', { name: /Sell with Sanctus/ })).toHaveAttribute('href', '/apply')
    expect(s.getByRole('link', { name: /Own page/ })).toHaveAttribute('href', '/collections/own-page')
    // "No link" is not a link at all.
    expect(s.queryByRole('link', { name: /Just a picture/ })).toBeNull()
    expect(s.getByRole('heading', { name: 'Just a picture' })).toBeInTheDocument()
    // One link per card: the photo is inside it (decorative, the title names the card), not a second link.
    expect(productCard.querySelector('img')).toHaveAttribute('src', '/images/sanctus/v2/ar-phone.webp')
    expect(within(productCard).queryAllByRole('link')).toHaveLength(0)
  })

  it('shows Portuguese when it exists and the English text otherwise', { timeout: 30_000 }, async () => {
    await publishCards([
      card({ title: { en: 'English only' }, text: { en: 'Only in English' }, link: { kind: 'apply' } }),
      card({ title: { en: 'Both', pt: 'Os dois' }, text: { en: 'Text', pt: 'Texto' }, link: { kind: 'apply' } }),
    ])
    openLanding()
    const s = await section()
    await s.findByRole('heading', { name: 'English only' })
    await userEvent.click(screen.getAllByRole('radio', { name: 'PT' })[0]!)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Os dois' })).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'English only' })).toBeInTheDocument() // fallback to English
    expect(screen.getByText('Only in English')).toBeInTheDocument()
    expect(screen.getByText('Texto')).toBeInTheDocument()
  })

  it('when every published card is hidden, the section keeps its heading and shows no cards', { timeout: 30_000 }, async () => {
    await publishCards([card({ title: { en: 'Hidden one' }, hidden: true })])
    openLanding()
    const s = await section()
    await waitFor(() => expect(s.queryByRole('heading', { name: 'Sofas' })).toBeNull())
    expect(s.queryByRole('heading', { level: 3 })).toBeNull()
  })
})

describe('Editor preview', () => {
  it('shows the saved draft cards on the landing page without publishing them', { timeout: 30_000 }, async () => {
    localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
    const s = await content.getContentDraft()
    if (!s.ok) throw new Error('draft')
    const draft = { ...emptySiteContent(), landing: { collections: [{ id: 'd1', title: { en: 'Only in the draft' }, image: 'hero-living', link: { kind: 'apply' } } as LandingCollection] } }
    await content.saveContentDraft(draft, s.data.draftUpdatedAt)
    window.history.replaceState(null, '', '/admin/editor/preview/landing')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Only in the draft' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Only in the draft/ })).toHaveAttribute('href', '/apply')
    expect(screen.queryByRole('heading', { name: 'Sofas' })).toBeNull()
    // Nothing is public.
    const chrome = await content.getPublishedChrome()
    expect(chrome.ok && chrome.data.landingCollections).toEqual([])
  })
})

describe('hrefOf', () => {
  const targets = (over: Partial<Targets> = {}): Targets => ({ settled: true, businesses: new Set(['acme']), products: new Set(['acme/chair']), ...over })

  it('builds the address of each link kind, only through the URL helpers', () => {
    expect(hrefOf({ kind: 'apply' }, targets())).toBe('/apply')
    expect(hrefOf({ kind: 'collection' }, targets(), 'sofas')).toBe('/collections/sofas')
    expect(hrefOf({ kind: 'collection' }, targets())).toBeUndefined()
    expect(hrefOf({ kind: 'none' }, targets())).toBeUndefined()
    expect(hrefOf({ kind: 'product', businessSlug: 'acme', productSlug: 'chair' }, targets())).toBe('/products/acme/chair')
    expect(hrefOf({ kind: 'catalog', businessSlug: 'acme' }, targets())).toBe('/catalog/acme')
    expect(hrefOf({ kind: 'catalog', businessSlug: 'acme', category: 'sofa' }, targets())).toBe('/catalog/acme?category=sofa')
  })

  it('drops a link to a product or business that is gone once the lists have loaded, and trusts it before', () => {
    expect(hrefOf({ kind: 'product', businessSlug: 'acme', productSlug: 'gone' }, targets())).toBeUndefined()
    expect(hrefOf({ kind: 'catalog', businessSlug: 'gone' }, targets())).toBeUndefined()
    expect(hrefOf({ kind: 'product', businessSlug: 'acme', productSlug: 'gone' }, targets({ settled: false }))).toBe('/products/acme/gone')
    expect(hrefOf({ kind: 'catalog', businessSlug: 'gone' }, targets({ settled: false }))).toBe('/catalog/gone')
  })
})
