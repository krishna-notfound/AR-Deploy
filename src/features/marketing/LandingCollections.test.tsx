import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import type { LandingCollection } from '@/domain/siteContent'
import { emptySiteContent } from '@/domain/siteContent'
import { content, service } from '@/services'
import { hrefOf } from './LandingCollections'

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

  it('shows the published cards instead of the built-in ones, skips hidden ones, and opens every card at its own collection page', { timeout: 30_000 }, async () => {
    await publishCards([
      card({ title: { en: 'See a chair in 3D', pt: 'Veja uma cadeira em 3D' }, text: { en: 'Open it in AR', pt: 'Abra em RA' }, slug: 'chairs', image: 'ar-phone', link: { kind: 'collection' } }),
      // Old link kinds are ignored for routing: the card opens its collection page all the same.
      card({ title: { en: 'Browse a catalogue' }, slug: 'browse', link: { kind: 'catalog', businessSlug: 'acme', category: 'sofa' } }),
      card({ title: { en: 'Sell with Sanctus' }, slug: 'sell', image: 'showroom-qr', link: { kind: 'apply' } }),
      card({ title: { en: 'A business piece' }, slug: 'biz', link: { kind: 'product', businessSlug: 'acme', productSlug: 'chair' } }),
      card({ title: { en: 'Just a picture' }, slug: 'plain', link: { kind: 'none' } }),
      card({ title: { en: 'Not shown' }, hidden: true, link: { kind: 'apply' } }),
    ])
    openLanding()
    const s = await section()
    await s.findByRole('heading', { name: 'See a chair in 3D' })
    expect(s.queryByRole('heading', { name: 'Sofas' })).toBeNull() // the built-in four are replaced
    expect(s.queryByText('Not shown')).toBeNull()

    const first = s.getByRole('link', { name: /See a chair in 3D/ })
    expect(first).toHaveAttribute('href', '/collections/chairs')
    expect(first).toHaveTextContent('Open it in AR') // the text is part of the same link
    expect(s.getByRole('link', { name: /Browse a catalogue/ })).toHaveAttribute('href', '/collections/browse')
    expect(s.getByRole('link', { name: /Sell with Sanctus/ })).toHaveAttribute('href', '/collections/sell')
    expect(s.getByRole('link', { name: /A business piece/ })).toHaveAttribute('href', '/collections/biz')
    // "No link" and "no slug" are not links at all.
    expect(s.queryByRole('link', { name: /Just a picture/ })).toBeNull()
    expect(s.getByRole('heading', { name: 'Just a picture' })).toBeInTheDocument()
    // Never a business catalogue or product page.
    expect(s.getAllByRole('link').every((l) => l.getAttribute('href')?.startsWith('/collections/'))).toBe(true)
    // One link per card: the photo is inside it (decorative, the title names the card), not a second link.
    expect(first.querySelector('img')).toHaveAttribute('src', '/images/sanctus/v2/ar-phone.webp')
    expect(within(first).queryAllByRole('link')).toHaveLength(0)
  })

  it('uses the 4:5 collection frame: an uploaded picture shows whole in it, a built-in photo keeps filling it', { timeout: 30_000 }, async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:card/1') })
    localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
    const up = await content.uploadSiteAsset(new File([new Uint8Array(8)], 'card.png', { type: 'image/png' }), 'image')
    if (!up.ok) throw new Error('upload')
    await publishCards([
      card({ title: { en: 'Mine' }, slug: 'mine', image: { path: up.data.path, originalPath: up.data.path, crop: { x: 0, y: 0, width: 400, height: 500 } }, link: { kind: 'collection' } }),
      card({ title: { en: 'Built in' }, slug: 'built', image: 'lamp-vase', link: { kind: 'collection' } }),
    ])
    openLanding()
    const s = await section()
    await s.findByRole('heading', { name: 'Mine' })
    const mine = s.getByRole('link', { name: /Mine/ }).querySelector('img')!
    expect(mine).toHaveAttribute('src', 'blob:card/1')
    expect(mine.className).toMatch(/aspect-\[4\/5\]/)
    expect(mine.className).toMatch(/object-contain/)
    const built = s.getByRole('link', { name: /Built in/ }).querySelector('img')!
    expect(built.className).toMatch(/aspect-\[4\/5\]/)
    expect(built.className).toMatch(/object-cover/)
  })
  it('shows Portuguese when it exists and the English text otherwise', { timeout: 30_000 }, async () => {
    await publishCards([
      card({ title: { en: 'English only' }, text: { en: 'Only in English' }, link: { kind: 'collection' } }),
      card({ title: { en: 'Both', pt: 'Os dois' }, text: { en: 'Text', pt: 'Texto' }, link: { kind: 'collection' } }),
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
    const draft = { ...emptySiteContent(), landing: { collections: [{ id: 'd1', slug: 'd1', title: { en: 'Only in the draft' }, image: 'hero-living', link: { kind: 'collection' } } as LandingCollection] } }
    await content.saveContentDraft(draft, s.data.draftUpdatedAt)
    window.history.replaceState(null, '', '/admin/editor/preview/landing')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Only in the draft' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Only in the draft/ })).toHaveAttribute('href', '/collections/d1')
    expect(screen.queryByRole('heading', { name: 'Sofas' })).toBeNull()
    // Nothing is public.
    const chrome = await content.getPublishedChrome()
    expect(chrome.ok && chrome.data.landingCollections).toEqual([])
  })
})

describe('hrefOf', () => {
  it('is the collection page of the card, whatever the old link kind says, and nothing for "none" or an empty slug', () => {
    expect(hrefOf({ kind: 'collection' }, 'sofas')).toBe('/collections/sofas')
    expect(hrefOf({ kind: 'apply' }, 'sofas')).toBe('/collections/sofas')
    expect(hrefOf({ kind: 'catalog', businessSlug: 'acme', category: 'sofa' }, 'sofas')).toBe('/collections/sofas')
    expect(hrefOf({ kind: 'product', businessSlug: 'acme', productSlug: 'chair' }, 'sofas')).toBe('/collections/sofas')
    expect(hrefOf({ kind: 'none' }, 'sofas')).toBeUndefined()
    expect(hrefOf({ kind: 'collection' })).toBeUndefined()
    expect(hrefOf({ kind: 'collection' }, '')).toBeUndefined()
  })
})
