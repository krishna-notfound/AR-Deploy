import { beforeEach, describe, expect, it } from 'vitest'
import { mockCatalogService as svc } from './mockCatalogService'
import { store } from './store'

const ACCOUNT_KEY = 'arfurn:account'
const as = (s: object | null) => (s ? localStorage.setItem(ACCOUNT_KEY, JSON.stringify(s)) : localStorage.removeItem(ACCOUNT_KEY))

beforeEach(async () => {
  localStorage.clear()
  await svc.resetDemoData()
})

describe('demo visibility of non-active businesses (R-W8-2)', () => {
  // biz_oak is inactive in the seed.
  it('signed out, getBusinessBySlug("oak-ember") is NOT_FOUND', async () => {
    const r = await svc.getBusinessBySlug('oak-ember')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND')
  })

  it('as super_admin or as the business_admin of biz_oak it is returned; another business_admin gets NOT_FOUND', async () => {
    as({ role: 'super_admin' })
    expect((await svc.getBusinessBySlug('oak-ember')).ok).toBe(true)
    as({ role: 'business_admin', businessId: 'biz_oak' })
    expect((await svc.getBusinessBySlug('oak-ember')).ok).toBe(true)
    as({ role: 'business_admin', businessId: 'biz_nord' })
    expect((await svc.getBusinessBySlug('oak-ember')).ok).toBe(false)
  })

  it('the same holds for getCatalog', async () => {
    expect((await svc.getCatalog('oak-ember')).ok).toBe(false)
    as({ role: 'super_admin' })
    expect((await svc.getCatalog('oak-ember')).ok).toBe(true)
    as({ role: 'business_admin', businessId: 'biz_oak' })
    expect((await svc.getCatalog('oak-ember')).ok).toBe(true)
    as({ role: 'business_admin', businessId: 'biz_nord' })
    expect((await svc.getCatalog('oak-ember')).ok).toBe(false)
  })

  it('the same holds for getPublicProduct', async () => {
    const oak = store.get().products.find((p) => p.businessId === 'biz_oak')!
    const get = () => svc.getPublicProduct('oak-ember', oak.slug, { allowDraft: true })
    expect((await get()).ok).toBe(false)
    as({ role: 'super_admin' })
    expect((await get()).ok).toBe(true)
    as({ role: 'business_admin', businessId: 'biz_oak' })
    expect((await get()).ok).toBe(true)
    as({ role: 'business_admin', businessId: 'biz_nord' })
    expect((await get()).ok).toBe(false)
  })

  it('an active business is readable signed out', async () => {
    expect((await svc.getBusinessBySlug('nordhaus')).ok).toBe(true)
  })
})

describe('deleteBusiness cleans up after itself (R-W8-2)', () => {
  it('removes owners[id] and the business ownerInviteAttempts', async () => {
    const createdAt = new Date().toISOString()
    store.update((d) => {
      d.ownerInviteAttempts = [
        { businessId: 'biz_oak', recipient: 'a@x.test', attempt: 1, outcome: 'accepted', createdAt },
        { businessId: 'biz_nord', recipient: 'b@x.test', attempt: 1, outcome: 'accepted', createdAt },
      ]
    })
    expect(store.get().owners?.biz_oak).toBeDefined()
    expect((await svc.deleteBusiness('biz_oak')).ok).toBe(true)
    expect(store.get().owners?.biz_oak).toBeUndefined()
    expect(store.get().ownerInviteAttempts?.map((a) => a.businessId)).toEqual(['biz_nord'])
  })
})
