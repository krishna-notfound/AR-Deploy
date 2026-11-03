// Pure edits of the landing collections of a SiteContent document, used by the Landing collections screen (ADR-0046).
import { type LandingCollection, type LandingCollectionLink, MAX_LANDING_COLLECTIONS, type SiteContent } from '@/domain/siteContent'

/** A new card at the end: no title yet (publishing needs one), the first built-in photo, no link. */
export function newCollection(id: string = crypto.randomUUID()): LandingCollection {
  return { id, title: { en: '' }, image: 'hero-living', link: { kind: 'none' } }
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
