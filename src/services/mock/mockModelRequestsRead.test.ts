import { beforeEach, describe, expect, it } from 'vitest'
import type { ModelRequestStatus } from '@/domain/modelRequests'
import type { Result } from '../catalogService'
import { mockCatalogService as svc } from './mockCatalogService'
import { DEMO_REQUEST_TARGET_SLUG } from './seed'
import { sessionRequestMedia } from './mockModelRequestShared'
import { store } from './store'

function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`)
  return r.data
}

const ACCOUNT_KEY = 'arfurn:account'
const asStaff = (platformRole: 'owner' | 'admin' | 'team') => localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole }))
const asOwner = (businessId: string) => localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'business_admin', businessId }))
const ALL: ModelRequestStatus[] = ['requested', 'in_progress', 'delivered', 'rejected', 'cancelled']

beforeEach(async () => {
  localStorage.clear()
  await svc.resetDemoData()
})

describe('S4 Task 2: demo model request reads', () => {
  it('the seed has one request per status for biz_casa', async () => {
    asStaff('owner')
    const page = unwrap(await svc.getModelRequests({ businessId: 'biz_casa' }))
    expect(page.items.map((r) => r.status).sort()).toEqual(['delivered', 'in_progress', 'rejected', 'requested'])
    for (const r of page.items) {
      expect(r.businessName).toBe('Casa Lisboa Interiors')
      expect(r.photoCount).toBeGreaterThanOrEqual(2)
    }
    const rejected = page.items.find((r) => r.status === 'rejected')
    expect(rejected?.reason).toBe('The photos are too dark. Please send new ones taken in daylight.')
    const delivered = page.items.find((r) => r.status === 'delivered')!
    expect(store.get().products.find((p) => p.id === delivered.productId)?.models.glb).toBeDefined()
    for (const r of page.items.filter((x) => x.status === 'requested' || x.status === 'in_progress' || x.status === 'rejected'))
      expect(store.get().products.find((p) => p.id === r.productId)?.models).toEqual({})
    // The demo's own seed photos are labelled samples.
    expect(store.get().modelRequests?.every((r) => r.photos.every((p) => p.sample === true))).toBe(true)
    // The e2e target: a published, photos-only biz_casa product with dimensions and no request.
    const target = store.get().products.find((p) => p.slug === DEMO_REQUEST_TARGET_SLUG)!
    expect(target).toMatchObject({ businessId: 'biz_casa', status: 'published', models: {} })
    expect(target.dimensions.width * target.dimensions.height * target.dimensions.depth).toBeGreaterThan(0)
    expect(page.items.some((r) => r.productId === target.id)).toBe(false)
    // Open: oldest first; every other view newest first.
    const open = unwrap(await svc.getModelRequests({ status: ['requested', 'in_progress'] })).items
    expect(open.map((r) => r.createdAt)).toEqual([...open.map((r) => r.createdAt)].sort())
    const all = unwrap(await svc.getModelRequests({ status: ALL })).items
    expect(all.map((r) => r.createdAt)).toEqual([...all.map((r) => r.createdAt)].sort().reverse())
  })

  it('a Team actor without models.manage reads no requests', async () => {
    asStaff('team')
    expect(unwrap(await svc.getModelRequests())).toEqual({ items: [], total: 0 })
    expect(unwrap(await svc.getProductRequestStates('biz_casa'))).toEqual({})
  })

  it("an owner reads only their business's", async () => {
    asOwner('biz_nord')
    expect(unwrap(await svc.getModelRequests()).total).toBe(0)
    expect(unwrap(await svc.getModelRequests({ businessId: 'biz_casa' })).total).toBe(0)
    asOwner('biz_casa')
    expect(unwrap(await svc.getModelRequests()).total).toBe(4)
    const states = unwrap(await svc.getProductRequestStates('biz_casa'))
    expect(Object.values(states).some((s) => s.open === 'requested')).toBe(true)
    expect(Object.values(states).some((s) => s.open === 'in_progress')).toBe(true)
  })

  it('setBusinessOwnModels needs models.manage and writes business_own_models_changed', async () => {
    asStaff('team')
    const refused = await svc.setBusinessOwnModels('biz_casa', true)
    expect(refused.ok === false && refused.error.reason).toBe('forbidden')
    asOwner('biz_casa')
    expect((await svc.setBusinessOwnModels('biz_casa', true)).ok).toBe(false)
    expect(unwrap(await svc.getBusinessById('biz_casa')).allowOwnModels).toBe(false)

    asStaff('owner')
    expect(unwrap(await svc.setBusinessOwnModels('biz_casa', true)).allowOwnModels).toBe(true)
    const row = store.get().audit?.[0]
    expect(row).toMatchObject({ eventType: 'business_own_models_changed', businessId: 'biz_casa', metadata: { from: false, to: true, actor_label: 'Owner' } })
    const missing = await svc.setBusinessOwnModels('biz_gone', true)
    expect(missing.ok === false && missing.error.code).toBe('NOT_FOUND')
  })

  it('resetDemoData restores the four requests and the two switch states', async () => {
    asStaff('owner')
    unwrap(await svc.setBusinessOwnModels('biz_casa', true))
    unwrap(await svc.setBusinessOwnModels('biz_nord', false))
    store.update((d) => void (d.modelRequests = []))
    sessionRequestMedia.photos.set('x', ['blob:x'])
    unwrap(await svc.resetDemoData())
    expect(unwrap(await svc.getModelRequests({ businessId: 'biz_casa' })).total).toBe(4)
    const biz = unwrap(await svc.getBusinesses())
    expect(Object.fromEntries(biz.map((b) => [b.id, b.allowOwnModels]))).toEqual({ biz_casa: false, biz_nord: true, biz_verde: false, biz_oak: false })
    expect(sessionRequestMedia.photos.size).toBe(0)
  })
})
