// Supabase reads of 3D model requests and the allow-own-upload switch (S4 R-S4-2, R-S4-10). Plain selects under RLS
// (a business owner reads their own business's requests, staff need models.manage); the switch changes only through
// admin_set_own_models. Every failure is an error Result, never sample data.
import type { SupabaseClient } from '@supabase/supabase-js'
import { OPEN_REQUEST_STATUSES, type ModelRequest, type ModelRequestStatus, type ProductRequestState } from '@/domain/modelRequests'
import type { ID, LocalizedText } from '@/domain/types'
import { type CatalogService, MEDIA_URL_TTL_SECONDS, type Result, fail, ok } from '../catalogService'
import { modelRequestError } from '../modelRequestRules'
import { type BusinessRow, MEDIA_BUCKET, mapDbError, toBusiness } from './supabaseCatalogService'

type ReadMethods = Pick<CatalogService, 'getModelRequests' | 'getProductRequestStates' | 'setBusinessOwnModels'>
type DbError = { code?: string; message: string }

const PAGE_SIZE = 50
export const MODEL_REQUEST_SELECT =
  '*, products(name, product_images(storage_path, is_primary)), businesses(name), product_variants(name), model_request_photos(count)'

export interface ModelRequestRow {
  id: string
  business_id: string
  product_id: string
  variant_id: string | null
  status: ModelRequestStatus
  note: string | null
  reason: string | null
  requested_by: string | null
  handled_by: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  delivered_at: string | null
  closed_at: string | null
  products?: { name: LocalizedText; product_images?: { storage_path: string | null; is_primary: boolean }[] } | null
  businesses?: { name: string } | null
  product_variants?: { name: LocalizedText } | null
  model_request_photos?: { count: number }[]
}

/**
 * Maps a model request refusal: the S4 copy first (including `invalid_transition` and `reason_required`, which the
 * shared map keeps for application review), then mapDbError. `option`: the request was for one of the product's options.
 */
export function mapModelRequestError<T>(e: DbError, ctx?: { option?: boolean }): Result<T> {
  const known = modelRequestError(e.message, ctx)
  if (known) {
    if (import.meta.env.DEV) console.error('[supabase]', e.code, e.message)
    return { ok: false, error: known }
  }
  return mapDbError(e)
}

const primaryPath = (r: ModelRequestRow): string | undefined => {
  const imgs = (r.products?.product_images ?? []).filter((i) => i.storage_path)
  return (imgs.find((i) => i.is_primary) ?? imgs[0])?.storage_path ?? undefined
}

export function toModelRequest(r: ModelRequestRow, signed: Map<string, string> = new Map()): ModelRequest {
  const path = primaryPath(r)
  const photoUrl = path ? signed.get(path) : undefined
  return {
    id: r.id,
    businessId: r.business_id,
    productId: r.product_id,
    ...(r.variant_id ? { variantId: r.variant_id } : {}),
    status: r.status,
    ...(r.note ? { note: r.note } : {}),
    ...(r.reason ? { reason: r.reason } : {}),
    ...(r.requested_by ? { requestedBy: r.requested_by } : {}),
    ...(r.handled_by ? { handledBy: r.handled_by } : {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(r.started_at ? { startedAt: r.started_at } : {}),
    ...(r.delivered_at ? { deliveredAt: r.delivered_at } : {}),
    ...(r.closed_at ? { closedAt: r.closed_at } : {}),
    photoCount: r.model_request_photos?.[0]?.count ?? 0,
    productName: r.products?.name ?? { en: '' },
    businessName: r.businesses?.name ?? '',
    ...(r.product_variants ? { variantName: r.product_variants.name } : {}),
    ...(photoUrl ? { productPhotoUrl: photoUrl } : {}),
  }
}

export function createSupabaseModelRequestsRead(sb: SupabaseClient, notify: () => void): ReadMethods {
  const guard = async <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
    try {
      return await fn()
    } catch {
      return fail('UNKNOWN', 'The request could not be completed. Try again in a moment.')
    }
  }

  return {
    getModelRequests: (query = {}) =>
      guard(async () => {
        const size = query.pageSize ?? PAGE_SIZE
        const page = Math.max(1, query.page ?? 1)
        const statuses = query.status
        // The Open tab reads oldest first (the next to start); every other view newest first.
        const openOnly = !!statuses?.length && statuses.every((s) => OPEN_REQUEST_STATUSES.includes(s))
        let q = sb.from('model_requests').select(MODEL_REQUEST_SELECT, { count: 'exact' })
        if (query.businessId) q = q.eq('business_id', query.businessId)
        if (query.productId) q = q.eq('product_id', query.productId)
        if (statuses?.length) q = q.in('status', statuses)
        const { data, error, count } = await q
          .order('created_at', { ascending: openOnly })
          .range((page - 1) * size, page * size - 1)
          .returns<ModelRequestRow[]>()
        if (error) return mapModelRequestError(error)
        const rows = data ?? []
        const paths = [...new Set(rows.map(primaryPath).filter((p): p is string => !!p))]
        const signed = new Map<string, string>()
        if (paths.length) {
          // A signing failure leaves the photo out; the queue then shows its placeholder.
          const res = await sb.storage.from(MEDIA_BUCKET).createSignedUrls(paths, MEDIA_URL_TTL_SECONDS)
          for (const d of res.data ?? []) if (d.path && d.signedUrl) signed.set(d.path, d.signedUrl)
        }
        return ok({ items: rows.map((r) => toModelRequest(r, signed)), total: count ?? rows.length })
      }),

    getProductRequestStates: (businessId) =>
      guard(async () => {
        const { data, error } = await sb
          .from('model_requests')
          .select('product_id, status, created_at, closed_at')
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })
          .returns<{ product_id: string; status: ModelRequestStatus; created_at: string; closed_at: string | null }[]>()
        if (error) return mapModelRequestError(error)
        const out: Record<ID, ProductRequestState> = {}
        for (const r of data ?? []) {
          const state = (out[r.product_id] ??= {})
          if (r.status === 'requested' || r.status === 'in_progress') state.open ??= r.status
          else if (!state.latestClosed) state.latestClosed = r.status
        }
        return ok(out)
      }),

    setBusinessOwnModels: (businessId, allow) =>
      guard(async () => {
        const res = await sb.rpc('admin_set_own_models', { p_business: businessId, p_allow: allow })
        if (res.error) return mapModelRequestError(res.error)
        notify()
        const { data, error } = await sb.from('businesses').select('*').eq('id', businessId).maybeSingle<BusinessRow>()
        if (error) return mapDbError(error)
        return data ? ok(toBusiness(data)) : fail('NOT_FOUND', 'Business not found.')
      }),
  }
}
