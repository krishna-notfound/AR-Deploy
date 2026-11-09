// The demo implementation of the managed lists (ADR-0055): the same rules as the database.
import { beforeEach, describe, expect, it } from 'vitest'
import type { Result } from '../catalogService'
import { mockCatalogService } from './mockCatalogService'
import { mockListsService as svc } from './mockLists'
import { store } from './store'

const ACCOUNT_KEY = 'arfurn:account'
const asStaff = (platformRole: 'owner' | 'admin' | 'team') => localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole }))
const asOwner = (businessId: string) => localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'business_admin', businessId }))

function data<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`)
  return r.data
}
const err = <T>(r: Result<T>) => (r.ok ? null : r.error)

beforeEach(async () => {
  localStorage.clear()
  asStaff('admin')
  await mockCatalogService.resetDemoData()
})

describe('reading', () => {
  it('serves the seed: the seven categories and Other last; EUR, BRL and USD on, other codes off', async () => {
    const cats = data(await svc.getCategories())
    expect(cats.map((c) => c.slug)).toEqual(['sofa', 'chair', 'table', 'bed', 'storage', 'lighting', 'decor', 'other'])
    const cur = data(await svc.getCurrencies())
    expect(cur.filter((c) => c.enabled).map((c) => c.code)).toEqual(['EUR', 'BRL', 'USD'])
    expect(cur.length).toBeGreaterThan(10)
  })
  it('anyone reads, with no account at all', async () => {
    localStorage.clear()
    expect(data(await svc.getCategories())).toHaveLength(8)
    expect(data(await svc.getCurrencies()).length).toBeGreaterThan(3)
  })
})

describe('categories', () => {
  it('adds one with a slug from the English name, last before Other; the same name twice gets a free slug', async () => {
    const a = data(await svc.saveCategory({ labelEn: 'Garden Furniture', labelPt: 'Mobiliário de jardim' }))
    expect(a).toMatchObject({ slug: 'garden-furniture', active: true })
    const b = data(await svc.saveCategory({ labelEn: 'Garden furniture', labelPt: 'Jardim' }))
    expect(b.slug).toBe('garden-furniture-2')
    const slugs = data(await svc.getCategories()).map((c) => c.slug)
    expect(slugs.slice(-3)).toEqual(['garden-furniture', 'garden-furniture-2', 'other'])
  })

  it('needs both names; the errors name the field', async () => {
    const e = err(await svc.saveCategory({ labelEn: '', labelPt: 'x' }))
    expect(e).toMatchObject({ code: 'VALIDATION', fieldErrors: { labelEn: { key: 'common.validation.categoryNameEnRequired' } } })
    expect(err(await svc.saveCategory({ labelEn: 'x', labelPt: ' ' }))?.fieldErrors).toHaveProperty('labelPt')
    expect(err(await svc.saveCategory({ labelEn: 'x'.repeat(61), labelPt: 'y' }))?.fieldErrors).toHaveProperty('labelEn')
  })

  it('renames in both languages and hides or shows, keeping the slug', async () => {
    const r = data(await svc.saveCategory({ slug: 'sofa', labelEn: 'Couch', labelPt: 'Sofá-cama', active: false }))
    expect(r).toMatchObject({ slug: 'sofa', labelEn: 'Couch', labelPt: 'Sofá-cama', active: false })
    expect(data(await svc.getCategories()).find((c) => c.slug === 'sofa')).toMatchObject({ labelEn: 'Couch', active: false })
    data(await svc.saveCategory({ slug: 'sofa', labelEn: 'Couch', labelPt: 'Sofá-cama', active: true }))
    expect(data(await svc.getCategories()).find((c) => c.slug === 'sofa')!.active).toBe(true)
    expect(err(await svc.saveCategory({ slug: 'ghost', labelEn: 'a', labelPt: 'b' }))?.code).toBe('NOT_FOUND')
  })

  it('Other can be renamed but never hidden', async () => {
    const r = data(await svc.saveCategory({ slug: 'other', labelEn: 'Miscellaneous', labelPt: 'Diversos', active: false }))
    expect(r).toMatchObject({ labelEn: 'Miscellaneous', active: true })
  })

  it('reorders: the given order wins and Other stays last', async () => {
    data(await svc.reorderCategories(['decor', 'sofa', 'chair', 'table', 'bed', 'storage', 'lighting', 'other']))
    expect(data(await svc.getCategories()).map((c) => c.slug)).toEqual(['decor', 'sofa', 'chair', 'table', 'bed', 'storage', 'lighting', 'other'])
  })

  it('deleting moves the products to Other, removes the category and says how many moved', async () => {
    const before = store.get().products
    const inSofa = before.filter((p) => p.category === 'sofa').length
    expect(inSofa).toBeGreaterThan(0)
    const res = data(await svc.deleteCategory('sofa'))
    expect(res.moved).toBe(inSofa)
    expect(data(await svc.getCategories()).some((c) => c.slug === 'sofa')).toBe(false)
    const after = store.get().products
    expect(after.filter((p) => p.category === 'sofa')).toHaveLength(0)
    expect(after.filter((p) => p.category === 'other')).toHaveLength(inSofa)
  })

  it('Other cannot be deleted; an unknown slug is not found', async () => {
    expect(err(await svc.deleteCategory('other'))).toMatchObject({ reason: 'category_protected' })
    expect(err(await svc.deleteCategory('ghost'))).toMatchObject({ code: 'NOT_FOUND', reason: 'category_not_found' })
    expect(data(await svc.getCategories())).toHaveLength(8)
  })

  it('"Reset demo data" brings the seed back', async () => {
    data(await svc.saveCategory({ labelEn: 'Rugs', labelPt: 'Tapetes' }))
    data(await svc.deleteCategory('sofa'))
    await mockCatalogService.resetDemoData()
    expect(data(await svc.getCategories())).toHaveLength(8)
  })
})

describe('currencies', () => {
  it('switches one on and off; a switched-off currency stays on the products that use it', async () => {
    expect(data(await svc.setCurrencyEnabled('GBP', true))).toMatchObject({ code: 'GBP', enabled: true })
    const usd = store.get().products.filter((p) => p.currency === 'USD').length
    data(await svc.setCurrencyEnabled('USD', false))
    expect(data(await svc.getCurrencies()).find((c) => c.code === 'USD')!.enabled).toBe(false)
    expect(store.get().products.filter((p) => p.currency === 'USD')).toHaveLength(usd)
  })
  it('the last one on cannot be switched off', async () => {
    data(await svc.setCurrencyEnabled('BRL', false))
    data(await svc.setCurrencyEnabled('USD', false))
    expect(err(await svc.setCurrencyEnabled('EUR', false))).toMatchObject({ reason: 'last_currency' })
    expect(data(await svc.getCurrencies()).filter((c) => c.enabled).map((c) => c.code)).toEqual(['EUR'])
  })
  it('an unknown code is not found', async () => {
    expect(err(await svc.setCurrencyEnabled('XXX', true))?.code).toBe('NOT_FOUND')
  })
})

describe('who may change them', () => {
  it('Owner and Admin can; Team (without content.manage), a business owner and a visitor cannot', async () => {
    asStaff('owner')
    data(await svc.setCurrencyEnabled('GBP', true))
    asStaff('team')
    expect(err(await svc.saveCategory({ labelEn: 'Rugs', labelPt: 'Tapetes' }))).toMatchObject({ code: 'PERMISSION' })
    expect(err(await svc.deleteCategory('sofa'))?.code).toBe('PERMISSION')
    expect(err(await svc.setCurrencyEnabled('CHF', true))?.code).toBe('PERMISSION')
    expect(err(await svc.reorderCategories(['sofa']))?.code).toBe('PERMISSION')
    asOwner('whatever')
    expect(err(await svc.saveCategory({ labelEn: 'Rugs', labelPt: 'Tapetes' }))?.code).toBe('PERMISSION')
    localStorage.clear()
    expect(err(await svc.deleteCategory('sofa'))?.code).toBe('PERMISSION')
    expect(store.get().lists?.categories.some((c) => c.slug === 'sofa') ?? true).toBe(true)
  })
})
