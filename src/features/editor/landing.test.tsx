import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { HOUSE_BUSINESS_SLUG, emptySiteContent } from '@/domain/siteContent'
import { content } from '@/services'
import { mockCatalogService } from '@/services/mock/mockCatalogService'
import {
  addCollection,
  addCollectionProduct,
  canAddCollection,
  canAddProduct,
  clearShowcase,
  emptyLink,
  houseRef,
  moveCollection,
  moveCollectionProduct,
  newCollection,
  removeCollection,
  removeCollectionProduct,
  setCollectionHidden,
  setCollectionTitleEn,
  setExample,
  setFeatured,
  setHeroAlt,
  setHeroImage,
  setHeroModel,
  toggleCollectionProduct,
  uniqueCollectionSlug,
  updateCollection,
  withLang,
} from './landingOps'

const open = () => {
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  window.history.replaceState(null, '', '/admin/editor/landing')
  return render(<App />)
}

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  await mockCatalogService.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('landingOps (pure edits)', () => {
  it('adds up to eight, moves within the list, hides, updates and removes', () => {
    let doc = emptySiteContent()
    const ids = Array.from({ length: 9 }, (_, i) => `c${i}`)
    for (const id of ids) doc = addCollection(doc, newCollection(id))
    expect(doc.landing.collections.map((c) => c.id)).toEqual(ids.slice(0, 8))
    expect(canAddCollection(doc)).toBe(false)
    expect(moveCollection(doc, 'c0', -1)).toBe(doc) // the first cannot go up
    expect(moveCollection(doc, 'c7', 1)).toBe(doc) // the last cannot go down
    expect(moveCollection(doc, 'c1', -1).landing.collections.map((c) => c.id).slice(0, 2)).toEqual(['c1', 'c0'])
    expect(setCollectionHidden(doc, 'c2', true).landing.collections[2]!.hidden).toBe(true)
    expect('hidden' in setCollectionHidden(setCollectionHidden(doc, 'c2', true), 'c2', false).landing.collections[2]!).toBe(false)
    expect(updateCollection(doc, 'c3', (c) => ({ ...c, title: { en: 'X' } })).landing.collections[3]!.title.en).toBe('X')
    expect(removeCollection(doc, 'c4').landing.collections).toHaveLength(7)
    expect(emptyLink('catalog')).toEqual({ kind: 'catalog', businessSlug: '' })
    expect(emptyLink('collection')).toEqual({ kind: 'collection' })
    expect(newCollection('n')).toMatchObject({ slug: '', link: { kind: 'collection' }, products: [] })
    expect(withLang({ en: 'A', pt: 'B' }, 'pt', '  ')).toEqual({ en: 'A' }) // a blank Portuguese falls back to the English
    expect(withLang({ en: 'A' }, 'pt', 'B')).toEqual({ en: 'A', pt: 'B' })
  })
})

