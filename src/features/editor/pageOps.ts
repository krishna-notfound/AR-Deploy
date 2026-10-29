// Pure edits of the pages of a SiteContent document, shared by the Pages table, the footer panel and the page editor.
import { type CustomPage, MAX_SLUG_LENGTH, RESERVED_PAGE_SLUGS, type SiteContent } from '@/domain/siteContent'
import { slugify, uniqueSlug } from '@/lib/slug'

/** Pages shown in the footer, in the order the public footer shows them (order, then English title). */
export function footerPages(doc: SiteContent): CustomPage[] {
  return doc.customPages.filter((p) => p.showInFooter).sort((a, b) => a.order - b.order || a.title.en.localeCompare(b.title.en))
}

/** A new empty page at the end of the footer order. Not in the footer until the client switches it on. */
export function newPage(doc: SiteContent, id: string = crypto.randomUUID()): CustomPage {
  const order = doc.customPages.reduce((max, p) => Math.max(max, p.order + 1), 0)
  return { id, slug: '', title: { en: '' }, body: { en: '' }, showInFooter: false, order }
}

export const withPage = (doc: SiteContent, page: CustomPage): SiteContent => ({ ...doc, customPages: [...doc.customPages, page] })

export const updatePage = (doc: SiteContent, id: string, patch: (p: CustomPage) => CustomPage): SiteContent => ({
  ...doc,
  customPages: doc.customPages.map((p) => (p.id === id ? patch(p) : p)),
})

export const removePage = (doc: SiteContent, id: string): SiteContent => ({ ...doc, customPages: doc.customPages.filter((p) => p.id !== id) })

/** Moves a footer page one place up or down and renumbers the footer pages 0, 1, 2… so the order is unambiguous. */
export function moveInFooter(doc: SiteContent, id: string, dir: -1 | 1): SiteContent {
  const list = footerPages(doc)
  const from = list.findIndex((p) => p.id === id)
  const to = from + dir
  if (from < 0 || to < 0 || to >= list.length) return doc
  const next = [...list]
  ;[next[from], next[to]] = [next[to]!, next[from]!]
  const order = new Map(next.map((p, i) => [p.id, i]))
  return { ...doc, customPages: doc.customPages.map((p) => (order.has(p.id) ? { ...p, order: order.get(p.id)! } : p)) }
}

/** The address a title suggests: `About us` → `about-us`, made unique among the other pages and never a reserved word. */
export function suggestSlug(doc: SiteContent, title: string, selfId: string): string {
  const base = slugify(title)
  if (!base) return ''
  const taken = [...doc.customPages.filter((p) => p.id !== selfId).map((p) => p.slug), ...RESERVED_PAGE_SLUGS]
  return uniqueSlug(base, taken, MAX_SLUG_LENGTH)
}
