// S4 Task 3 (R-S4-3, R-S4-17): what the Supabase service sends to save_product, and the duplicate without 3D files
// for a business that can't write its own.
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { ProductInput } from '../catalogService'
import { type ProductRow, createSupabaseCatalogService, toSaveProductArgs } from './supabaseCatalogService'

const input: ProductInput = {
  businessId: 'b1',
  slug: 'chair',
  name: { en: 'Chair' },
  shortDescription: { en: '' },
  description: { en: '' },
  category: 'chair',
  price: 12000,
  currency: 'EUR',
  images: [],
  models: {},
  dimensions: { width: 83, height: 69, depth: 57, unit: 'cm' },
  material: { en: '' },
  variants: [],
  cta: { label: { en: '' } },
}

const row: ProductRow = {
  id: 'p1',
  business_id: 'b1',
  slug: 'chair',
  name: { en: 'Chair' },
  short_description: { en: '' },
  description: { en: '' },
  material: { en: '' },
  cta_label: { en: '' },
  cta_url: null,
  category: 'chair',
  price: 12000,
  currency: 'EUR',
  status: 'published',
  width: 83,
  height: 69,
  depth: 57,
  dimension_unit: 'cm',
  weight_value: null,
  weight_unit: null,
  published_at: null,
  created_at: '2026-10-20T00:00:00Z',
  updated_at: '2026-10-20T00:00:00Z',
  product_images: [{ id: 'i1', url: null, storage_path: 'b1/main.jpg', alt: null, is_primary: true, kind: 'gallery', sort_order: 0 }],
  product_models: [{ format: 'glb', url: null, storage_path: 'b1/main.glb', file_name: 'm.glb', size_bytes: null, required_extensions: null }],
  product_variants: [
    {
      id: 'v1',
      name: { en: 'Oak' },
      color_hex: null,
      sku: null,
      price_delta: null,
      sort_order: 0,
      product_variant_images: [],
      product_variant_models: [{ format: 'glb', storage_path: 'b1/v.glb', file_name: 'v.glb', size_bytes: 10, required_extensions: [] }],
    },
  ],
}

type Call = { fn: string; args: Record<string, unknown> }
/** Enough of a client for duplicateProduct: product reads answer `row`, rpc calls are recorded. */
function fakeClient(canWrite: boolean, calls: Call[], writes: string[]) {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {}
    for (const op of ['select', 'eq', 'in', 'order', 'returns']) b[op] = () => b
    for (const op of ['insert', 'update', 'delete', 'upsert'])
      b[op] = () => {
        writes.push(`${table}.${op}`)
        return b
      }
    b.maybeSingle = () => Promise.resolve({ data: row, error: null })
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok)
    return b
  }
  return {
    from: (t: string) => builder(t),
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args })
      return Promise.resolve(fn === 'can_write_own_models' ? { data: canWrite, error: null } : { data: row.id, error: null })
    },
    storage: {
      from: () => ({
        createSignedUrls: (paths: string[]) => Promise.resolve({ data: paths.map((p) => ({ path: p, signedUrl: `https://signed.test/${p}` })), error: null }),
        remove: (paths: string[]) => {
          writes.push(`storage.remove:${paths.join(',')}`)
          return Promise.resolve({ data: [], error: null })
        },
      }),
    },
  } as unknown as SupabaseClient
}

describe('S4 Task 3: save_product arguments and duplicates (Supabase)', () => {
  it('toSaveProductArgs sends keep_models and expected_models_changed_at', () => {
    expect(toSaveProductArgs('p1', input).p_product).toMatchObject({ keep_models: false, expected_models_changed_at: null })
    expect(toSaveProductArgs('p1', { ...input, keepModels: true, modelsChangedAt: '2026-10-26T08:00:00.123456+00:00' }).p_product)
      .toMatchObject({ keep_models: true, expected_models_changed_at: '2026-10-26T08:00:00.123456+00:00' })
    // The key is always present, so the database checks every editor save.
    expect(Object.hasOwn(toSaveProductArgs(null, input).p_product, 'expected_models_changed_at')).toBe(true)
  })

  it('Review Focus 1: duplicateProduct for a switch-off business copies no 3D rows and the original keeps its GLB', async () => {
    const calls: Call[] = []
    const writes: string[] = []
    const res = await createSupabaseCatalogService(fakeClient(false, calls, writes)).duplicateProduct('p1')
    expect(res.ok).toBe(true)
    expect(calls.find((c) => c.fn === 'can_write_own_models')?.args).toEqual({ p_business: 'b1' })
    const save = calls.find((c) => c.fn === 'save_product')!.args as { p_product: { id: unknown }; p_models: unknown[]; p_variants: { models: unknown[] }[] }
    expect(save.p_product.id).toBeNull()
    expect(save.p_models).toEqual([])
    expect(save.p_variants.map((v) => v.models)).toEqual([[]])
    // Nothing touches the original's rows or files.
    expect(writes).toEqual([])
  })

  it('duplicateProduct for a business that may write its own copies the 3D rows', async () => {
    const calls: Call[] = []
    await createSupabaseCatalogService(fakeClient(true, calls, [])).duplicateProduct('p1')
    const save = calls.find((c) => c.fn === 'save_product')!.args as { p_models: { storage_path: string }[]; p_variants: { models: { storage_path: string }[] }[] }
    expect(save.p_models.map((m) => m.storage_path)).toEqual(['b1/main.glb'])
    expect(save.p_variants[0]!.models.map((m) => m.storage_path)).toEqual(['b1/v.glb'])
  })
})