describe('landingOps: slug, products, featured', () => {
  const r = (n: number) => ({ businessSlug: 'acme', productSlug: `p${n}` })

  it('the slug follows the English title until it is edited, and stays unique among the collections', () => {
    let doc = addCollection(addCollection(emptySiteContent(), newCollection('a')), newCollection('b'))
    doc = setCollectionTitleEn(doc, 'a', 'Sofás Glam')
    expect(doc.landing.collections[0]).toMatchObject({ slug: 'sofas-glam', title: { en: 'Sofás Glam' } })
    doc = setCollectionTitleEn(doc, 'b', 'Sofas Glam')
    expect(doc.landing.collections[1]!.slug).toBe('sofas-glam-2')
    doc = updateCollection(doc, 'a', (c) => ({ ...c, slug: 'mine' })) // edited by hand: the title no longer changes it
    expect(setCollectionTitleEn(doc, 'a', 'Other').landing.collections[0]!.slug).toBe('mine')
    expect(uniqueCollectionSlug(doc, 'x', '!!!')).toBe('')
  })

  it('adds products once, up to 24, moves and removes them', () => {
    let doc = addCollection(emptySiteContent(), newCollection('a'))
    for (let i = 0; i < 30; i++) doc = addCollectionProduct(doc, 'a', r(i))
    expect(doc.landing.collections[0]!.products).toHaveLength(24)
    expect(canAddProduct(doc.landing.collections[0]!)).toBe(false)
    expect(addCollectionProduct(doc, 'a', r(0)).landing.collections[0]!.products).toHaveLength(24) // not twice
    expect(moveCollectionProduct(doc, 'a', r(0), -1).landing.collections[0]!.products).toEqual(doc.landing.collections[0]!.products) // the first cannot go up
    expect(moveCollectionProduct(doc, 'a', r(1), -1).landing.collections[0]!.products.slice(0, 2)).toEqual([r(1), r(0)])
    expect(removeCollectionProduct(doc, 'a', r(5)).landing.collections[0]!.products).toHaveLength(23)
  })

  it('sets and clears the featured piece without touching the collections', () => {
    const doc = addCollection(emptySiteContent(), newCollection('a'))
    const set = setFeatured(doc, r(1))
    expect(set.landing).toMatchObject({ featured: r(1) })
    expect(set.landing.collections).toHaveLength(1)
    expect('featured' in setFeatured(set, undefined).landing).toBe(false)
  })
})

describe('landingOps: example, 3D card and ticking pieces (ADR-0047)', () => {
  it('houseRef points at the house business', () => {
    expect(houseRef('linden')).toEqual({ businessSlug: HOUSE_BUSINESS_SLUG, productSlug: 'linden' })
  })

  it('sets and clears the live example without touching anything else', () => {
    const doc = setFeatured(addCollection(emptySiteContent(), newCollection('a')), houseRef('one'))
    const set = setExample(doc, houseRef('two'))
    expect(set.landing).toMatchObject({ example: houseRef('two'), featured: houseRef('one') })
    expect(set.landing.collections).toHaveLength(1)
    expect('example' in setExample(set, undefined).landing).toBe(false)
  })

  it('choosing the 3D card piece also drops the old uploaded 3D card', () => {
    const doc = { ...emptySiteContent(), landing: { collections: [], showcase: { title: { en: 'Old' } } } }
    expect('showcase' in setFeatured(doc, houseRef('one')).landing).toBe(false)
    expect('showcase' in setFeatured(doc, undefined).landing).toBe(false)
    expect('showcase' in clearShowcase(doc).landing).toBe(false)
  })

  it('toggleCollectionProduct adds a piece, removes it on the second tap, and respects the limit', () => {
    let doc = addCollection(emptySiteContent(), newCollection('a'))
    doc = toggleCollectionProduct(doc, 'a', houseRef('one'))
    expect(doc.landing.collections[0]!.products).toEqual([houseRef('one')])
    expect(toggleCollectionProduct(doc, 'a', houseRef('one')).landing.collections[0]!.products).toEqual([])
    for (let i = 0; i < 30; i++) doc = toggleCollectionProduct(doc, 'a', houseRef(`p${i}`))
    expect(doc.landing.collections[0]!.products).toHaveLength(24)
    expect(toggleCollectionProduct(doc, 'missing', houseRef('x'))).toBe(doc)
  })
})

const showcasePieces = async () => {
  const r = await mockCatalogService.getShowcase()
  if (!r.ok) throw new Error('showcase')
  return r.data.products
}
const savedLanding = async () => {
  const s = await content.getContentDraft()
  if (!s.ok) throw new Error('draft')
  return s.data.draft.landing
}

