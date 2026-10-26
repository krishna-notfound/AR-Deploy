// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { CallerRpc } from '../_shared/gate'
import { type SyncDeps, type SyncProduct, handleSyncArModels, publicPath } from './handler'

const BIZ = '11111111-1111-4111-8111-111111111111'
const PID = '22222222-2222-4222-8222-222222222222'
const VAR = '33333333-3333-4333-8333-333333333333'
const GONE = '44444444-4444-4444-8444-444444444444'
const SRC_GLB = `${BIZ}/aaaaaaaa-0000-4000-8000-000000000001.glb`
const SRC_USDZ = `${BIZ}/aaaaaaaa-0000-4000-8000-000000000002.usdz`
const SRC_VAR = `${BIZ}/aaaaaaaa-0000-4000-8000-000000000003.glb`
const BASE = 'https://ref.supabase.co/storage/v1/object/public/ar-models/'

type Rpcs = { mfa?: boolean; canSync?: boolean }

function world(product: SyncProduct | null, opts: { rpcs?: Rpcs; files?: string[]; failCopy?: string; onCopy?: (products: Map<string, SyncProduct>) => void } = {}) {
  const files = new Set(opts.files ?? [])
  const rpcCalls: [string, Record<string, unknown> | undefined][] = []
  const copies: [string, string][] = []
  const removed: string[] = []
  const urls: Record<string, string | null> = {}
  const touched: string[] = []
  const products = new Map<string, SyncProduct>(product ? [[product.id, product]] : [])
  const deps: SyncDeps = {
    userIdFromToken: async (t) => ({ 'member-token': 'member', 'owner-token': 'owner', 'aal1-token': 'member' })[t] ?? null,
    callerRpc: (token): CallerRpc => async (fn, args) => {
      rpcCalls.push([fn, args])
      if (fn === 'caller_mfa_satisfied') return token !== 'aal1-token' && (opts.rpcs?.mfa ?? true)
      if (fn === 'can_sync_ar_models') return opts.rpcs?.canSync ?? true
      throw new Error(`unexpected rpc ${fn}`)
    },
    ownerGate: async (t) => (t === 'owner-token' ? 'ok' : t === 'aal1-token' ? 'aal2_required' : 'forbidden'),
    product: async (id) => products.get(id) ?? null,
    publishedProductIds: async () => [...products.values()].filter((p) => p.status === 'published').map((p) => p.id),
    listFolder: async (folder) => [...files].filter((f) => f.startsWith(`${folder}/`)),
    copy: async (from, to) => {
      if (from === opts.failCopy) throw new Error('copy failed')
      copies.push([from, to])
      files.add(to)
      opts.onCopy?.(products)
    },
    remove: async (paths) => {
      for (const p of paths) (files.delete(p), removed.push(p))
    },
    publicUrl: (path) => `${BASE}${path}`,
    setPublicUrl: async (productId, m, url) => {
      const key = `${productId}:${m.variantId ?? 'base'}:${m.format}`
      urls[key] = url
      touched.push(key)
    },
  }
  return { deps, files, rpcCalls, copies, removed, urls, touched, products }
}

const product = (status: string, over: Partial<SyncProduct> = {}): SyncProduct => ({
  id: PID,
  businessId: BIZ,
  status,
  businessStatus: 'active',
  models: [
    { variantId: null, format: 'glb', storagePath: SRC_GLB, url: null, publicUrl: null },
    { variantId: null, format: 'usdz', storagePath: SRC_USDZ, url: null, publicUrl: null },
    { variantId: VAR, format: 'glb', storagePath: SRC_VAR, url: null, publicUrl: null },
  ],
  ...over,
})

