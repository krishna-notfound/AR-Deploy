import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { SYNC_AR_MODELS_FUNCTION, createSupabaseCatalogService } from './supabaseCatalogService'

// Public AR model copies (owner decision 2026-10-26): every product action that changes what the public may see asks
// sync-ar-models to refresh the ar-models copies, fire-and-forget. A failure never changes the action's result.

const BIZ = 'b1'
const PID = 'p1'
const PUBLIC_GLB = 'https://x.supabase.co/storage/v1/object/public/ar-models/b1/p1/base/glb-m.glb'

function row(status: string) {
  return {
    id: PID, business_id: BIZ, slug: 'c', name: { en: 'C' }, short_description: { en: '' }, description: { en: '' }, material: { en: '' },
    cta_label: { en: '' }, cta_url: null, category: 'chair', price: 100, currency: 'EUR', status, width: 1, height: 1, depth: 1,
    dimension_unit: 'cm', weight_value: null, weight_unit: null, published_at: null, created_at: 'x', updated_at: 'x',
    product_images: [{ id: 'i1', url: null, storage_path: 'b1/a.jpg', alt: null, is_primary: true, kind: 'gallery', sort_order: 0 }],
    product_models: [{ format: 'glb', url: null, storage_path: 'b1/m.glb', file_name: 'm.glb', size_bytes: 1, required_extensions: null, public_url: PUBLIC_GLB }],
    product_variants: [],
  }
}

function stub(start: 'draft' | 'published', invoke: (name: string, o: unknown) => Promise<unknown> = async () => ({ data: { ok: true }, error: null })) {
  let status: string = start
  const invokeSpy = vi.fn(invoke)
  const from = (table: string) => {
    let op = 'select'
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'returns', 'order']) b[m] = () => b
    b.update = (patch: { status?: string }) => ((op = 'update'), patch.status && (status = patch.status), b)
    b.delete = () => ((op = 'delete'), b)
    const result = () => {
      if (table === 'products') {
        if (op === 'delete') return { data: [{ id: PID }], error: null }
        if (op === 'update') return { data: { id: PID }, error: null }
        return { data: row(status), error: null }
      }
      if (table === 'businesses') {
        const biz = { id: BIZ, name: 'B', slug: 'b', status: 'active', description: null, logo_url: null, contact: {}, created_at: 'x', updated_at: 'x' }
        return { data: op === 'delete' ? [{ id: BIZ }] : biz, error: null }
      }
      return { data: [], error: null }
    }
    b.single = () => Promise.resolve(result())
    b.maybeSingle = () => Promise.resolve(result())
    // A list read (no maybeSingle) answers an array.
    b.then = (f: (v: unknown) => unknown) => {
      const r = result()
      return Promise.resolve(table === 'products' && op === 'select' ? { ...r, data: [r.data] } : r).then(f)
    }
    return b
  }
  const sb = {
    from,
    rpc: async (fn: string) => (fn === 'my_platform_access' ? { data: { role: null }, error: null } : { data: PID, error: null }),
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: `https://x.supabase.co/sign/${path}?token=t` })), error: null }),
        remove: async () => ({ data: [], error: null }),
        list: async () => ({ data: [], error: null }),
      }),
    },
    functions: { invoke: invokeSpy },
  } as unknown as SupabaseClient
  return { svc: createSupabaseCatalogService(sb), invoke: invokeSpy }
}

const flush = () => new Promise((r) => setTimeout(r, 0))
const syncCalls = (invoke: ReturnType<typeof vi.fn>) => invoke.mock.calls.filter(([name]) => name === SYNC_AR_MODELS_FUNCTION).map(([, o]) => o)

describe('sync-ar-models after product actions (Supabase service)', () => {
  it('publishProduct, unpublishProduct and deleteProduct each ask for a sync of that product', async () => {
    const pub = stub('draft')
    expect((await pub.svc.publishProduct(PID)).ok).toBe(true)
    await flush()
    expect(syncCalls(pub.invoke)).toEqual([{ body: { productId: PID } }])

    const unpub = stub('published')
    expect((await unpub.svc.unpublishProduct(PID)).ok).toBe(true)
    await flush()
    expect(syncCalls(unpub.invoke)).toEqual([{ body: { productId: PID } }])

    const del = stub('published')
    expect((await del.svc.deleteProduct(PID)).ok).toBe(true)
    await flush()
    // The product is gone: the business names the folder to remove.
    expect(syncCalls(del.invoke)).toEqual([{ body: { productId: PID, businessId: BIZ } }])
  })

  it('updateProduct syncs a published product only; a draft edit does not', async () => {
    const live = stub('published')
    expect((await live.svc.updateProduct(PID, { name: { en: 'New' } })).ok).toBe(true)
    await flush()
    expect(syncCalls(live.invoke)).toEqual([{ body: { productId: PID } }])

    const draft = stub('draft')
    expect((await draft.svc.updateProduct(PID, { name: { en: 'New' } })).ok).toBe(true)
    await flush()
    expect(syncCalls(draft.invoke)).toEqual([])
  })

  it('duplicateProduct syncs only when the copy is published', async () => {
    const live = stub('published')
    expect((await live.svc.duplicateProduct(PID)).ok).toBe(true)
    await flush()
    expect(syncCalls(live.invoke)).toEqual([{ body: { productId: PID } }])
    const draft = stub('draft')
    expect((await draft.svc.duplicateProduct(PID)).ok).toBe(true)
    await flush()
    expect(syncCalls(draft.invoke)).toEqual([])
  })

  it('a rejected or refused sync never changes the result', async () => {
    const down = stub('draft', () => Promise.reject(new Error('function down')))
    const r = await down.svc.publishProduct(PID)
    await flush()
    expect(r.ok).toBe(true)
    expect(syncCalls(down.invoke)).toHaveLength(1)

    const refused = { data: null, error: { message: 'non-2xx', context: new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }) } }
    const no = stub('published', async () => refused)
    const u = await no.svc.unpublishProduct(PID)
    await flush()
    expect(u.ok).toBe(true)
  })

  it('reads public_url into the model as publicUrl; the 3D view keeps the signed URL', async () => {
    const { svc } = stub('published')
    const r = await svc.getProductById(PID)
    if (!r.ok) throw new Error(r.error.message)
    expect(r.data.models.glb).toMatchObject({ url: 'https://x.supabase.co/sign/b1/m.glb?token=t', publicUrl: PUBLIC_GLB })
  })
})

describe('sync-ar-models after business actions (review fixes)', () => {
  it('setBusinessStatus asks for a sync of each published product of the business, with the business id', async () => {
    const t = stub('published')
    expect((await t.svc.setBusinessStatus(BIZ, 'inactive')).ok).toBe(true)
    await flush()
    await flush()
    expect(syncCalls(t.invoke)).toEqual([{ body: { productId: PID, businessId: BIZ } }])
  })

  it('deleteBusiness asks for a sync of each published product it had, so the public copies are removed', async () => {
    const t = stub('published')
    expect((await t.svc.deleteBusiness(BIZ)).ok).toBe(true)
    await flush()
    expect(syncCalls(t.invoke)).toEqual([{ body: { productId: PID, businessId: BIZ } }])
  })
})
