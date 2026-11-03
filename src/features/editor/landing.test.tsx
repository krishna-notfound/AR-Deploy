import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { emptySiteContent } from '@/domain/siteContent'
import { content } from '@/services'
import { mockCatalogService } from '@/services/mock/mockCatalogService'
import { addCollection, canAddCollection, emptyLink, moveCollection, newCollection, removeCollection, setCollectionHidden, updateCollection, withLang } from './landingOps'

const open = () => {
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  window.history.replaceState(null, '', '/admin/editor/landing')
  return render(<App />)
}
const savedDraft = async () => {
  const s = await content.getContentDraft()
  if (!s.ok) throw new Error('draft')
  return s.data.draft.landing.collections
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
    expect(withLang({ en: 'A', pt: 'B' }, 'pt', '  ')).toEqual({ en: 'A' }) // a blank Portuguese falls back to the English
    expect(withLang({ en: 'A' }, 'pt', 'B')).toEqual({ en: 'A', pt: 'B' })
  })
})

describe('Landing collections screen', () => {
  it('starts empty, copies the built-in four on request, and each opens the right catalogue', { timeout: 40_000 }, async () => {
    open()
    expect(await screen.findByText(/No cards yet\. The landing page shows its four built-in collections/)).toBeInTheDocument()
    const start = screen.getByRole('button', { name: 'Start from the current collections' })
    await waitFor(() => expect(start).toBeEnabled())
    await userEvent.click(start)
    const list = await screen.findByRole('list', { name: 'Collections, in the order the page shows them' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((r) => within(r).getByText(/^Collection \d$/).nextElementSibling?.textContent)).toEqual(['Sofas', 'Tables', 'Armchairs', 'Decor'])
    // Autosaved to the draft; each card links to a real catalogue.
    await waitFor(async () => expect(await savedDraft()).toHaveLength(4), { timeout: 6000 })
    const saved = await savedDraft()
    expect(saved.map((c) => c.title.pt)).toEqual(['Sofás', 'Mesas', 'Poltronas', 'Decoração'])
    expect(saved.every((c) => c.link.kind === 'catalog' && c.link.businessSlug !== '')).toBe(true)
  })

  it('adds a card, edits its texts, picks a picture and a published product, moves, hides and removes it', { timeout: 60_000 }, async () => {
    const published = await mockCatalogService.getProducts({ status: 'published' })
    const businesses = await mockCatalogService.getBusinesses()
    if (!published.ok || !businesses.ok) throw new Error('demo data')
    const product = published.data.find((p) => businesses.data.find((b) => b.id === p.businessId)?.status === 'active')!
    const business = businesses.data.find((b) => b.id === product.businessId)!

    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Add a collection' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add a collection' }))
    const list = await screen.findByRole('list', { name: 'Collections, in the order the page shows them' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    const [firstUp, secondUp] = screen.getAllByRole('button', { name: 'Move Untitled collection up' })
    expect(firstUp).toBeDisabled() // the first card cannot go up
    expect(secondUp).toBeEnabled()

    // The second card is open: fill it in.
    await userEvent.type(screen.getByRole('textbox', { name: /Title \(English\)/ }), 'Showroom in 3D')
    await userEvent.type(screen.getByRole('textbox', { name: /Title \(Portuguese\)/ }), 'Showroom em 3D')
    await userEvent.type(screen.getByRole('textbox', { name: /Text \(English\)/ }), 'See it in your room')
    await userEvent.click(screen.getByRole('radio', { name: /phone showing an armchair/ }))
    expect(screen.getByRole('radio', { name: /phone showing an armchair/ })).toBeChecked()

    // Link: a published product, by name and business.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Where the card leads' }), 'product')
    const picker = screen.getByRole('combobox', { name: /Product/ })
    await waitFor(() => expect(within(picker).getAllByRole('option').length).toBeGreaterThan(1))
    const option = within(picker).getAllByRole('option').find((o) => o.textContent?.endsWith(`· ${business.name}`))!
    await userEvent.selectOptions(picker, option)

    // Move the card to the top, hide it, then remove it with a confirmation.
    await userEvent.click(screen.getByRole('button', { name: 'Move Showroom in 3D up' }))
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Showroom in 3D')
    await userEvent.click(screen.getByRole('button', { name: 'Hide Showroom in 3D' }))
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Hidden')
    await waitFor(async () => {
      const [first, second] = await savedDraft()
      expect(first).toMatchObject({
        title: { en: 'Showroom in 3D', pt: 'Showroom em 3D' },
        text: { en: 'See it in your room' },
        image: 'ar-phone',
        hidden: true,
        link: { kind: 'product', businessSlug: business.slug, productSlug: product.slug },
      })
      expect(second!.title.en).toBe('')
    }, { timeout: 8000 })

    await userEvent.click(screen.getByRole('button', { name: 'Remove Showroom in 3D' }))
    const confirm = await screen.findByRole('dialog', { name: 'Remove this collection?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1))
  })

  it('an incomplete card is listed as a problem and keeps Publish disabled; the limit of eight stops "Add"', { timeout: 60_000 }, async () => {
    open()
    const add = await screen.findByRole('button', { name: 'Add a collection' })
    await userEvent.click(add)
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Where the card leads' }), 'catalog')
    await userEvent.type(screen.getByRole('textbox', { name: /Title \(English\)/ }), 'Catalogue')
    const summary = await screen.findByText('1 problem to fix before publishing')
    await userEvent.click(summary)
    expect(screen.getByText(/Landing collections: Catalogue, business/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
    for (let i = 0; i < 7; i++) await userEvent.click(add)
    expect(add).toBeDisabled()
    expect(screen.getByText('The landing page shows up to 8 collections.')).toBeInTheDocument()
  })
})
