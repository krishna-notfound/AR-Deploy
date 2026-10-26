import { beforeEach, describe, expect, it } from 'vitest'
import type { ModelAsset, ModelFormat } from '@/domain/types'
import type { Result } from '../catalogService'
import { mockCatalogService as svc } from './mockCatalogService'
import { sessionRequestMedia } from './mockModelRequestShared'
import { store } from './store'

const ACCOUNT_KEY = 'arfurn:account'
const asStaff = (platformRole: 'owner' | 'admin' | 'team') => localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole }))
const asOwner = (businessId: string) => localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'business_admin', businessId }))

/** Seeded Casa Lisboa requests (seed.ts). */
const REQUESTED = 'mrq_bookcase'
const IN_PROGRESS = 'mrq_table'
const DELIVERED = 'mrq_glam_sofa'

const reason = (r: Result<unknown>) => (r.ok ? 'ok' : r.error.reason)
const asset = (format: ModelFormat, name = `m.${format}`): ModelAsset => ({ format, url: `blob:demo/${name}`, fileName: name, sizeBytes: 10, status: 'session-only' })
const request = (id: string) => store.get().modelRequests!.find((r) => r.id === id)!
const product = (id: string) => store.get().products.find((p) => p.id === id)!

beforeEach(async () => {
  localStorage.clear()
  await svc.resetDemoData()
})

