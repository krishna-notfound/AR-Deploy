import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { type LandingCollection, emptySiteContent } from '@/domain/siteContent'
import { content, service } from '@/services'

const open = (path: string) => {
  window.history.replaceState(null, '', path)
  return render(<App />)
}

let seq = 0
const card = (over: Partial<LandingCollection>): LandingCollection => ({ id: crypto.randomUUID(), slug: `card-${++seq}`, products: [], title: { en: 'X' }, image: 'lamp-vase', link: { kind: 'collection' }, ...over })

/** Publishes `cards` through the demo service, as the Editor does. */
async function publishCards(cards: LandingCollection[]) {
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  const s = await content.getContentDraft()
  if (!s.ok) throw new Error('draft')
  const saved = await content.saveContentDraft({ ...emptySiteContent(), landing: { collections: cards } }, s.data.draftUpdatedAt)
  if (!saved.ok) throw new Error('save')
  const p = await content.publishContent(saved.data.draftUpdatedAt)
  if (!p.ok) throw new Error(JSON.stringify(p.error))
  localStorage.clear() // the visitor is not signed in
}

/** Published products of active businesses, with the business, from the demo data. */
async function livePieces() {
  const [products, businesses] = await Promise.all([service.getProducts({ status: 'published' }), service.getBusinesses()])
  if (!products.ok || !businesses.ok) throw new Error('demo data')
  const active = new Map(businesses.data.filter((b) => b.status === 'active').map((b) => [b.id, b]))
  return products.data.filter((p) => active.has(p.businessId)).map((product) => ({ product, business: active.get(product.businessId)! }))
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

describe('CollectionPage', () => {
  it('shows a published collection: title, text, and its pieces in the chosen order, each one a link to the product page', { timeout: 30_000 }, async () => {
    const pieces = await livePieces()
    const [a, b] = pieces
    if (!a || !b) throw new Error('need two published products')
    await publishCards([
      card({
        slug: 'my-picks',
        title: { en: 'My picks', pt: 'As minhas escolhas' },
        text: { en: 'Chosen by hand.', pt: 'Escolhidas à mão.' },
        // b before a; and one piece that does not exist is skipped.
        products: [
          { businessSlug: b.business.slug, productSlug: b.product.slug },
          { businessSlug: 'nobody', productSlug: 'ghost' },
          { businessSlug: a.business.slug, productSlug: a.product.slug },
        ],
      }),
    ])
    open('/collections/my-picks')
    expect(await screen.findByRole('heading', { level: 1, name: 'My picks' })).toBeInTheDocument()
    expect(screen.getByText('Chosen by hand.')).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Pieces in My picks' })
    const links = within(list).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual([`/products/${b.business.slug}/${b.product.slug}`, `/products/${a.business.slug}/${a.product.slug}`])
    expect(links[0]).toHaveTextContent(b.business.name)
  })

  it('does not show a piece that is no longer published', { timeout: 30_000 }, async () => {
    const [a] = await livePieces()
    if (!a) throw new Error('need a published product')
    await publishCards([card({ slug: 'one', title: { en: 'One' }, products: [{ businessSlug: a.business.slug, productSlug: a.product.slug }] })])
    const unpublished = await service.unpublishProduct(a.product.id)
    if (!unpublished.ok) throw new Error(JSON.stringify(unpublished.error))
    open('/collections/one')
    expect(await screen.findByRole('heading', { level: 1, name: 'One' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Pieces coming soon' })).toBeInTheDocument()
  })

  it('shows the Portuguese title when the visitor reads Portuguese', { timeout: 30_000 }, async () => {
    await publishCards([card({ slug: 'duo', title: { en: 'Duo', pt: 'Dupla' } })])
    window.localStorage.setItem('arfurn:lang', 'pt')
    open('/collections/duo?lang=pt')
    expect(await screen.findByRole('heading', { level: 1, name: 'Dupla' })).toBeInTheDocument()
  })

  it('a collection with no pieces says "Pieces coming soon" and offers the application', { timeout: 30_000 }, async () => {
    await publishCards([card({ slug: 'empty', title: { en: 'Empty one' }, products: [] })])
    open('/collections/empty')
    expect(await screen.findByRole('heading', { level: 1, name: 'Empty one' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Pieces coming soon' })).toBeInTheDocument()
    const apply = screen.getAllByRole('link', { name: 'Apply as a business' }).find((l) => l.getAttribute('href') === '/apply')
    expect(apply).toBeDefined()
  })

  it('before anything is published, the built-in collections have a page: the published pieces of that category', { timeout: 30_000 }, async () => {
    const sofas = (await livePieces()).filter((x) => x.product.category === 'sofa')
    open('/collections/sofas')
    expect(await screen.findByRole('heading', { level: 1, name: 'Sofas' })).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Pieces in Sofas' })
    const hrefs = within(list).getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(hrefs.sort()).toEqual(sofas.map((x) => `/products/${x.business.slug}/${x.product.slug}`).sort())
    expect(hrefs.length).toBeGreaterThan(0)
  })

  it('an unknown address is the not-found page', { timeout: 30_000 }, async () => {
    open('/collections/nope')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('once collections are published, a built-in address that is not one of them is not found', { timeout: 30_000 }, async () => {
    await publishCards([card({ slug: 'mine', title: { en: 'Mine' } })])
    open('/collections/sofas')
    await waitFor(() => expect(screen.queryByRole('heading', { level: 1, name: 'Sofas' })).toBeNull())
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('a hidden collection has no page', { timeout: 30_000 }, async () => {
    await publishCards([card({ slug: 'secret', title: { en: 'Secret' }, hidden: true })])
    open('/collections/secret')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Secret' })).toBeNull()
  })
})
