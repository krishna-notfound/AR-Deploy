import { beforeEach, describe, expect, it } from 'vitest'
import type { Product } from '@/domain/types'
import type { Result } from '../catalogService'
import { mockCatalogService as svc } from './mockCatalogService'
import { sessionRequestMedia } from './mockModelRequestShared'
import { DEMO_REQUEST_TARGET_SLUG } from './seed'
import { store } from './store'

const ACCOUNT_KEY = 'arfurn:account'
const asOwner = (businessId: string) => localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'business_admin', businessId }))
const asStaff = () => localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'owner' }))

const photo = (name = 'a.jpg', type = 'image/jpeg', size = 1000) => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}
const photos = (n: number) => Array.from({ length: n }, (_, i) => photo(`p${i + 1}.jpg`))
const reason = <T,>(r: Result<T>) => (r.ok ? 'ok' : r.error.reason)

let target: Product
beforeEach(async () => {
  localStorage.clear()
  await svc.resetDemoData()
  target = store.get().products.find((p) => p.slug === DEMO_REQUEST_TARGET_SLUG)!
  asOwner(target.businessId)
})

const send = (over: Partial<{ productId: string; variantId: string; note: string; photos: File[] }> = {}) =>
  svc.requestModel({ businessId: target.businessId, productId: target.id, photos: photos(2), ...over })

describe('S4 Task 4: demo requestModel and cancelModelRequest', () => {
  it('refuses 1 and 11 photos, a GIF, a photo over 10 MB, a product without depth, an option of another product and a 1001-character note, with the database keys', async () => {
    expect(reason(await send({ photos: photos(1) }))).toBe('model_request_photos_count')
    expect(reason(await send({ photos: photos(11) }))).toBe('model_request_photos_count')
    const gif = await send({ photos: [photo('a.gif', 'image/gif'), photo()] })
    expect(gif).toMatchObject({ ok: false, error: { code: 'VALIDATION', message: expect.stringContaining('a.gif') } })
    const big = await send({ photos: [photo('big.jpg', 'image/jpeg', 12 * 1024 * 1024), photo()] })
    expect(big).toMatchObject({ ok: false, error: { code: 'VALIDATION', message: expect.stringContaining('big.jpg') } })
    expect(reason(await send({ variantId: 'var_not_this_product' }))).toBe('model_request_target_invalid')
    expect(reason(await send({ note: 'x'.repeat(1001) }))).toBe('model_request_note_too_long')
    store.update((d) => {
      d.products = d.products.map((p) => (p.id === target.id ? { ...p, dimensions: { ...p.dimensions, depth: 0 } } : p))
    })
    expect(reason(await send())).toBe('model_request_needs_dimensions')
    expect(store.get().modelRequests?.filter((r) => r.productId === target.id)).toEqual([])
  })

  it('refuses staff and owners of another business with forbidden', async () => {
    asStaff()
    expect(reason(await send())).toBe('forbidden')
    asOwner('biz_nord')
    expect(reason(await send())).toBe('forbidden')
  })

  it('a second open request for the same target → model_request_open; another option → allowed; after the first is cancelled → allowed', async () => {
    const withOption = store.get().products.find((p) => p.businessId === target.businessId && p.variants.length > 0 && p.dimensions.depth > 0
      && !store.get().modelRequests?.some((r) => r.productId === p.id && (r.status === 'requested' || r.status === 'in_progress')))!
    const first = await send()
    expect(first).toMatchObject({ ok: true, data: { status: 'requested', productId: target.id, photoCount: 2 } })
    expect(reason(await send())).toBe('model_request_open')
    const onProduct = await svc.requestModel({ businessId: target.businessId, productId: withOption.id, photos: photos(2) })
    expect(onProduct.ok).toBe(true)
    const onOption = await svc.requestModel({ businessId: target.businessId, productId: withOption.id, variantId: withOption.variants[0]!.id, photos: photos(2) })
    expect(onOption).toMatchObject({ ok: true, data: { variantId: withOption.variants[0]!.id } })
    const again = await svc.requestModel({ businessId: target.businessId, productId: withOption.id, variantId: withOption.variants[0]!.id, photos: photos(2) })
    expect(again).toMatchObject({ ok: false, error: { reason: 'model_request_open', message: 'This option already has an open 3D model request.' } })
    if (!first.ok) throw new Error('first failed')
    expect(await svc.cancelModelRequest(first.data.id)).toEqual({ ok: true, data: { status: 'cancelled' } })
    expect((await send()).ok).toBe(true)
  })

  it('photos are session-only object URLs and the request carries sessionOnly; progress is reported per photo; one audit row', async () => {
    const progress: [number, string][] = []
    const r = await svc.requestModel({ businessId: target.businessId, productId: target.id, note: 'Oak legs', photos: photos(3) }, (i, s) => progress.push([i, s]))
    if (!r.ok) throw new Error(r.error.message)
    expect(progress).toEqual([[0, 'uploading'], [0, 'done'], [1, 'uploading'], [1, 'done'], [2, 'uploading'], [2, 'done']])
    const stored = store.get().modelRequests!.find((x) => x.id === r.data.id)!
    expect(stored).toMatchObject({ status: 'requested', note: 'Oak legs', businessId: target.businessId })
    expect(stored.photos).toHaveLength(3)
    expect(stored.photos.every((p) => p.sessionOnly === true && !p.url && p.storagePath.startsWith(`${target.businessId}/${r.data.id}/`))).toBe(true)
    expect(sessionRequestMedia.photos.get(r.data.id)).toHaveLength(3)
    expect(store.get().audit?.filter((e) => e.eventType === 'model_request_created' && e.metadata.request_id === r.data.id)).toHaveLength(1)
  })

  it('cancel: only while requested (in progress → model_request_not_cancellable, unchanged); an unknown or other business request → model_request_not_found', async () => {
    const sent = await send()
    if (!sent.ok) throw new Error(sent.error.message)
    asOwner('biz_nord')
    expect(reason(await svc.cancelModelRequest(sent.data.id))).toBe('model_request_not_found')
    asOwner(target.businessId)
    expect(reason(await svc.cancelModelRequest('mrq_unknown'))).toBe('model_request_not_found')
    expect(await svc.cancelModelRequest(sent.data.id)).toEqual({ ok: true, data: { status: 'cancelled' } })
    const cancelled = store.get().modelRequests!.find((x) => x.id === sent.data.id)!
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.closedAt).toBeTruthy()
    expect(sessionRequestMedia.photos.has(sent.data.id)).toBe(false)
    expect(store.get().audit?.filter((e) => e.eventType === 'model_request_cancelled' && e.metadata.request_id === sent.data.id)).toHaveLength(1)
    expect(reason(await svc.cancelModelRequest(sent.data.id))).toBe('model_request_not_cancellable')

    const before = store.get().modelRequests!.find((x) => x.id === 'mrq_table')!
    expect(reason(await svc.cancelModelRequest('mrq_table'))).toBe('model_request_not_cancellable')
    expect(store.get().modelRequests!.find((x) => x.id === 'mrq_table')).toEqual(before)
  })
})
