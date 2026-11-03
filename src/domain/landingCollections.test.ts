import { describe, expect, it } from 'vitest'
import { LANDING_IMAGE_KEYS, type LandingCollection, MAX_LANDING_COLLECTIONS, type SiteContent, emptySiteContent, normalizeSiteContent, summarizeChanges, validateContentShape, validateSiteContent } from './siteContent'
import { CATEGORIES } from './types'
import { LANDING_IMAGES } from '@/features/marketing/landingImages'

const card = (over: Partial<LandingCollection> = {}): LandingCollection => ({ id: crypto.randomUUID(), title: { en: 'Sofas', pt: 'Sofás' }, image: 'sofa-travertine', link: { kind: 'none' }, ...over })
const withCards = (...cards: LandingCollection[]): SiteContent => ({ ...emptySiteContent(), landing: { collections: cards } })

describe('landing collections: model', () => {
  it('an empty document has no cards, and normalize fills the group from anything', () => {
    expect(emptySiteContent().landing).toEqual({ collections: [] })
    expect(normalizeSiteContent({}).landing).toEqual({ collections: [] })
    expect(normalizeSiteContent({ landing: 'x' }).landing).toEqual({ collections: [] })
    expect(normalizeSiteContent({ landing: { collections: 'x' } }).landing).toEqual({ collections: [] })
  })

  it('normalize round-trips every link kind and drops unknown keys and an empty text', () => {
    const cards = [
      card({ link: { kind: 'product', businessSlug: 'acme', productSlug: 'linden-chair' }, text: { en: 'Hi', pt: 'Olá' } }),
      card({ link: { kind: 'catalog', businessSlug: 'acme', category: 'sofa' }, hidden: true }),
      card({ link: { kind: 'catalog', businessSlug: 'acme' } }),
      card({ link: { kind: 'apply' } }),
      card(),
    ]
    expect(normalizeSiteContent(JSON.parse(JSON.stringify(withCards(...cards)))).landing.collections).toEqual(cards)
    const n = normalizeSiteContent({ landing: { collections: [{ id: 'a', title: { en: 'T', fr: 'x' }, text: { en: '' }, image: 'lamp-vase', link: { kind: 'external', url: 'https://x.test' }, extra: 1, hidden: false }] } }).landing.collections[0]!
    expect(n).toEqual({ id: 'a', title: { en: 'T' }, image: 'lamp-vase', link: { kind: 'none' } })
  })

  it('every photo key has a labelled photo in both languages', () => {
    expect(Object.keys(LANDING_IMAGES).sort()).toEqual([...LANDING_IMAGE_KEYS].sort())
    for (const key of LANDING_IMAGE_KEYS) {
      expect(LANDING_IMAGES[key].alt.en).not.toBe('')
      expect(LANDING_IMAGES[key].alt.pt).not.toBe('')
    }
  })
})

