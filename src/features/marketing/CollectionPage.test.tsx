import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { HOUSE_BUSINESS_SLUG, type LandingCollection, emptySiteContent } from '@/domain/siteContent'
import { content, service } from '@/services'

const open = (path: string) => {
  window.history.replaceState(null, '', path)
  return render(<App />)
}

let seq = 0
const card = (over: Partial<LandingCollection>): LandingCollection => ({ id: crypto.randomUUID(), slug: `card-${++seq}`, products: [], title: { en: 'X' }, image: 'lamp-vase', link: { kind: 'collection' }, ...over })
const ref = (slug: string) => ({ businessSlug: HOUSE_BUSINESS_SLUG, productSlug: slug })

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

/** The admin's published showcase pieces from the demo data, newest first (the page's own order). */
async function housePieces() {
  const r = await service.getShowcase()
  if (!r.ok) throw new Error('demo data')
  return r.data.products.filter((p) => p.status === 'published').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.en.localeCompare(b.name.en))
}

/** A published product of a real business, to prove it never shows up. */
async function businessProduct() {
  const [products, businesses] = await Promise.all([service.getProducts({ status: 'published' }), service.getBusinesses()])
  if (!products.ok || !businesses.ok) throw new Error('demo data')
  const product = products.data[0]!
  return { product, business: businesses.data.find((b) => b.id === product.businessId)!, all: products.data }
}

async function unpublish(ids: string[]) {
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  for (const id of ids) {
    const r = await service.unpublishProduct(id)
    if (!r.ok) throw new Error(JSON.stringify(r.error))
  }
  localStorage.clear()
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
  it('shows a published collection: title, text, and its showcase pieces in the chosen order, each one a link to /showcase/<slug>', { timeout: 30_000 }, async () => {
    const [a, b] = await housePieces()
    if (!a || !b) throw new Error('need two showcase pieces')
    const { business } = await businessProduct()
    await publishCards([
      card({
        slug: 'my-picks',
        title: { en: 'My picks', pt: 'As minhas escolhas' },
        text: { en: 'Chosen by hand.', pt: 'Escolhidas à mão.' },
        // b before a; a missing piece and a piece "of a business" (the right slug, the wrong catalogue) are skipped.
        products: [ref(b.slug), ref('ghost'), { businessSlug: business.slug, productSlug: a.slug }, ref(a.slug)],
      }),
    ])
    open('/collections/my-picks')
    expect(await screen.findByRole('heading', { level: 1, name: 'My picks' })).toBeInTheDocument()
    expect(screen.getByText('Chosen by hand.')).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Pieces in My picks' })
    const links = within(list).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual([`/showcase/${b.slug}`, `/showcase/${a.slug}`])
    // Name and price; the "3D · AR" chip when the piece has a model; never a business name.
    expect(links[0]).toHaveTextContent(b.name.en)
    expect(links[0]).toHaveTextContent(/€/)
    expect(links[0]).toHaveTextContent('3D · AR')
    expect(links[0]).not.toHaveTextContent(business.name)
  })

  it('never shows a business product, even when a card points at one', { timeout: 30_000 }, async () => {
    const { business, all } = await businessProduct()
    const pieces = await housePieces()
    // The demo's showcase pieces are copies of business pieces with the same slug: use a business piece the house lacks.
    const only = all.find((p) => !pieces.some((h) => h.slug === p.slug))
    if (!only) throw new Error('need a business piece the showcase does not have')
    await publishCards([card({ slug: 'bleed', title: { en: 'Bleed' }, products: [{ businessSlug: business.slug, productSlug: only.slug }, ref(only.slug)] })])
    open('/collections/bleed')
    expect(await screen.findByRole('heading', { level: 1, name: 'Bleed' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Pieces coming soon' })).toBeInTheDocument()
    expect(screen.queryAllByRole('link').filter((l) => l.getAttribute('href')?.startsWith('/products/'))).toHaveLength(0)
  })

  it('does not show a piece that is no longer published', { timeout: 30_000 }, async () => {
    const [a] = await housePieces()
    if (!a) throw new Error('need a showcase piece')
    await publishCards([card({ slug: 'one', title: { en: 'One' }, products: [ref(a.slug)] })])
    await unpublish([a.id])
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

  it('a collection with no pieces says "Pieces coming soon", links no business, and ends with the one apply banner', { timeout: 30_000 }, async () => {
    await publishCards([card({ slug: 'empty', title: { en: 'Empty one' }, products: [] })])
    open('/collections/empty')
    expect(await screen.findByRole('heading', { level: 1, name: 'Empty one' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Pieces coming soon' })).toBeInTheDocument()
    const main = screen.getByRole('main')
    expect(within(main).queryAllByRole('link').filter((l) => /^\/(products|catalog)\//.test(l.getAttribute('href') ?? ''))).toHaveLength(0)
    const banner = within(main).getByRole('region', { name: 'This is how your customers will see your pieces.' })
    expect(within(banner).getByRole('link', { name: 'Apply as a business' })).toHaveAttribute('href', '/apply')
    // It is the only apply link in the page body (the header has its own).
    expect(within(main).getAllByRole('link', { name: 'Apply as a business' })).toHaveLength(1)
  })

  it('before anything is published, a built-in collection lists the showcase pieces of that category', { timeout: 30_000 }, async () => {
    const pieces = await housePieces()
    const category = pieces[0]!.category
    const key = ({ sofa: 'sofas', table: 'tables', chair: 'armchairs', decor: 'decor' } as Record<string, string>)[category]
    if (!key) throw new Error(`no built-in collection for ${category}`)
    const expected = pieces.filter((p) => p.category === category).map((p) => `/showcase/${p.slug}`)
    open(`/collections/${key}`)
    const list = await screen.findByRole('list', { name: /^Pieces in / })
    const hrefs = within(list).getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(hrefs).toEqual(expected)
    expect(hrefs.length).toBeGreaterThan(0)
  })

  it('a built-in collection whose category has no showcase piece is calm and empty', { timeout: 30_000 }, async () => {
    await unpublish((await housePieces()).filter((p) => p.category === 'decor').map((p) => p.id))
    open('/collections/decor')
    expect(await screen.findByRole('heading', { level: 1, name: 'Decor' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Pieces coming soon' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: /^Pieces in / })).toBeNull()
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
