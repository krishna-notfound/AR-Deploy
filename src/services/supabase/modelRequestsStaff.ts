// Supabase staff-side 3D model request calls (S4 R-S4-11 to R-S4-14). Start, deliver and decline go through the
// review-model-request Edge Function (it emails the business owner); staging calls the SQL functions directly. Files
// a call replaces are removed from product-media after the database change; a failed removal is reported as
// cleanup 'partial', never as a failed call.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ModelRequestDetail, ModelRequestOutcome, ModelRequestPhoto, ModelRequestStatus, RequestEmailStatus } from '@/domain/modelRequests'
import type { ModelAsset, ModelFormat } from '@/domain/types'
import { type CatalogService, MEDIA_URL_TTL_SECONDS, type Result, fail, ok } from '../catalogService'
import { modelRequestError } from '../modelRequestRules'
import { MODEL_REQUEST_SELECT, type ModelRequestRow, mapModelRequestError, toModelRequest } from './modelRequestsRead'
import { MEDIA_BUCKET, PRODUCT_SELECT, type ProductRow, toProduct } from './supabaseCatalogService'

type StaffMethods = Pick<CatalogService, 'getModelRequest' | 'startModelRequest' | 'stageModelFile' | 'unstageModelFile' | 'deliverModelRequest' | 'rejectModelRequest'>

const REVIEW_FUNCTION = 'review-model-request'
const PHOTO_BUCKET = 'model-request-photos'
/** Request photos are private: their links last one hour (R-S4-11). */
const PHOTO_URL_TTL_SECONDS = 60 * 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ReviewAnswer {
  ok: true
  status: ModelRequestStatus
  replacedPaths?: string[]
  stagedPaths?: string[]
  email?: { status: RequestEmailStatus; error?: string }
}

type DetailRow = Omit<ModelRequestRow, 'model_request_photos'> & {
  photos?: { storage_path: string; file_name: string; size_bytes: number; sort_order: number }[]
  staged?: { format: ModelFormat; storage_path: string; file_name: string; size_bytes: number | null; required_extensions: string[] | null }[]
}

const notFound = <T>(): Result<T> => ({ ok: false, error: modelRequestError('model_request_not_found')! })

