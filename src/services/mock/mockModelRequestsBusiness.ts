// Demo business-side 3D model request calls (S4 R-S4-6, R-S4-8, R-S4-19). The same checks, in the same order and with
// the same keys, as request_model and cancel_model_request. Picked photos are session-only object URLs
// (sessionRequestMedia; ADR-0007: localStorage can't hold ten originals): the stored photo rows say sessionOnly.
import { OPEN_REQUEST_STATUSES, type ModelRequestPhoto, REQUEST_PHOTOS_MAX, REQUEST_PHOTOS_MIN, REQUEST_TEXT_MAX } from '@/domain/modelRequests'
import { REQUEST_PHOTO_RULES, validateImageFile } from '@/lib/files'
import { type CatalogService, type Result, fail, ok, teamFail } from '../catalogService'
import { modelRequestError } from '../modelRequestRules'
import type { DemoModelRequest } from './db'
import { type MockModelRequestDeps, mockActor, sessionRequestMedia } from './mockModelRequestShared'
import { toModelRequest } from './mockModelRequestsRead'
import { store } from './store'

type BusinessMethods = Pick<CatalogService, 'requestModel' | 'cancelModelRequest'>

/** The demo business owner (the seed's requestedBy). */
const DEMO_OWNER_ACTOR_ID = 'demo-business-owner'
const EXT_BY_TYPE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

function refuse<T>(key: string, ctx?: { option?: boolean }): Result<T> {
  const e = modelRequestError(key, ctx)
  return e ? { ok: false, error: e } : fail('UNKNOWN', 'Something went wrong. Try again.')
}

function objectUrl(file: File): string {
  try {
    if (typeof URL.createObjectURL === 'function') return URL.createObjectURL(file)
  } catch {
    // jsdom or an unreadable file: a placeholder
  }
  return 'blob:demo-request-photo'
}

function revoke(url: string): void {
  try {
    if (url.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
  } catch {
    // best effort
  }
}

export function createMockModelRequestsBusiness({ run, audit }: MockModelRequestDeps): BusinessMethods {
  return {
    requestModel: (input, onProgress) =>
      run(() => {
        const db = store.get()
        const product = db.products.find((p) => p.id === input.productId)
        const actor = mockActor()
        // 1. A member of the product's business.
        if (!product || actor.kind !== 'owner' || actor.businessId !== product.businessId) return teamFail('forbidden')
        // 2. The option belongs to the product. 3. Dimensions. 4. One open request per target.
        if (input.variantId && !product.variants.some((v) => v.id === input.variantId)) return refuse('model_request_target_invalid')
        const d = product.dimensions
        if (!(d.width > 0 && d.height > 0 && d.depth > 0)) return refuse('model_request_needs_dimensions')
        const open = (db.modelRequests ?? []).some(
          (r) => r.productId === product.id && (r.variantId ?? null) === (input.variantId ?? null) && OPEN_REQUEST_STATUSES.includes(r.status),
        )
        if (open) return refuse('model_request_open', { option: !!input.variantId })
        // 5. 2 to 10 photos, each a JPG, PNG or WebP up to 10 MB (the bucket's rules). 6. The note.
        if (input.photos.length < REQUEST_PHOTOS_MIN || input.photos.length > REQUEST_PHOTOS_MAX) return refuse('model_request_photos_count')
        for (const file of input.photos) {
          const check = validateImageFile(file, REQUEST_PHOTO_RULES)
          if (!check.ok) return fail('VALIDATION', check.message)
        }
        const note = input.note?.trim() || undefined
        if (note && note.length > REQUEST_TEXT_MAX) return refuse('model_request_note_too_long')

        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        const urls: string[] = []
        const photos: ModelRequestPhoto[] = input.photos.map((file, i) => {
          onProgress?.(i, 'uploading')
          urls.push(objectUrl(file))
          onProgress?.(i, 'done')
          const ext = EXT_BY_TYPE[file.type] ?? 'jpg'
          return { storagePath: `${product.businessId}/${id}/${crypto.randomUUID()}.${ext}`, fileName: file.name.slice(0, 255), sizeBytes: file.size, sessionOnly: true }
        })
        sessionRequestMedia.photos.set(id, urls)
        const request: DemoModelRequest = {
          id,
          businessId: product.businessId,
          productId: product.id,
          ...(input.variantId ? { variantId: input.variantId } : {}),
          status: 'requested',
          ...(note ? { note } : {}),
          requestedBy: DEMO_OWNER_ACTOR_ID,
          createdAt: now,
          updatedAt: now,
          photos,
        }
        store.update((next) => {
          next.modelRequests = [request, ...(next.modelRequests ?? [])]
          audit(next, {
            eventType: 'model_request_created',
            businessId: product.businessId,
            metadata: { request_id: id, product_id: product.id, variant_id: input.variantId ?? null },
          })
        })
        return ok(toModelRequest(store.get(), request))
      }),

    cancelModelRequest: (id) =>
      run(() => {
        const actor = mockActor()
        const current = (store.get().modelRequests ?? []).find((r) => r.id === id)
        if (!current || actor.kind !== 'owner' || actor.businessId !== current.businessId) return refuse('model_request_not_found')
        if (current.status !== 'requested') return refuse('model_request_not_cancellable')
        const now = new Date().toISOString()
        store.update((next) => {
          next.modelRequests = (next.modelRequests ?? []).map((r) => (r.id === id ? { ...r, status: 'cancelled', closedAt: now, updatedAt: now } : r))
          audit(next, {
            eventType: 'model_request_cancelled',
            businessId: current.businessId,
            metadata: { request_id: id, product_id: current.productId, variant_id: current.variantId ?? null },
          })
        })
        // Cancelling deletes the photos (R-S4-8).
        for (const u of sessionRequestMedia.photos.get(id) ?? []) revoke(u)
        sessionRequestMedia.photos.delete(id)
        return ok({ status: 'cancelled' as const })
      }),
  }
}
