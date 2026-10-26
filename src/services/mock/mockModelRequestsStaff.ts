// Demo staff-side 3D model request calls (S4 R-S4-11 to R-S4-14, R-S4-19). Same rules and error keys as the SQL
// functions: models.manage, the transitions, a staged GLB to deliver, the whole-set replace on the target, a 1 to 1000
// character decline reason. Staged files are session-only (sessionRequestMedia); no email is sent ({status:'demo'}).
import type { ModelRequestDetail, ModelRequestStatus } from '@/domain/modelRequests'
import type { ModelAsset, ModelFormat, ProductModels } from '@/domain/types'
import { type ActorLabel, type CatalogService, type Result, ok } from '../catalogService'
import { modelRequestError } from '../modelRequestRules'
import type { Db, DemoModelRequest } from './db'
import { DEMO_STAFF_ACTOR_ID, type MockModelRequestDeps, actorReads, mockActor, sessionRequestMedia } from './mockModelRequestShared'
import { toModelRequest } from './mockModelRequestsRead'
import { store } from './store'

type StaffMethods = Pick<CatalogService, 'getModelRequest' | 'startModelRequest' | 'stageModelFile' | 'unstageModelFile' | 'deliverModelRequest' | 'rejectModelRequest'>

const refuse = <T>(key: string): Result<T> => ({ ok: false, error: modelRequestError(key)! })
const OPEN: readonly ModelRequestStatus[] = ['requested', 'in_progress']
const REASON_MAX = 1000

/** The demo history: the request's audit rows, plus the steps the seed implies (its sample requests have no rows). */
function historyOf(db: Db, r: DemoModelRequest): ModelRequestDetail['history'] {
  const rows = (db.audit ?? [])
    .filter((e) => e.metadata.request_id === r.id)
    .map((e) => ({ type: e.eventType, at: e.createdAt, ...(typeof e.metadata.actor_label === 'string' ? { actorLabel: e.metadata.actor_label } : {}) }))
  const have = new Set(rows.map((e) => e.type))
  const closing: Partial<Record<ModelRequestStatus, string>> = { delivered: 'model_request_delivered', rejected: 'model_request_rejected', cancelled: 'model_request_cancelled' }
  const implied: { type: string; at?: string; actorLabel?: ActorLabel }[] = [
    { type: 'model_request_created', at: r.createdAt, actorLabel: 'Business owner' },
    { type: 'model_request_started', at: r.startedAt },
    ...(closing[r.status] ? [{ type: closing[r.status]!, at: r.closedAt }] : []),
  ]
  for (const e of implied) if (e.at && !have.has(e.type)) rows.push({ type: e.type, at: e.at, ...(e.actorLabel ? { actorLabel: e.actorLabel } : {}) })
  return rows.sort((a, b) => a.at.localeCompare(b.at))
}

function revoke(asset: ModelAsset | undefined): void {
  try {
    if (asset?.url.startsWith('blob:')) URL.revokeObjectURL(asset.url)
  } catch {
    // best effort
  }
}

