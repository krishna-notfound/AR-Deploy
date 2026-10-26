// Request handling for the sync-ar-models Edge Function (owner decision 2026-10-26). Phone AR (Scene Viewer, AR Quick
// Look; ADR-0021) loads the 3D file from a public URL, as main does: the uploads stay in the private product-media
// bucket, and this function keeps a public copy of each PUBLISHED product's GLB/USDZ (and each variant's) in the
// public ar-models bucket, with the copy's URL in product_models / product_variant_models.public_url.
//   POST { productId, businessId? } → { ok: true, copied, removed, failed }
//     published product: copy what is missing, set public_url, delete stale copies in the product's folder.
//     draft or missing product: delete the product's folder and clear public_url. businessId names the folder of a
//     product that no longer exists (deleteProduct).
//   POST { all: true } → the same for every published product; the platform Owner only (one-time backfill).
// The caller's own token answers who may ask (can_sync_ar_models, with the 2FA gates); the service role does the work.
// Only fixed error codes reach the client; nothing logs a token, an address or a URL.
import { type CallerRpc, type GateResult, gateReply } from '../_shared/gate.ts'
import { UUID, bearerToken, readJsonObject, reply } from '../_shared/http.ts'

export const AR_BUCKET = 'ar-models'

export type ModelFormat = 'glb' | 'usdz'
/** One model row: the product's own (variantId null) or a variant's. */
export interface ModelRef {
  variantId: string | null
  format: ModelFormat
  storagePath: string | null
  url: string | null
  publicUrl: string | null
}
export interface SyncProduct {
  id: string
  businessId: string
  status: string
  models: ModelRef[]
}

export interface SyncDeps {
  userIdFromToken(token: string): Promise<string | null>
  /** The caller's own database client (anon key + the caller's token). */
  callerRpc(token: string): CallerRpc
  /** The platform Owner gate (gateCaller(..., 'owner')), for { all: true }. */
  ownerGate(token: string): Promise<GateResult>
  /** Service role: the product with its business, status and every model row; null when it does not exist. */
  product(productId: string): Promise<SyncProduct | null>
  /** Service role: ids of every published product. */
  publishedProductIds(): Promise<string[]>
  /** Every object path in ar-models under `folder` (sub-folders included). */
  listFolder(folder: string): Promise<string[]>
  /** Copies product-media `from` to ar-models `to`, replacing an object already there. Rejects on failure. */
  copy(from: string, to: string, format: ModelFormat): Promise<void>
  remove(paths: string[]): Promise<void>
  publicUrl(path: string): string
  setPublicUrl(productId: string, model: Pick<ModelRef, 'variantId' | 'format'>, url: string | null): Promise<void>
}

/**
 * caller_mfa_satisfied() first (a session that still needs its 2FA step learns only that), then can_sync_ar_models:
 * a business member of the product's business, or staff with products.publish / products.edit. Only `true` passes.
 */
export async function syncGate(rpc: CallerRpc, productId: string, businessId: string | null): Promise<GateResult> {
  if ((await rpc('caller_mfa_satisfied')) !== true) return 'aal2_required'
  return (await rpc('can_sync_ar_models', { p_product: productId, p_business: businessId })) === true ? 'ok' : 'forbidden'
}

const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/

/** ar-models/<business>/<product>/<variant|base>/<format>-<source file id>.<ext>; null for a path it cannot name. */
export function publicPath(product: Pick<SyncProduct, 'id' | 'businessId'>, m: Pick<ModelRef, 'variantId' | 'format' | 'storagePath'>): string | null {
  const file = m.storagePath?.split('/').pop() ?? ''
  const sourceId = file.replace(/\.[^.]*$/, '')
  if (!SAFE_ID.test(sourceId)) return null
  return `${product.businessId}/${product.id}/${m.variantId ?? 'base'}/${m.format}-${sourceId}.${m.format}`
}

const httpsUrl = (u: string | null) => (u && /^https:\/\/[^/]/i.test(u) && u.length <= 2048 ? u : null)

export interface SyncCounts {
  copied: number
  removed: number
  failed: number
}

async function clearFolder(deps: SyncDeps, folder: string): Promise<number> {
  const existing = await deps.listFolder(folder)
  if (existing.length) await deps.remove(existing)
  return existing.length
}

/** Brings one product's public copies in line with its status. */
export async function syncProduct(deps: SyncDeps, productId: string, businessId: string | null): Promise<SyncCounts> {
  const product = await deps.product(productId)
  const owner = product?.businessId ?? businessId
  if (!owner) return { copied: 0, removed: 0, failed: 0 }
  const folder = `${owner}/${productId}`

  if (!product || product.status !== 'published') {
    const removed = await clearFolder(deps, folder)
    for (const m of product?.models ?? []) if (m.publicUrl !== null) await deps.setPublicUrl(productId, m, null)
    return { copied: 0, removed, failed: 0 }
  }

  const existing = new Set(await deps.listFolder(folder))
  const wanted = new Set<string>()
  let copied = 0
  let failed = 0
  for (const m of product.models) {
    let next: string | null
    if (!m.storagePath) {
      next = httpsUrl(m.url) // an external file (a public sample URL) is already public
    } else {
      const target = publicPath(product, m)
      next = null
      if (target) {
        wanted.add(target)
        try {
          if (!existing.has(target)) {
            await deps.copy(m.storagePath, target, m.format)
            copied++
          }
          next = deps.publicUrl(target)
        } catch {
          failed++ // AR falls back to the signed URL for this file
        }
      } else failed++
    }
    if (next !== m.publicUrl) await deps.setPublicUrl(productId, m, next)
  }
  const stale = [...existing].filter((p) => !wanted.has(p))
  if (stale.length) await deps.remove(stale)
  return { copied, removed: stale.length, failed }
}

export async function handleSyncArModels(req: Request, deps: SyncDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return reply(204)
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

  const token = bearerToken(req)
  const userId = token ? await deps.userIdFromToken(token) : null
  if (!userId) return reply(401, { error: 'not_signed_in' })

  const body = await readJsonObject(req, 1_000)
  if (!body) return reply(400, { error: 'invalid_request' })

  if (body.all === true) {
    const gate = await deps.ownerGate(token)
    if (gate !== 'ok') return gateReply(gate)
    const total: SyncCounts = { copied: 0, removed: 0, failed: 0 }
    for (const pid of await deps.publishedProductIds()) {
      const c = await syncProduct(deps, pid, null)
      total.copied += c.copied
      total.removed += c.removed
      total.failed += c.failed
    }
    return reply(200, { ok: true, ...total })
  }

  const productId = typeof body.productId === 'string' && UUID.test(body.productId) ? body.productId : ''
  const businessId = typeof body.businessId === 'string' && UUID.test(body.businessId) ? body.businessId : null
  if (!productId || (body.businessId !== undefined && !businessId)) return reply(400, { error: 'invalid_request' })

  const gate = await syncGate(deps.callerRpc(token), productId, businessId)
  if (gate !== 'ok') return gateReply(gate)
  return reply(200, { ok: true, ...(await syncProduct(deps, productId, businessId)) })
}
