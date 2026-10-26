// Supabase business-side 3D model request calls (S4 R-S4-6, R-S4-8). Upload on send: the photos go to the private
// bucket under {business}/{request id}/ only when the owner sends, then request_model checks every rule. If anything
// fails, the uploaded photos are removed so an abandoned send leaves no files.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ModelRequest } from '@/domain/modelRequests'
import { type CatalogService, type Result, fail, ok } from '../catalogService'
import { MODEL_REQUEST_ERRORS } from '../modelRequestRules'
import { MODEL_REQUEST_SELECT, type ModelRequestRow, mapModelRequestError, toModelRequest } from './modelRequestsRead'

type BusinessMethods = Pick<CatalogService, 'requestModel' | 'cancelModelRequest'>

export const REQUEST_PHOTO_BUCKET = 'model-request-photos'
const FILE_NAME_MAX = 255

const EXT_BY_TYPE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** The stored extension: from the type (JPEG is `jpg`), else from the name. */
function extensionOf(file: File): string {
  const byType = EXT_BY_TYPE[file.type]
  if (byType) return byType
  const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
  return ext === 'jpeg' ? 'jpg' : ext
}

export function createSupabaseModelRequestsBusiness(sb: SupabaseClient, notify: () => void): BusinessMethods {
  const guard = async <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
    try {
      return await fn()
    } catch {
      return fail('UNKNOWN', 'The request could not be completed. Try again in a moment.')
    }
  }
  /** Best effort; false when the removal failed. */
  const removePhotos = async (paths: string[]): Promise<boolean> => {
    if (!paths.length) return true
    try {
      const { error } = await sb.storage.from(REQUEST_PHOTO_BUCKET).remove(paths)
      return !error
    } catch {
      return false
    }
  }

  return {
    requestModel: (input, onProgress) =>
      guard(async () => {
        const id = crypto.randomUUID()
        const uploaded: { storage_path: string; file_name: string; size_bytes: number }[] = []
        try {
          for (const [i, file] of input.photos.entries()) {
            onProgress?.(i, 'uploading')
            const path = `${input.businessId}/${id}/${crypto.randomUUID()}.${extensionOf(file)}`
            const { error } = await sb.storage.from(REQUEST_PHOTO_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false })
            // Storage text is never shown; the fixed copy says what to do.
            if (error) {
              await removePhotos(uploaded.map((p) => p.storage_path))
              return { ok: false, error: { ...MODEL_REQUEST_ERRORS.model_request_photo_missing! } }
            }
            uploaded.push({ storage_path: path, file_name: file.name.slice(0, FILE_NAME_MAX), size_bytes: file.size })
            onProgress?.(i, 'done')
          }
        } catch (e) {
          await removePhotos(uploaded.map((p) => p.storage_path))
          throw e
        }

        const { error } = await sb.rpc('request_model', {
          p_request_id: id,
          p_product: input.productId,
          p_variant: input.variantId ?? null,
          p_note: input.note?.trim() ? input.note : null,
          p_photos: uploaded,
        })
        if (error) {
          await removePhotos(uploaded.map((p) => p.storage_path))
          return mapModelRequestError(error, { option: !!input.variantId })
        }
        notify()

        // The request is sent; a failed read-back still reports success with what is known.
        const now = new Date().toISOString()
        const fallback: ModelRequest = {
          id,
          businessId: input.businessId,
          productId: input.productId,
          ...(input.variantId ? { variantId: input.variantId } : {}),
          status: 'requested',
          ...(input.note?.trim() ? { note: input.note.trim() } : {}),
          createdAt: now,
          updatedAt: now,
          photoCount: uploaded.length,
          productName: { en: '' },
          businessName: '',
        }
        try {
          const { data } = await sb.from('model_requests').select(MODEL_REQUEST_SELECT).eq('id', id).maybeSingle<ModelRequestRow>()
          return ok(data ? toModelRequest(data) : fallback)
        } catch {
          return ok(fallback)
        }
      }),

    cancelModelRequest: (id) =>
      guard(async () => {
        const { data, error } = await sb.rpc('cancel_model_request', { p_request: id })
        if (error) return mapModelRequestError(error)
        notify()
        const paths = ((data as { photo_paths?: string[] } | null)?.photo_paths ?? []).filter((p) => typeof p === 'string')
        const cleaned = await removePhotos(paths)
        return ok(cleaned ? { status: 'cancelled' as const } : { status: 'cancelled' as const, cleanup: 'partial' as const })
      }),
  }
}