describe('landingOps: hero picture, 3D model and description (ADR-0049)', () => {
  const img = { path: 'landing/11111111-1111-4111-8111-111111111111.png' }
  const glb = { path: 'landing/22222222-2222-4222-8222-222222222222.glb' }

  it('sets and clears the picture and the model, keeping the rest of the hero', () => {
    const doc = setHeroModel(setHeroImage(emptySiteContent(), img), glb)
    expect(doc.landing.hero).toEqual({ image: img, model: { glb } })
    expect(setHeroImage(doc, undefined).landing.hero).toEqual({ model: { glb } })
    expect(setHeroModel(doc, undefined).landing.hero).toEqual({ image: img })
  })

  it('sets the description per language; a blank Portuguese is removed, a blank English with no Portuguese removes it', () => {
    let doc = setHeroAlt(emptySiteContent(), 'en', 'Showroom')
    doc = setHeroAlt(doc, 'pt', 'Loja')
    expect(doc.landing.hero).toEqual({ alt: { en: 'Showroom', pt: 'Loja' } })
    expect(setHeroAlt(doc, 'pt', '  ').landing.hero).toEqual({ alt: { en: 'Showroom' } })
    expect(setHeroAlt(setHeroAlt(doc, 'pt', ''), 'en', '').landing.hero).toBeUndefined()
  })

  it('drops landing.hero entirely when it becomes empty, and leaves the other landing parts alone', () => {
    const base = setFeatured(addCollection(emptySiteContent(), newCollection('a')), houseRef('one'))
    const full = setHeroAlt(setHeroModel(setHeroImage(base, img), glb), 'en', 'Showroom')
    expect(full.landing).toMatchObject({ featured: houseRef('one'), hero: { image: img, model: { glb }, alt: { en: 'Showroom' } } })
    const empty = setHeroAlt(setHeroModel(setHeroImage(full, undefined), undefined), 'en', '')
    expect('hero' in empty.landing).toBe(false)
    expect(empty).toEqual(base)
    expect(setHeroImage(emptySiteContent(), undefined)).toEqual(emptySiteContent())
  })
})

describe('Landing tab: the hero picture block (ADR-0049)', () => {
  it('is the first block; uploads and removes the picture and the model, and sets the description in both languages', { timeout: 60_000 }, async () => {
    let seq = 0
    Object.assign(URL, { createObjectURL: vi.fn(() => `blob:hero/${++seq}`) })
    open()
    const block = await screen.findByRole('region', { name: 'Hero picture' }, { timeout: 15_000 })
    expect(screen.getAllByRole('heading', { level: 3 })[0]).toHaveTextContent('Hero picture')
    // Built-in at first.
    expect(within(block).getByRole('img', { name: 'The hero picture' })).toHaveAttribute('src', '/images/sanctus/v2/hero-living.webp')
    expect(within(block).getByText('No 3D model, so the picture has no 3D button.')).toBeInTheDocument()

    await userEvent.upload(within(block).getByTestId('upload-image'), new File([new Uint8Array(1024)], 'hero.png', { type: 'image/png' }))
    await waitFor(async () => expect((await savedLanding()).hero?.image?.path).toMatch(/^landing\/.+\.png$/), { timeout: 8000 })
    expect(within(block).getByRole('img', { name: 'The hero picture' })).toHaveAttribute('src', 'blob:hero/1')

    await userEvent.upload(within(block).getByTestId('upload-glb'), new File([new Uint8Array(1024)], 'sofa.glb', { type: 'model/gltf-binary' }))
    await waitFor(async () => expect((await savedLanding()).hero?.model?.glb.path).toMatch(/^landing\/.+\.glb$/), { timeout: 8000 })
    expect(within(block).getByText(/^Model file: .+\.glb$/)).toBeInTheDocument()
    expect(within(block).getByRole('button', { name: 'Replace 3D model' })).toBeInTheDocument()

    await userEvent.type(within(block).getByRole('textbox', { name: /Description \(English\)/ }), 'Our showroom')
    await userEvent.type(within(block).getByRole('textbox', { name: /Description \(Portuguese\)/ }), 'A nossa loja')
    await waitFor(async () => expect((await savedLanding()).hero?.alt).toEqual({ en: 'Our showroom', pt: 'A nossa loja' }), { timeout: 8000 })

    await userEvent.click(within(block).getByRole('button', { name: 'Remove: 3D model' }))
    await waitFor(async () => expect((await savedLanding()).hero?.model).toBeUndefined(), { timeout: 8000 })
    await userEvent.click(within(block).getByRole('button', { name: 'Remove: Picture' }))
    await waitFor(async () => expect((await savedLanding()).hero).toEqual({ alt: { en: 'Our showroom', pt: 'A nossa loja' } }), { timeout: 8000 })
    expect(within(block).getByRole('img', { name: 'The hero picture' })).toHaveAttribute('src', '/images/sanctus/v2/hero-living.webp')

    await userEvent.clear(within(block).getByRole('textbox', { name: /Description \(Portuguese\)/ }))
    await userEvent.clear(within(block).getByRole('textbox', { name: /Description \(English\)/ }))
    await waitFor(async () => expect((await savedLanding()).hero).toBeUndefined(), { timeout: 8000 })
  })
})

