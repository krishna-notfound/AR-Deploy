// Demo reads of 3D model requests and the allow-own-upload switch (S4 R-S4-2, R-S4-10, R-S4-19). Same visibility as
// the database: a business owner reads their own business's requests, staff need models.manage.
import { OPEN_REQUEST_STATUSES, type ModelRequest, type ProductRequestState } from '@/domain/modelRequests'
import type { Business, ID } from '@/domain/types'
import { type CatalogService, fail, ok, teamFail } from '../catalogService'
import type { Db, DemoModelRequest } from './db'
import { DEMO_STAFF_ACTOR_ID, type MockModelRequestDeps, actorReads, mockActor } from './mockModelRequestShared'
import { store } from './store'

type ReadMethods = Pick<CatalogService, 'getModelRequests' | 'getProductRequestStates' | 'setBusinessOwnModels'>

const PAGE_SIZE = 50

/** A stored request with the names and photo count the Supabase select embeds. */
export function toModelRequest(db: Db, r: DemoModelRequest): ModelRequest {
  const { photos, ...rest } = r
  const product = db.products.find((p) => p.id === r.productId)
  const variant = r.variantId ? product?.variants.find((v) => v.id === r.variantId) : undefined
  const photo = product?.images.find((i) => i.isPrimary) ?? product?.images[0]
  return {
    ...rest,
    photoCount: photos.length,
    productName: product?.name ?? { en: '' },
    businessName: db.businesses.find((b) => b.id === r.businessId)?.name ?? '',
    ...(variant ? { variantName: variant.name } : {}),
    ...(photo?.url ? { productPhotoUrl: photo.url } : {}),
  }
}

/** The requests the demo actor may read. */
export function readableRequests(db: Db): DemoModelRequest[] {
  const actor = mockActor()
  return (db.modelRequests ?? []).filter((r) => actorReads(actor, r.businessId))
}

export function createMockModelRequestsRead({ run, audit }: MockModelRequestDeps): ReadMethods {
  return {
    getModelRequests: (query = {}) =>
      run(() => {
        const db = store.get()
        const statuses = query.status
        // The Open tab reads oldest first (the next to start); every other view newest first.
        const openOnly = !!statuses?.length && statuses.every((s) => OPEN_REQUEST_STATUSES.includes(s))
        const rows = readableRequests(db)
          .filter((r) => (!query.businessId || r.businessId === query.businessId) && (!query.productId || r.productId === query.productId))
          .filter((r) => !statuses?.length || statuses.includes(r.status))
          .sort((a, b) => (openOnly ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)))
        const size = query.pageSize ?? PAGE_SIZE
        const page = Math.max(1, query.page ?? 1)
        return ok({ items: rows.slice((page - 1) * size, page * size).map((r) => toModelRequest(db, r)), total: rows.length })
      }),

    getProductRequestStates: (businessId) =>
      run(() => {
        const out: Record<ID, ProductRequestState> = {}
        const rows = readableRequests(store.get())
          .filter((r) => r.businessId === businessId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        for (const r of rows) {
          const state = (out[r.productId] ??= {})
          if (r.status === 'requested' || r.status === 'in_progress') state.open ??= r.status
          else if (!state.latestClosed) state.latestClosed = r.status
        }
        return ok(out)
      }),

    setBusinessOwnModels: (businessId, allow) =>
      run(() => {
        const actor = mockActor()
        if (actor.kind !== 'staff' || !actor.can('models.manage')) return teamFail('forbidden')
        const current = store.get().businesses.find((b) => b.id === businessId)
        if (!current) return fail('NOT_FOUND', 'Business not found.')
        const from = current.allowOwnModels === true
        const next: Business = { ...current, allowOwnModels: allow, updatedAt: new Date().toISOString() }
        store.update((d) => {
          d.businesses = d.businesses.map((b) => (b.id === businessId ? next : b))
          if (from !== allow) audit(d, { eventType: 'business_own_models_changed', actorId: DEMO_STAFF_ACTOR_ID, businessId, metadata: { from, to: allow } })
        })
        return ok(next)
      }),
  }
}