describe('S4 Task 6: demo staff model request calls', () => {
  it('the PGlite keys by name: forbidden without models.manage; not found; invalid_transition; model_request_needs_glb; reason_required', async () => {
    asStaff('team')
    for (const r of [
      await svc.startModelRequest(REQUESTED),
      await svc.stageModelFile(IN_PROGRESS, 'glb', asset('glb')),
      await svc.unstageModelFile(IN_PROGRESS, 'glb'),
      await svc.deliverModelRequest(IN_PROGRESS),
      await svc.rejectModelRequest(IN_PROGRESS, 'Too dark'),
    ])
      expect(reason(r)).toBe('forbidden')
    // Reads follow the row policy: a request the actor can't read doesn't exist for them.
    expect(reason(await svc.getModelRequest(IN_PROGRESS))).toBe('model_request_not_found')

    asStaff('admin')
    expect(reason(await svc.startModelRequest('mrq_nope'))).toBe('model_request_not_found')
    expect(reason(await svc.startModelRequest(IN_PROGRESS))).toBe('invalid_transition')
    expect(reason(await svc.deliverModelRequest(REQUESTED))).toBe('invalid_transition')
    expect(reason(await svc.deliverModelRequest(IN_PROGRESS))).toBe('model_request_needs_glb')
    expect(reason(await svc.stageModelFile(DELIVERED, 'glb', asset('glb')))).toBe('invalid_transition')
    expect(reason(await svc.rejectModelRequest(IN_PROGRESS, '   '))).toBe('reason_required')
    expect(reason(await svc.rejectModelRequest(IN_PROGRESS, 'x'.repeat(1001)))).toBe('reason_required')
    expect(reason(await svc.rejectModelRequest(DELIVERED, 'Too dark'))).toBe('invalid_transition')

    expect(await svc.startModelRequest(REQUESTED)).toEqual({ ok: true, data: { status: 'in_progress' } })
    expect(request(REQUESTED)).toMatchObject({ status: 'in_progress', startedAt: expect.any(String) })
    expect(store.get().audit?.some((e) => e.eventType === 'model_request_started' && e.metadata.request_id === REQUESTED)).toBe(true)
  })

  it('staging a requested request starts it; staging again replaces the file; unstage removes it', async () => {
    asStaff('owner')
    expect(await svc.stageModelFile(REQUESTED, 'glb', asset('glb', 'a.glb'))).toEqual({ ok: true, data: {} })
    expect(request(REQUESTED).status).toBe('in_progress')
    await svc.stageModelFile(REQUESTED, 'glb', asset('glb', 'b.glb'))
    const detail = await svc.getModelRequest(REQUESTED)
    if (!detail.ok) throw new Error(detail.error.message)
    expect(detail.data.staged.glb?.fileName).toBe('b.glb')
    expect(await svc.unstageModelFile(REQUESTED, 'glb')).toEqual({ ok: true, data: {} })
    expect(sessionRequestMedia.staged.get(REQUESTED)?.glb).toBeUndefined()
  })

  it("deliver replaces the whole set on the target, staged models are session-only, and email is {status:'demo'}", async () => {
    asStaff('owner')
    const target = request(IN_PROGRESS).productId
    store.update((d) => {
      d.products = d.products.map((p) => (p.id === target ? { ...p, models: { glb: asset('glb', 'old.glb'), usdz: asset('usdz', 'old.usdz') } } : p))
    })
    const glb = asset('glb', 'new.glb')
    await svc.stageModelFile(IN_PROGRESS, 'glb', glb)
    // Staged files live in this session only, never in the stored demo data.
    expect(JSON.stringify(store.get().modelRequests)).not.toContain('new.glb')
    expect(await svc.deliverModelRequest(IN_PROGRESS)).toEqual({ ok: true, data: { status: 'delivered', email: { status: 'demo' } } })
    expect(product(target).models).toEqual({ glb })
    expect(product(target).modelsChangedAt).toEqual(expect.any(String))
    expect(request(IN_PROGRESS)).toMatchObject({ status: 'delivered', deliveredAt: expect.any(String), closedAt: expect.any(String) })
    expect(sessionRequestMedia.staged.has(IN_PROGRESS)).toBe(false)
    const audit = store.get().audit?.find((e) => e.eventType === 'model_request_delivered' && e.metadata.request_id === IN_PROGRESS)
    expect(audit?.metadata).toMatchObject({ formats: ['glb'], target: 'product' })
  })

  it("an option target gets the files; the product's own set is untouched", async () => {
    asStaff('owner')
    const p = store.get().products.find((x) => x.businessId === 'biz_casa' && x.variants.length > 0)!
    const v = p.variants[0]!
    const id = 'mrq_option_test'
    store.update((d) => {
      d.modelRequests!.push({ id, businessId: 'biz_casa', productId: p.id, variantId: v.id, status: 'in_progress', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), startedAt: new Date().toISOString(), photos: [] })
    })
    const before = product(p.id).models
    await svc.stageModelFile(id, 'glb', asset('glb', 'option.glb'))
    await svc.stageModelFile(id, 'usdz', asset('usdz', 'option.usdz'))
    expect(await svc.deliverModelRequest(id)).toMatchObject({ ok: true })
    expect(product(p.id).models).toEqual(before)
    expect(product(p.id).variants.find((x) => x.id === v.id)?.models).toEqual({ glb: asset('glb', 'option.glb'), usdz: asset('usdz', 'option.usdz') })
  })

  it('decline keeps the trimmed reason, drops the staged files, audits has_reason only and sends no email', async () => {
    asStaff('admin')
    await svc.stageModelFile(IN_PROGRESS, 'glb', asset('glb'))
    expect(await svc.rejectModelRequest(IN_PROGRESS, '  Too dark.  ')).toEqual({ ok: true, data: { status: 'rejected', email: { status: 'demo' } } })
    expect(request(IN_PROGRESS)).toMatchObject({ status: 'rejected', reason: 'Too dark.', closedAt: expect.any(String) })
    expect(sessionRequestMedia.staged.has(IN_PROGRESS)).toBe(false)
    const audit = store.get().audit?.find((e) => e.eventType === 'model_request_rejected' && e.metadata.request_id === IN_PROGRESS)
    expect(audit?.metadata).toMatchObject({ has_reason: true })
    expect(JSON.stringify(audit?.metadata)).not.toContain('Too dark')
  })

  it('getModelRequest: staff see staged files, sample photos and a history; the owner never sees staged files; unknown → not found', async () => {
    asStaff('owner')
    await svc.stageModelFile(IN_PROGRESS, 'glb', asset('glb'))
    const staff = await svc.getModelRequest(IN_PROGRESS)
    if (!staff.ok) throw new Error(staff.error.message)
    expect(staff.data.staged.glb).toBeDefined()
    expect(staff.data.photos.length).toBeGreaterThanOrEqual(2)
    expect(staff.data.photos.every((p) => p.sample)).toBe(true)
    expect(staff.data.product.id).toBe(request(IN_PROGRESS).productId)
    expect(staff.data.history.map((e) => e.type)).toEqual(['model_request_created', 'model_request_started'])
    asOwner('biz_casa')
    const owner = await svc.getModelRequest(IN_PROGRESS)
    expect(owner.ok && owner.data.staged).toEqual({})
    asOwner('biz_nord')
    expect(reason(await svc.getModelRequest(IN_PROGRESS))).toBe('model_request_not_found')
  })
})