export function createMockModelRequestsStaff({ run, audit }: MockModelRequestDeps): StaffMethods {
  /** The gate and the row lock of the SQL functions: models.manage first, then the request. */
  const staffRequest = (id: string): Result<DemoModelRequest> => {
    const actor = mockActor()
    if (actor.kind !== 'staff' || !actor.can('models.manage')) return refuse('forbidden')
    const r = store.get().modelRequests?.find((x) => x.id === id)
    return r ? ok(r) : refuse('model_request_not_found')
  }
  const meta = (r: DemoModelRequest, extra: Record<string, unknown> = {}) => ({ request_id: r.id, product_id: r.productId, variant_id: r.variantId ?? null, ...extra })
  const save = (id: string, patch: Partial<DemoModelRequest>) => (d: Db) => {
    d.modelRequests = (d.modelRequests ?? []).map((x) => (x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x))
  }
  const start = (d: Db, r: DemoModelRequest) => {
    const now = new Date().toISOString()
    save(r.id, { status: 'in_progress', startedAt: now, handledBy: DEMO_STAFF_ACTOR_ID })(d)
    audit(d, { eventType: 'model_request_started', actorId: DEMO_STAFF_ACTOR_ID, businessId: r.businessId, fromStatus: 'requested', toStatus: 'in_progress', metadata: meta(r) })
  }

  return {
    getModelRequest: (id) =>
      run(() => {
        const db = store.get()
        const actor = mockActor()
        const r = db.modelRequests?.find((x) => x.id === id)
        if (!r || !actorReads(actor, r.businessId)) return refuse('model_request_not_found')
        const product = db.products.find((p) => p.id === r.productId)
        if (!product) return refuse('model_request_not_found')
        const session = sessionRequestMedia.photos.get(r.id)
        const history = historyOf(db, r)
        return ok({
          ...toModelRequest(db, r),
          photos: r.photos.map((p, i) => (p.sessionOnly && session?.[i] ? { ...p, url: session[i] } : { ...p })),
          staged: actor.kind === 'staff' ? { ...sessionRequestMedia.staged.get(r.id) } : {},
          product,
          history,
          requestedByLabel: 'Business owner',
        })
      }),

    startModelRequest: (id) =>
      run(() => {
        const r = staffRequest(id)
        if (!r.ok) return r
        if (r.data.status !== 'requested') return refuse('invalid_transition')
        store.update((d) => start(d, r.data))
        return ok({ status: 'in_progress' as const })
      }),

    stageModelFile: (id, format, asset) =>
      run(() => {
        const r = staffRequest(id)
        if (!r.ok) return r
        if (!OPEN.includes(r.data.status)) return refuse('invalid_transition')
        if (asset.format !== format || !asset.url) return refuse('model_request_file_invalid')
        if (r.data.status === 'requested') store.update((d) => start(d, r.data))
        const staged = sessionRequestMedia.staged.get(id) ?? {}
        if (staged[format]?.url !== asset.url) revoke(staged[format])
        sessionRequestMedia.staged.set(id, { ...staged, [format]: asset })
        return ok(undefined)
      }),

    unstageModelFile: (id, format) =>
      run(() => {
        const r = staffRequest(id)
        if (!r.ok) return r
        if (!OPEN.includes(r.data.status)) return refuse('invalid_transition')
        const staged = { ...sessionRequestMedia.staged.get(id) }
        revoke(staged[format])
        delete staged[format]
        sessionRequestMedia.staged.set(id, staged)
        return ok(undefined)
      }),

    deliverModelRequest: (id) =>
      run(() => {
        const r = staffRequest(id)
        if (!r.ok) return r
        if (r.data.status !== 'in_progress') return refuse('invalid_transition')
        const staged = sessionRequestMedia.staged.get(id) ?? {}
        if (!staged.glb) return refuse('model_request_needs_glb')
        // The whole set: a format that is not staged is removed from the target (R-S4-13).
        const models: ProductModels = {}
        for (const f of ['glb', 'usdz'] as ModelFormat[]) if (staged[f]) models[f] = staged[f]
        const now = new Date().toISOString()
        const req = r.data
        store.update((d) => {
          d.products = d.products.map((p) => {
            if (p.id !== req.productId) return p
            const next = req.variantId ? { ...p, variants: p.variants.map((v) => (v.id === req.variantId ? { ...v, models } : v)) } : { ...p, models }
            return { ...next, modelsChangedAt: now, updatedAt: now }
          })
          save(id, { status: 'delivered', deliveredAt: now, closedAt: now, handledBy: DEMO_STAFF_ACTOR_ID })(d)
          audit(d, {
            eventType: 'model_request_delivered', actorId: DEMO_STAFF_ACTOR_ID, businessId: req.businessId, fromStatus: 'in_progress', toStatus: 'delivered',
            metadata: meta(req, { formats: Object.keys(models).sort(), target: req.variantId ? 'option' : 'product' }),
          })
        })
        // The files now belong to the product (still session-only, labelled like any demo 3D upload).
        sessionRequestMedia.staged.delete(id)
        return ok({ status: 'delivered' as const, email: { status: 'demo' as const } })
      }),

    rejectModelRequest: (id, reason) =>
      run(() => {
        const r = staffRequest(id)
        if (!r.ok) return r
        if (!OPEN.includes(r.data.status)) return refuse('invalid_transition')
        const text = (reason ?? '').trim()
        if (text.length < 1 || text.length > REASON_MAX) return refuse('reason_required')
        const req = r.data
        const now = new Date().toISOString()
        store.update((d) => {
          save(id, { status: 'rejected', reason: text, closedAt: now, handledBy: DEMO_STAFF_ACTOR_ID })(d)
          audit(d, { eventType: 'model_request_rejected', actorId: DEMO_STAFF_ACTOR_ID, businessId: req.businessId, fromStatus: req.status, toStatus: 'rejected', metadata: meta(req, { has_reason: true }) })
        })
        for (const a of Object.values(sessionRequestMedia.staged.get(id) ?? {})) revoke(a)
        sessionRequestMedia.staged.delete(id)
        return ok({ status: 'rejected' as const, email: { status: 'demo' as const } })
      }),
  }
}