export function createSupabaseModelRequestsStaff(sb: SupabaseClient, notify: () => void): StaffMethods {
  const guard = async <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
    try {
      return await fn()
    } catch {
      return fail('UNKNOWN', 'The request could not be completed. Try again in a moment.')
    }
  }

  /** Removes `paths` from product-media; false when the removal failed. */
  const removeMedia = async (paths: (string | null | undefined)[] | undefined): Promise<boolean> => {
    const list = (paths ?? []).filter((p): p is string => !!p)
    if (!list.length) return true
    try {
      const { error } = await sb.storage.from(MEDIA_BUCKET).remove(list)
      return !error
    } catch {
      return false
    }
  }

  /** Calls review-model-request; a non-2xx body `{ error: key }` becomes the S4 copy for that key. */
  const review = async (requestId: string, action: 'start' | 'deliver' | 'reject', reason?: string): Promise<Result<ReviewAnswer>> => {
    if (!UUID.test(requestId)) return notFound()
    const { data, error } = await sb.functions.invoke(REVIEW_FUNCTION, { body: { requestId, action, ...(reason !== undefined ? { reason } : {}) } })
    if (!error) return ok(data as ReviewAnswer)
    const res = (error as { context?: Response }).context
    const payload = res && typeof res.json === 'function' ? ((await res.json().catch(() => ({}))) as { error?: unknown }) : {}
    const known = typeof payload.error === 'string' ? modelRequestError(payload.error) : undefined
    return known ? { ok: false, error: known } : fail('UNKNOWN', 'The request could not be completed. Try again in a moment.')
  }

  const outcome = async (r: Result<ReviewAnswer>, paths: (a: ReviewAnswer) => string[] | undefined): Promise<Result<ModelRequestOutcome>> => {
    if (!r.ok) return r
    notify()
    const removed = await removeMedia(paths(r.data))
    return ok({ status: r.data.status, ...(r.data.email ? { email: r.data.email } : {}), ...(removed ? {} : { cleanup: 'partial' as const }) })
  }

  const signed = async (bucket: string, paths: string[], ttl: number): Promise<Map<string, string>> => {
    const out = new Map<string, string>()
    if (!paths.length) return out
    // A signing failure leaves the URL empty; the page then shows its "couldn't be loaded" state.
    const { data } = await sb.storage.from(bucket).createSignedUrls(paths, ttl)
    for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl)
    return out
  }

  return {
    getModelRequest: (id) =>
      guard(async () => {
        if (!UUID.test(id)) return notFound()
        const select = `${MODEL_REQUEST_SELECT.replace(', model_request_photos(count)', '')}, photos:model_request_photos(storage_path, file_name, size_bytes, sort_order), staged:model_request_files(format, storage_path, file_name, size_bytes, required_extensions)`
        const { data: row, error } = await sb.from('model_requests').select(select).eq('id', id).maybeSingle<DetailRow>()
        if (error) return mapModelRequestError(error)
        if (!row) return notFound()
        const { data: productRow, error: productError } = await sb.from('products').select(PRODUCT_SELECT).eq('id', row.product_id).maybeSingle<ProductRow>()
        if (productError) return mapModelRequestError(productError)
        if (!productRow) return notFound()
        const { data: events, error: eventsError } = await sb
          .from('audit_events')
          .select('event_type, created_at, metadata')
          .eq('metadata->>request_id', id)
          .order('created_at', { ascending: true })
          .returns<{ event_type: string; created_at: string; metadata: Record<string, unknown> | null }[]>()
        if (eventsError) return mapModelRequestError(eventsError)

        const photoRows = [...(row.photos ?? [])].sort((a, b) => a.sort_order - b.sort_order)
        const stagedRows = row.staged ?? []
        const productPaths = [
          ...(productRow.product_images ?? []),
          ...(productRow.product_models ?? []),
          ...(productRow.product_variants ?? []).flatMap((v) => [...(v.product_variant_images ?? []), ...(v.product_variant_models ?? [])]),
        ].flatMap((x) => (x.storage_path ? [x.storage_path] : []))
        const photoUrls = await signed(PHOTO_BUCKET, photoRows.map((p) => p.storage_path), PHOTO_URL_TTL_SECONDS)
        const stagedUrls = await signed(MEDIA_BUCKET, stagedRows.map((s) => s.storage_path), MEDIA_URL_TTL_SECONDS)
        const productUrls = await signed(MEDIA_BUCKET, [...new Set(productPaths)], MEDIA_URL_TTL_SECONDS)

        const photos: ModelRequestPhoto[] = photoRows.map((p) => {
          const url = photoUrls.get(p.storage_path)
          return { storagePath: p.storage_path, fileName: p.file_name, sizeBytes: p.size_bytes, ...(url ? { url } : {}) }
        })
        const staged: Partial<Record<ModelFormat, ModelAsset>> = {}
        for (const s of stagedRows) {
          const url = stagedUrls.get(s.storage_path) ?? ''
          staged[s.format] = {
            format: s.format,
            url,
            fileName: s.file_name,
            ...(s.size_bytes != null ? { sizeBytes: s.size_bytes } : {}),
            status: url ? 'valid' : 'invalid',
            storagePath: s.storage_path,
            ...(s.required_extensions ? { requiredExtensions: s.required_extensions } : {}),
          }
        }
        const history = (events ?? []).map((e) => {
          const label = e.metadata?.actor_label
          return { type: e.event_type, at: e.created_at, ...(typeof label === 'string' ? { actorLabel: label } : {}) }
        })
        const requestedByLabel = history.find((e) => e.type === 'model_request_created')?.actorLabel
        const product = toProduct(productRow, productUrls)
        const detail: ModelRequestDetail = {
          ...toModelRequest({ ...row, model_request_photos: [{ count: photos.length }] }, productUrls),
          photos,
          staged,
          product,
          history,
          ...(requestedByLabel ? { requestedByLabel } : {}),
        }
        return ok(detail)
      }),

    startModelRequest: (id) => guard(async () => outcome(await review(id, 'start'), () => [])),
    deliverModelRequest: (id) => guard(async () => outcome(await review(id, 'deliver'), (a) => a.replacedPaths)),
    rejectModelRequest: (id, reason) => guard(async () => outcome(await review(id, 'reject', reason), (a) => a.stagedPaths)),

    stageModelFile: (id, format, asset) =>
      guard(async () => {
        if (!asset.storagePath) return { ok: false, error: modelRequestError('model_request_file_invalid')! }
        const { data, error } = await sb.rpc('admin_stage_model_file', {
          p_request: id,
          p_format: format,
          p_storage_path: asset.storagePath,
          p_file_name: asset.fileName,
          p_size_bytes: asset.sizeBytes ?? null,
          p_required_extensions: asset.requiredExtensions ?? null,
        })
        if (error) {
          // Review Focus 4: the upload already reached storage; nothing references it now.
          await removeMedia([asset.storagePath])
          return mapModelRequestError(error)
        }
        notify()
        const removed = await removeMedia([(data as { replaced_path?: string | null } | null)?.replaced_path])
        return ok(removed ? {} : { cleanup: 'partial' as const })
      }),

    unstageModelFile: (id, format) =>
      guard(async () => {
        const { data, error } = await sb.rpc('admin_unstage_model_file', { p_request: id, p_format: format })
        if (error) return mapModelRequestError(error)
        notify()
        const removed = await removeMedia([(data as { path?: string | null } | null)?.path])
        return ok(removed ? {} : { cleanup: 'partial' as const })
      }),
  }
}