describe('Landing tab: the three blocks (ADR-0047)', () => {
  it('shows the blocks in page order and offers only the four house pieces, never a business product', { timeout: 40_000 }, async () => {
    const pieces = await showcasePieces()
    expect(pieces).toHaveLength(4)
    open()
    const example = await screen.findByRole('radiogroup', { name: 'See a live example' }, { timeout: 15_000 })
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual(['Hero picture', 'See a live example', '3D card', 'Collections', 'Texts'])
    // Automatic + exactly the house pieces.
    expect(within(example).getAllByRole('radio')).toHaveLength(1 + pieces.length)
    for (const p of pieces) expect(within(example).getByRole('radio', { name: p.name.en })).toBeInTheDocument()
    const businessOnly = await mockCatalogService.getProducts({ status: 'published' })
    if (!businessOnly.ok) throw new Error('products')
    expect(businessOnly.data.every((p) => !pieces.some((h) => h.id === p.id))).toBe(true)
    // The old pickers are gone.
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('heading', { name: '3D showcase' })).toBeNull()
  })

  it('picks the live example and the 3D card from the pieces; "Automatic" clears them; the old uploaded card is dropped', { timeout: 60_000 }, async () => {
    const pieces = await showcasePieces()
    const withModel = pieces.filter((p) => p.models.glb)
    localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
    const s = await content.getContentDraft()
    if (!s.ok) throw new Error('draft')
    await content.saveContentDraft({ ...s.data.draft, landing: { collections: [], showcase: { title: { en: 'Old card' } } } }, s.data.draftUpdatedAt)

    open()
    const example = await screen.findByRole('radiogroup', { name: 'See a live example' }, { timeout: 15_000 })
    await userEvent.click(within(example).getByRole('radio', { name: pieces[1]!.name.en }))
    expect(within(example).getByRole('radio', { name: pieces[1]!.name.en })).toBeChecked()
    await waitFor(async () => expect((await savedLanding()).example).toEqual({ businessSlug: HOUSE_BUSINESS_SLUG, productSlug: pieces[1]!.slug }), { timeout: 8000 })

    const card = screen.getByRole('radiogroup', { name: '3D card' })
    expect(within(card).getAllByRole('radio')).toHaveLength(1 + withModel.length) // only pieces with a 3D model
    await userEvent.click(within(card).getByRole('radio', { name: withModel[0]!.name.en }))
    await waitFor(
      async () => {
        const l = await savedLanding()
        expect(l.featured).toEqual({ businessSlug: HOUSE_BUSINESS_SLUG, productSlug: withModel[0]!.slug })
        expect(l.showcase).toBeUndefined()
      },
      { timeout: 8000 },
    )

    await userEvent.click(within(example).getByRole('radio', { name: 'Automatic' }))
    await waitFor(async () => expect((await savedLanding()).example).toBeUndefined(), { timeout: 8000 })
  })

  it('without showcase pieces each block says where to add the first one', { timeout: 40_000 }, async () => {
    for (const p of await showcasePieces()) await mockCatalogService.deleteProduct(p.id)
    open()
    expect(await screen.findAllByText(/You have no showcase pieces yet\./)).toHaveLength(3)
    const links = screen.getAllByRole('link', { name: 'Add your first piece' })
    expect(links[0]).toHaveAttribute('href', '/admin/editor/showcase')
    expect(screen.queryByRole('radiogroup', { name: 'See a live example' })).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: '3D card' })).toBeNull()
  })

  it('starts empty, copies the built-in four on request, filled with showcase pieces and each opening its own page', { timeout: 40_000 }, async () => {
    open()
    expect(await screen.findByText(/No cards yet\. The landing page shows its four built-in collections/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Start from the current collections' }))
    const list = await screen.findByRole('list', { name: 'Collections, in the order the page shows them' })
    const rows = within(list).getAllByRole('listitem').filter((r) => within(r).queryByText(/^Collection \d$/)) // the open card also lists its pieces
    expect(rows.map((r) => within(r).getByText(/^Collection \d$/).nextElementSibling?.textContent)).toEqual(['Sofas', 'Tables', 'Armchairs', 'Decor'])
    await waitFor(async () => expect((await savedLanding()).collections).toHaveLength(4), { timeout: 6000 })
    const saved = (await savedLanding()).collections
    expect(saved.map((c) => c.title.pt)).toEqual(['Sofás', 'Mesas', 'Poltronas', 'Decoração'])
    expect(saved.map((c) => c.slug)).toEqual(['sofas', 'tables', 'armchairs', 'decor'])
    expect(saved.every((c) => c.link.kind === 'collection')).toBe(true)
    // Only house pieces.
    const house = await showcasePieces()
    const refs = saved.flatMap((c) => c.products)
    expect(refs.length).toBeGreaterThan(0)
    expect(refs.every((r) => r.businessSlug === HOUSE_BUSINESS_SLUG && house.some((p) => p.slug === r.productSlug))).toBe(true)
  })

  it('ticks pieces for a collection from the thumbnail grid, reorders and removes them', { timeout: 60_000 }, async () => {
    const pieces = await showcasePieces()
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Add a collection' }))
    await userEvent.type(await screen.findByRole('textbox', { name: /Title \(English\)/ }), 'Pieces I like')
    await userEvent.click(screen.getByText('Page address', { selector: 'summary' })) // the address follows the title
    expect(screen.getByRole('textbox', { name: /Page address/ })).toHaveValue('pieces-i-like')

    const grid = screen.getByRole('group', { name: 'Pieces of your showcase' })
    expect(within(grid).getAllByRole('checkbox')).toHaveLength(pieces.length)
    await userEvent.click(within(grid).getByRole('checkbox', { name: pieces[0]!.name.en }))
    await userEvent.click(within(grid).getByRole('checkbox', { name: pieces[1]!.name.en }))
    expect(within(grid).getByRole('checkbox', { name: pieces[0]!.name.en })).toBeChecked()
    expect(screen.getByText('2 of 24 products')).toBeInTheDocument()
    const slugs = async () => (await savedLanding()).collections[0]!.products.map((r) => r.productSlug)
    await waitFor(async () => expect(await slugs()).toEqual([pieces[0]!.slug, pieces[1]!.slug]), { timeout: 8000 })

    await userEvent.click(screen.getByRole('button', { name: `Move ${pieces[0]!.name.en} down` }))
    await waitFor(async () => expect(await slugs()).toEqual([pieces[1]!.slug, pieces[0]!.slug]), { timeout: 8000 })
    await userEvent.click(screen.getByRole('button', { name: `Remove ${pieces[1]!.name.en} from the collection` }))
    await waitFor(async () => expect(await slugs()).toEqual([pieces[0]!.slug]), { timeout: 8000 })
    // Tapping a ticked tile unticks it.
    await userEvent.click(within(grid).getByRole('checkbox', { name: pieces[0]!.name.en }))
    await waitFor(async () => expect(await slugs()).toEqual([]), { timeout: 8000 })
  })

  it('adds a card, edits its texts, picks a built-in picture, moves, hides and removes it', { timeout: 60_000 }, async () => {
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Add a collection' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add a collection' }))
    const list = await screen.findByRole('list', { name: 'Collections, in the order the page shows them' })
    expect(within(list).getAllByRole('listitem').filter((r) => within(r).queryByText(/^Collection \d$/))).toHaveLength(2)
    const [firstUp, secondUp] = screen.getAllByRole('button', { name: 'Move Untitled collection up' })
    expect(firstUp).toBeDisabled() // the first card cannot go up
    expect(secondUp).toBeEnabled()

    // The second card is open: a large picture area with its actions, then the texts.
    expect(screen.getByRole('img', { name: 'The picture of this card' })).toBeInTheDocument()
    expect(within(screen.getByRole('img', { name: 'The picture of this card' }).closest('fieldset')!).getByRole('button', { name: 'Upload picture' })).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: /Title \(English\)/ }), 'Showroom in 3D')
    await userEvent.type(screen.getByRole('textbox', { name: /Title \(Portuguese\)/ }), 'Showroom em 3D')
    await userEvent.type(screen.getByRole('textbox', { name: /Text \(English\)/ }), 'See it in your room')
    await userEvent.click(screen.getByRole('button', { name: 'Choose a built-in picture' }))
    await userEvent.click(screen.getByRole('radio', { name: /phone showing an armchair/ }))
    expect(screen.getByRole('radio', { name: /phone showing an armchair/ })).toBeChecked()
    expect(screen.queryByRole('combobox')).toBeNull() // no link choice any more

    await userEvent.click(screen.getByRole('button', { name: 'Move Showroom in 3D up' }))
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Showroom in 3D')
    await userEvent.click(screen.getByRole('button', { name: 'Hide Showroom in 3D' }))
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Hidden')
    await waitFor(
      async () => {
        const [first, second] = (await savedLanding()).collections
        expect(first).toMatchObject({ title: { en: 'Showroom in 3D', pt: 'Showroom em 3D' }, text: { en: 'See it in your room' }, image: 'ar-phone', hidden: true, link: { kind: 'collection' } })
        expect(second!.title.en).toBe('')
      },
      { timeout: 8000 },
    )

    await userEvent.click(screen.getByRole('button', { name: 'Remove Showroom in 3D' }))
    const confirm = await screen.findByRole('dialog', { name: 'Remove this collection?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(within(list).getAllByRole('listitem').filter((r) => within(r).queryByText(/^Collection \d$/))).toHaveLength(1))
  })

  it('an uploaded card picture can be removed again (back to a built-in one)', { timeout: 40_000 }, async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test/1') })
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Add a collection' }))
    const cardPicture = (await screen.findByRole('img', { name: 'The picture of this card' })).closest('fieldset')!
    await userEvent.upload(within(cardPicture).getByTestId('upload-image'), new File([new Uint8Array(1024)], 'card.png', { type: 'image/png' }))
    await waitFor(async () => expect(typeof (await savedLanding()).collections[0]!.image).toBe('object'), { timeout: 8000 })
    expect(screen.getByRole('img', { name: 'The picture of this card' })).toHaveAttribute('src', 'blob:test/1')
    await userEvent.click(within(cardPicture).getByRole('button', { name: 'Remove' }))
    await waitFor(async () => expect((await savedLanding()).collections[0]!.image).toBe('hero-living'), { timeout: 8000 })
  })

  it('an incomplete card is listed as a problem and keeps Publish disabled; the limit of eight stops "Add"', { timeout: 60_000 }, async () => {
    open()
    const add = await screen.findByRole('button', { name: 'Add a collection' })
    await userEvent.click(add)
    expect(await screen.findByText(/to fix before publishing/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
    for (let i = 0; i < 7; i++) await userEvent.click(add)
    expect(add).toBeDisabled()
    expect(screen.getByText('The landing page shows up to 8 collections.')).toBeInTheDocument()
  })
})

