import { describe, expect, it } from 'vitest'
import { emptySiteContent } from '@/domain/siteContent'
import { footerPages, moveInFooter, newPage, suggestSlug, updatePage, withPage } from './pageOps'

const doc = () => {
  let d = emptySiteContent()
  for (const [id, slug, order, showInFooter] of [
    ['a', 'about', 0, true],
    ['b', 'shipping', 1, true],
    ['c', 'hidden', 2, false],
    ['d', 'returns', 3, true],
  ] as const) d = withPage(d, { ...newPage(d, id), slug, title: { en: slug }, order, showInFooter })
  return d
}

describe('page operations', () => {
  it('lists the footer pages in footer order', () => {
    expect(footerPages(doc()).map((p) => p.id)).toEqual(['a', 'b', 'd'])
  })

  it('moves a footer page up or down and renumbers the footer pages', () => {
    const moved = moveInFooter(doc(), 'd', -1)
    expect(footerPages(moved).map((p) => p.id)).toEqual(['a', 'd', 'b'])
    expect(footerPages(moved).map((p) => p.order)).toEqual([0, 1, 2])
    expect(moved.customPages.find((p) => p.id === 'c')?.order).toBe(2) // not in the footer: untouched
    expect(moveInFooter(doc(), 'a', -1)).toEqual(doc())
    expect(footerPages(moveInFooter(doc(), 'a', 1)).map((p) => p.id)).toEqual(['b', 'a', 'd'])
  })

  it('a new page goes last and is not in the footer', () => {
    const p = newPage(doc(), 'z')
    expect(p).toMatchObject({ id: 'z', slug: '', showInFooter: false, order: 4 })
  })

  it('suggests a unique address from the title and never a reserved word', () => {
    const d = doc()
    expect(suggestSlug(d, 'About us', 'new')).toBe('about-us')
    expect(suggestSlug(d, 'Shipping', 'new')).toBe('shipping-2')
    expect(suggestSlug(d, 'Shipping', 'b')).toBe('shipping')
    expect(suggestSlug(d, 'Admin', 'new')).toBe('admin-2')
    expect(suggestSlug(d, '   ', 'new')).toBe('')
  })

  it('updatePage changes only the page with that id', () => {
    const d = updatePage(doc(), 'b', (p) => ({ ...p, title: { en: 'Shipping and delivery' } }))
    expect(d.customPages.map((p) => p.title.en)).toEqual(['about', 'Shipping and delivery', 'hidden', 'returns'])
  })
})
