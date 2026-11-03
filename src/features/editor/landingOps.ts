// Pure edits of the landing collections of a SiteContent document, used by the Landing collections screen (ADR-0046).
import { type LandingCollection, type LandingCollectionLink, MAX_COLLECTION_PRODUCTS, MAX_LANDING_COLLECTIONS, type ProductRef, type SiteContent } from '@/domain/siteContent'
import { slugify } from '@/lib/slug'

/** A new card at the end: no title or slug yet (publishing needs them), the first built-in photo, its own page as the link, no products. */
export function newCollection(id: string = crypto.randomUUID()): LandingCollection {
  return { id, slug: '', title: { en: '' }, image: 'hero-living', link: { kind: 'collection' }, products: [] }
}

export function canAddCollection(doc: SiteContent): boolean {
  return doc.landing.collections.length < MAX_LANDING_COLLECTIONS
}

const withList = (doc: SiteContent, collections: LandingCollection[]): SiteContent => ({ ...doc, landing: { ...doc.landing, collections } })

export const addCollection = (doc: SiteContent, card: LandingCollection): SiteContent =>
  canAddCollection(doc) ? withList(doc, [...doc.landing.collections, card]) : doc

export const replaceCollections = (doc: SiteContent, cards: LandingCollection[]): SiteContent => withList(doc, cards.slice(0, MAX_LANDING_COLLECTIONS))

export const updateCollection = (doc: SiteContent, id: string, patch: (c: LandingCollection) => LandingCollection): SiteContent =>
  withList(doc, doc.landing.collections.map((c) => (c.id === id ? patch(c) : c)))

export const removeCollection = (doc: SiteContent, id: string): SiteContent => withList(doc, doc.landing.collections.filter((c) => c.id !== id))

/** Moves a card one place up or down; the first cannot go up and the last cannot go down. */
export function moveCollection(doc: SiteContent, id: string, dir: -1 | 1): SiteContent {
  const list = [...doc.landing.collections]
  const from = list.findIndex((c) => c.id === id)
  const to = from + dir
  if (from < 0 || to < 0 || to >= list.length) return doc
  ;[list[from], list[to]] = [list[to]!, list[from]!]
  return withList(doc, list)
}

/** Shown on the page = not hidden. `hidden` is dropped when false so an untouched card stays identical to the published one. */
export const setCollectionHidden = (doc: SiteContent, id: string, hidden: boolean): SiteContent =>
  updateCollection(doc, id, (c) => {
    const { hidden: _old, ...rest } = c
    return hidden ? { ...rest, hidden: true } : rest
  })

/** A slug from `base` that no other collection uses (-2, -3, ... appended). Empty when the title gives no letters. */
export function uniqueCollectionSlug(doc: SiteContent, id: string, base: string): string {
  const root = slugify(base)
  if (!root) return ''
  const taken = new Set(doc.landing.collections.filter((c) => c.id !== id).map((c) => c.slug))
  let slug = root
  for (let n = 2; taken.has(slug); n++) slug = `${root.slice(0, 56)}-${n}`
  return slug
}

/** Sets the English title; while the slug is empty or still the one made from the old title, it follows the title. */
export const setCollectionTitleEn = (doc: SiteContent, id: string, text: string): SiteContent =>
  updateCollection(doc, id, (c) => {
    const follows = c.slug === '' || c.slug === uniqueCollectionSlug(doc, id, c.title.en)
    return { ...c, title: withLang(c.title, 'en', text), slug: follows ? uniqueCollectionSlug(doc, id, text) : c.slug }
  })

export const sameRef = (a: ProductRef, b: ProductRef): boolean => a.businessSlug === b.businessSlug && a.productSlug === b.productSlug

export const canAddProduct = (c: LandingCollection): boolean => c.products.length < MAX_COLLECTION_PRODUCTS

export const addCollectionProduct = (doc: SiteContent, id: string, ref: ProductRef): SiteContent =>
  updateCollection(doc, id, (c) => (canAddProduct(c) && !c.products.some((p) => sameRef(p, ref)) ? { ...c, products: [...c.products, ref] } : c))

export const removeCollectionProduct = (doc: SiteContent, id: string, ref: ProductRef): SiteContent =>
  updateCollection(doc, id, (c) => ({ ...c, products: c.products.filter((p) => !sameRef(p, ref)) }))

/** Moves a product one place up or down inside its collection. */
export const moveCollectionProduct = (doc: SiteContent, id: string, ref: ProductRef, dir: -1 | 1): SiteContent =>
  updateCollection(doc, id, (c) => {
    const list = [...c.products]
    const from = list.findIndex((p) => sameRef(p, ref))
    const to = from + dir
    if (from < 0 || to < 0 || to >= list.length) return c
    ;[list[from], list[to]] = [list[to]!, list[from]!]
    return { ...c, products: list }
  })

/** The featured 3D piece of the landing page; `undefined` clears it. */
export function setFeatured(doc: SiteContent, ref: ProductRef | undefined): SiteContent {
  const { featured: _old, ...rest } = doc.landing
  return { ...doc, landing: ref ? { ...rest, featured: ref } : rest }
}

/** The link of a new kind, empty where the person must still choose (publishing is blocked until they do). */
export function emptyLink(kind: LandingCollectionLink['kind']): LandingCollectionLink {
  switch (kind) {
    case 'product':
      return { kind, businessSlug: '', productSlug: '' }
    case 'catalog':
      return { kind, businessSlug: '' }
    default:
      return { kind }
  }
}

/** A text pair with the Portuguese removed when it is blank, so the page then shows the English. */
export function withLang(value: { en: string; pt?: string } | undefined, lang: 'en' | 'pt', text: string): { en: string; pt?: string } {
  const base = value ?? { en: '' }
  if (lang === 'en') return { ...base, en: text }
  if (!text.trim()) {
    const { pt: _pt, ...rest } = base
    return rest
  }
  return { ...base, pt: text }
}