describe('landing collections: validation', () => {
  const at = (i: number, path: string) => `landing.collections.${i}.${path}`

  it('a document with no cards, and with a full valid set, is valid', () => {
    expect(validateSiteContent(emptySiteContent())).toEqual({})
    const all = LANDING_IMAGE_KEYS.slice(0, MAX_LANDING_COLLECTIONS).map((image) => card({ image }))
    expect(validateSiteContent(withCards(...all))).toEqual({})
    for (const category of CATEGORIES) expect(validateSiteContent(withCards(card({ link: { kind: 'catalog', businessSlug: 'acme', category } })))).toEqual({})
  })

  it('more than eight cards is too many, in the shape check and in validate', () => {
    const nine = withCards(...Array.from({ length: 9 }, () => card()))
    expect(validateContentShape(nine)).toEqual({ 'landing.collections': 'too_many' })
    expect(validateSiteContent(nine)['landing.collections']).toBe('too_many')
    expect(validateContentShape(withCards(...Array.from({ length: 8 }, () => card())))).toEqual({})
    expect(validateContentShape({ schema: 1, landing: [] })).toEqual({ landing: 'invalid_value' })
  })

  it('checks title, text, photo and id with the path of each problem', () => {
    expect(validateSiteContent(withCards(card({ title: { en: '   ' } })))).toEqual({ [at(0, 'title.en')]: 'required' })
    expect(validateSiteContent(withCards(card({ title: { en: 'x'.repeat(61) } })))).toEqual({ [at(0, 'title.en')]: 'too_long' })
    expect(validateSiteContent(withCards(card({ title: { en: 'x'.repeat(60) } })))).toEqual({})
    expect(validateSiteContent(withCards(card({ title: { en: 'A', pt: 'x'.repeat(61) } })))).toEqual({ [at(0, 'title.pt')]: 'too_long' })
    expect(validateSiteContent(withCards(card({ text: { en: 'x'.repeat(161) } })))).toEqual({ [at(0, 'text.en')]: 'too_long' })
    expect(validateSiteContent(withCards(card({ text: { en: 'x'.repeat(160), pt: 'y'.repeat(161) } })))).toEqual({ [at(0, 'text.pt')]: 'too_long' })
    expect(validateSiteContent(withCards(card({ image: 'nope' })))).toEqual({ [at(0, 'image')]: 'invalid_value' })
    expect(validateSiteContent(withCards(card({ image: '' })))).toEqual({ [at(0, 'image')]: 'required' })
    const dup = card()
    expect(validateSiteContent(withCards(dup, dup))).toEqual({ [at(1, 'id')]: 'duplicate_id' })
    expect(validateSiteContent(withCards(card({ id: '' })))).toEqual({ [at(0, 'id')]: 'required' })
  })

  it('checks links: kind, slugs, and category', () => {
    expect(validateSiteContent(withCards(card({ link: { kind: 'product', businessSlug: '', productSlug: '' } })))).toEqual({ [at(0, 'link.businessSlug')]: 'required', [at(0, 'link.productSlug')]: 'required' })
    expect(validateSiteContent(withCards(card({ link: { kind: 'product', businessSlug: 'Bad Slug', productSlug: 'ok' } })))).toEqual({ [at(0, 'link.businessSlug')]: 'invalid_slug' })
    expect(validateSiteContent(withCards(card({ link: { kind: 'product', businessSlug: 'acme', productSlug: '-x-' } })))).toEqual({ [at(0, 'link.productSlug')]: 'invalid_slug' })
    expect(validateSiteContent(withCards(card({ link: { kind: 'catalog', businessSlug: '' } })))).toEqual({ [at(0, 'link.businessSlug')]: 'required' })
    expect(validateSiteContent(withCards(card({ link: { kind: 'catalog', businessSlug: 'acme', category: 'spaceship' as never } })))).toEqual({ [at(0, 'link.category')]: 'invalid_value' })
    expect(validateSiteContent(withCards(card({ link: { kind: 'external' } as never })))).toEqual({ [at(0, 'link')]: 'invalid_value' })
  })
})

describe('landing collections: change summary', () => {
  it('counts added, removed, edited, hidden and reordered cards as one group', () => {
    const a = card({ id: 'a' })
    const b = card({ id: 'b', title: { en: 'Tables' } })
    expect(summarizeChanges(null, withCards()).landingCollections).toBe(0)
    expect(summarizeChanges(null, withCards(a, b)).landingCollections).toBe(2)
    expect(summarizeChanges(withCards(a, b), withCards(a, b)).landingCollections).toBe(0)
    expect(summarizeChanges(withCards(a, b), withCards(a)).landingCollections).toBe(1)
    expect(summarizeChanges(withCards(a, b), withCards(a, { ...b, hidden: true })).landingCollections).toBe(1)
    expect(summarizeChanges(withCards(a, b), withCards(a, { ...b, title: { en: 'Tables', pt: 'Mesas' } })).landingCollections).toBe(1)
    expect(summarizeChanges(withCards(a, b), withCards(b, a)).landingCollections).toBe(1)
    const s = summarizeChanges(withCards(a), withCards(a, b))
    expect(s.total).toBe(s.landingCollections)
  })
})