const post = (body: unknown, token = 'member-token') =>
  new Request('https://fn.test/sync-ar-models', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
const json = async (r: Response) => (await r.json()) as Record<string, unknown>

const GLB_PATH = `${BIZ}/${PID}/base/glb-aaaaaaaa-0000-4000-8000-000000000001.glb`
const USDZ_PATH = `${BIZ}/${PID}/base/usdz-aaaaaaaa-0000-4000-8000-000000000002.usdz`
const VAR_PATH = `${BIZ}/${PID}/${VAR}/glb-aaaaaaaa-0000-4000-8000-000000000003.glb`

describe('sync-ar-models: requests and gates', () => {
  it('OPTIONS 204; GET 405; no token or an unknown token 401', async () => {
    const { deps } = world(product('published'))
    expect((await handleSyncArModels(new Request('https://fn.test', { method: 'OPTIONS' }), deps)).status).toBe(204)
    expect((await handleSyncArModels(new Request('https://fn.test'), deps)).status).toBe(405)
    const r = await handleSyncArModels(post({ productId: PID }, 'nobody'), deps)
    expect(r.status).toBe(401)
    expect(await json(r)).toEqual({ error: 'not_signed_in' })
  })

  it('a bad body is 400 invalid_request, before any gate call', async () => {
    const w = world(product('published'))
    for (const body of [{}, { productId: 'nope' }, { productId: PID, businessId: 'x' }, [1]]) {
      const r = await handleSyncArModels(post(body), w.deps)
      expect(r.status).toBe(400)
      expect(await json(r)).toEqual({ error: 'invalid_request' })
    }
    expect(w.rpcCalls).toEqual([])
  })

  it('asks caller_mfa_satisfied first, then can_sync_ar_models with the product and the named business', async () => {
    const w = world(product('published'))
    await handleSyncArModels(post({ productId: PID }), w.deps)
    expect(w.rpcCalls).toEqual([
      ['caller_mfa_satisfied', undefined],
      ['can_sync_ar_models', { p_product: PID, p_business: null }],
    ])
  })

  it('a session that still needs 2FA is 403 aal2_required and can_sync_ar_models is not asked', async () => {
    const w = world(product('published'))
    const r = await handleSyncArModels(post({ productId: PID }, 'aal1-token'), w.deps)
    expect(r.status).toBe(403)
    expect(await json(r)).toEqual({ error: 'aal2_required' })
    expect(w.rpcCalls.map(([fn]) => fn)).toEqual(['caller_mfa_satisfied'])
  })

  it('a caller who may not sync is 403 forbidden and nothing is copied or removed', async () => {
    const w = world(product('draft'), { rpcs: { canSync: false }, files: [GLB_PATH] })
    const r = await handleSyncArModels(post({ productId: PID }), w.deps)
    expect(r.status).toBe(403)
    expect(await json(r)).toEqual({ error: 'forbidden' })
    expect(w.copies).toEqual([])
    expect(w.removed).toEqual([])
  })
})

describe('sync-ar-models: a published product', () => {
  it('copies each GLB/USDZ into ar-models/<business>/<product>/<variant|base>/ and sets public_url', async () => {
    const w = world(product('published'))
    const r = await handleSyncArModels(post({ productId: PID }), w.deps)
    expect(await json(r)).toEqual({ ok: true, copied: 3, removed: 0, failed: 0 })
    expect(w.copies).toEqual([
      [SRC_GLB, GLB_PATH],
      [SRC_USDZ, USDZ_PATH],
      [SRC_VAR, VAR_PATH],
    ])
    expect(w.urls).toEqual({
      [`${PID}:base:glb`]: `${BASE}${GLB_PATH}`,
      [`${PID}:base:usdz`]: `${BASE}${USDZ_PATH}`,
      [`${PID}:${VAR}:glb`]: `${BASE}${VAR_PATH}`,
    })
  })

  it('a second sync copies nothing and writes nothing; a replaced file is copied and the stale copy removed', async () => {
    const synced = product('published', {
      models: [
        { variantId: null, format: 'glb', storagePath: SRC_GLB, url: null, publicUrl: `${BASE}${GLB_PATH}` },
        { variantId: VAR, format: 'glb', storagePath: SRC_VAR, url: null, publicUrl: `${BASE}${VAR_PATH}` },
      ],
    })
    const same = world(synced, { files: [GLB_PATH, VAR_PATH] })
    expect(await json(await handleSyncArModels(post({ productId: PID }), same.deps))).toEqual({ ok: true, copied: 0, removed: 0, failed: 0 })
    expect(same.touched).toEqual([])

    const NEW_SRC = `${BIZ}/bbbbbbbb-0000-4000-8000-000000000009.glb`
    const replaced = world({ ...synced, models: [{ ...synced.models[0]!, storagePath: NEW_SRC, publicUrl: null }] }, { files: [GLB_PATH, VAR_PATH, USDZ_PATH] })
    expect(await json(await handleSyncArModels(post({ productId: PID }), replaced.deps))).toEqual({ ok: true, copied: 1, removed: 3, failed: 0 })
    const newPath = `${BIZ}/${PID}/base/glb-bbbbbbbb-0000-4000-8000-000000000009.glb`
    expect([...replaced.files]).toEqual([newPath])
    expect(replaced.urls).toEqual({ [`${PID}:base:glb`]: `${BASE}${newPath}` })
  })

  it('an external https model (a public sample URL) keeps that URL as public_url; nothing is copied', async () => {
    const sample = 'https://modelviewer.dev/shared-assets/models/Chair.glb'
    const w = world(product('published', { models: [{ variantId: null, format: 'glb', storagePath: null, url: sample, publicUrl: null }] }))
    expect(await json(await handleSyncArModels(post({ productId: PID }), w.deps))).toEqual({ ok: true, copied: 0, removed: 0, failed: 0 })
    expect(w.copies).toEqual([])
    expect(w.urls).toEqual({ [`${PID}:base:glb`]: sample })
  })

  it('a copy that fails leaves that public_url null (AR falls back to the signed URL) and is counted', async () => {
    const w = world(product('published'), { failCopy: SRC_USDZ })
    expect(await json(await handleSyncArModels(post({ productId: PID }), w.deps))).toEqual({ ok: true, copied: 2, removed: 0, failed: 1 })
    expect(w.urls[`${PID}:base:usdz`]).toBeUndefined() // was null, stays null: not written
  })
})

describe('sync-ar-models: a draft or deleted product', () => {
  it('a draft: removes the product folder and clears every public_url', async () => {
    const draft = product('draft', { models: product('draft').models.map((m) => ({ ...m, publicUrl: `${BASE}x` })) })
    const w = world(draft, { files: [GLB_PATH, VAR_PATH, `${BIZ}/other-product/base/glb-x.glb`] })
    expect(await json(await handleSyncArModels(post({ productId: PID }), w.deps))).toEqual({ ok: true, copied: 0, removed: 2, failed: 0 })
    expect([...w.files]).toEqual([`${BIZ}/other-product/base/glb-x.glb`])
    expect(Object.values(w.urls)).toEqual([null, null, null])
    expect(w.copies).toEqual([])
  })

  it('a deleted product: removes the folder of the business the caller names', async () => {
    const w = world(null, { files: [`${BIZ}/${GONE}/base/glb-x.glb`] })
    const r = await handleSyncArModels(post({ productId: GONE, businessId: BIZ }), w.deps)
    expect(await json(r)).toEqual({ ok: true, copied: 0, removed: 1, failed: 0 })
    expect(w.rpcCalls[1]).toEqual(['can_sync_ar_models', { p_product: GONE, p_business: BIZ }])
    expect([...w.files]).toEqual([])
  })

  it('a deleted product without a business: nothing to do', async () => {
    const w = world(null, { files: [`${BIZ}/${GONE}/base/glb-x.glb`] })
    expect(await json(await handleSyncArModels(post({ productId: GONE }), w.deps))).toEqual({ ok: true, copied: 0, removed: 0, failed: 0 })
    expect(w.files.size).toBe(1)
  })
})

describe('sync-ar-models: { all: true } backfill', () => {
  it('the platform Owner syncs every published product', async () => {
    const w = world(product('published'))
    const r = await handleSyncArModels(post({ all: true }, 'owner-token'), w.deps)
    expect(await json(r)).toEqual({ ok: true, copied: 3, removed: 0, failed: 0 })
    expect(w.rpcCalls).toEqual([]) // the Owner gate, not can_sync_ar_models
  })

  it('anyone else is refused (403) and nothing is copied', async () => {
    for (const [token, error] of [['member-token', 'forbidden'], ['aal1-token', 'aal2_required']] as const) {
      const w = world(product('published'))
      const r = await handleSyncArModels(post({ all: true }, token), w.deps)
      expect(r.status).toBe(403)
      expect(await json(r)).toEqual({ error })
      expect(w.copies).toEqual([])
    }
  })
})

describe('publicPath', () => {
  it('names the variant or base folder and the source file id; refuses an odd source name', () => {
    expect(publicPath({ id: PID, businessId: BIZ }, { variantId: null, format: 'usdz', storagePath: SRC_USDZ })).toBe(USDZ_PATH)
    expect(publicPath({ id: PID, businessId: BIZ }, { variantId: null, format: 'glb', storagePath: `${BIZ}/../x y.glb` })).toBeNull()
  })
})

describe('sync-ar-models: business status and overlapping syncs (review fixes)', () => {
  it('a published product of an inactive business is not public: its copies are removed and nothing is copied', async () => {
    const w = world(product('published', { businessStatus: 'inactive' }), { files: [GLB_PATH] })
    const r = await handleSyncArModels(post({ productId: PID }), w.deps)
    expect(await json(r)).toEqual({ ok: true, copied: 0, removed: 1, failed: 0 })
    expect(w.copies).toEqual([])
    expect(w.files.size).toBe(0)
  })

  it('a product unpublished while its files were being copied ends with no public copies and no public_url', async () => {
    const w = world(product('published'), {
      onCopy: (products) => products.set(PID, { ...products.get(PID)!, status: 'draft', models: products.get(PID)!.models.map((m) => ({ ...m, publicUrl: `${BASE}x` })) }),
    })
    await handleSyncArModels(post({ productId: PID }), w.deps)
    expect(w.files.size).toBe(0)
    expect(Object.values(w.urls).every((u) => u === null)).toBe(true)
  })

  it('a file replaced by a newer save during the sync is not kept: only files the latest rows name stay', async () => {
    const NEW_GLB = `${BIZ}/aaaaaaaa-0000-4000-8000-000000000009.glb`
    let swapped = false
    const w = world(product('published'), {
      onCopy: (products) => {
        if (swapped) return
        swapped = true
        const p = products.get(PID)!
        products.set(PID, { ...p, models: p.models.map((m) => (m.variantId === null && m.format === 'glb' ? { ...m, storagePath: NEW_GLB } : m)) })
      },
    })
    await handleSyncArModels(post({ productId: PID }), w.deps)
    expect(w.files.has(GLB_PATH)).toBe(false)
    expect(w.files.has(USDZ_PATH)).toBe(true)
    expect(w.files.has(VAR_PATH)).toBe(true)
  })

  it('the backfill counts a product whose sync throws as failed and goes on', async () => {
    const w = world(product('published'))
    const other = { ...product('published'), id: GONE }
    w.products.set(GONE, other)
    const realProduct = w.deps.product
    w.deps.product = async (id) => {
      if (id === GONE) throw new Error('boom')
      return realProduct(id)
    }
    const r = await handleSyncArModels(post({ all: true }, 'owner-token'), w.deps)
    expect(await json(r)).toEqual({ ok: true, copied: 3, removed: 0, failed: 1 })
  })
})
