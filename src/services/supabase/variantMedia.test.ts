import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { ModelAsset, ProductImage } from '@/domain/types'
import type { ProductInput } from '../catalogService'
import { type ProductRow, createSupabaseCatalogService, mediaPaths, toSaveProductArgs } from './supabaseCatalogService'

const photo = (path: string, isPrimary = false): ProductImage => ({ id: path, url: `https://signed.test/${path}?token=1`, storagePath: path, isPrimary, kind: 'gallery' })
const model = (format: 'glb' | 'usdz', path: string, requiredExtensions?: string[]): ModelAsset => ({
  format,
  url: `https://signed.test/${path}?token=1`,
  storagePath: path,
  fileName: `m.${format}`,
  status: 'valid',
  ...(requiredExtensions ? { requiredExtensions } : {}),
})

const base: ProductInput = {
  businessId: 'b1',
  slug: 'chair',
  name: { en: 'Chair' },
  shortDescription: { en: '' },
  description: { en: '' },
  category: 'chair',
  price: 12000,
  currency: 'EUR',
  images: [photo('b1/main.jpg', true)],
  models: { glb: model('glb', 'b1/main.glb') },
  dimensions: { width: 83, height: 69, depth: 57, unit: 'cm' },
  material: { en: '' },
  variants: [
    { id: '11111111-1111-4111-8111-111111111111', name: { en: 'Damask' }, images: [photo('b1/d1.jpg'), photo('b1/d2.jpg')], models: { glb: model('glb', 'b1/d.glb', ['EXT_texture_webp']), usdz: model('usdz', 'b1/d.usdz') } },
    { id: 'var_new', name: { en: 'Mango' } },
  ],
  cta: { label: { en: '' } },
}

describe('save_product arguments for variant media', () => {
  it('sends stable variant ids and storage paths only, with one primary photo', () => {
    const { p_variants } = toSaveProductArgs('p1', base)
    expect(p_variants[0]).toMatchObject({ id: '11111111-1111-4111-8111-111111111111', sort_order: 0 })
    expect(p_variants[0]!.images).toEqual([
      { storage_path: 'b1/d1.jpg', alt: null, is_primary: true },
      { storage_path: 'b1/d2.jpg', alt: null, is_primary: false },
    ])
    expect(p_variants[0]!.models).toEqual([
      { format: 'glb', storage_path: 'b1/d.glb', file_name: 'm.glb', size_bytes: null, required_extensions: ['EXT_texture_webp'] },
      { format: 'usdz', storage_path: 'b1/d.usdz', file_name: 'm.usdz', size_bytes: null, required_extensions: null },
    ])
    expect(p_variants[1]).toMatchObject({ id: 'var_new', images: [], models: [] })
  })

  it('orphan cleanup and signing cover variant files too', () => {
    expect(mediaPaths({ ...base })).toEqual(['b1/main.jpg', 'b1/main.glb', 'b1/d1.jpg', 'b1/d2.jpg', 'b1/d.glb', 'b1/d.usdz'])
  })
})

// A fake client that answers per table, enough for read-modify-write paths of the service.
type Call = { table: string; op: string; args: unknown[] }
function fakeClient(opts: { row: ProductRow; stillUsed?: Record<string, string[]> }, calls: Call[]) {
  const builder = (table: string) => {
    let deleting = false
    const b: Record<string, unknown> = {}
    for (const op of ['select', 'insert', 'update', 'eq', 'in', 'order', 'returns'])
      b[op] = (...args: unknown[]) => {
        calls.push({ table, op, args })
        return b
      }
    b.delete = () => {
      deleting = true
      calls.push({ table, op: 'delete', args: [] })
      return b
    }
    b.maybeSingle = () => Promise.resolve({ data: opts.row, error: null })
    b.then = (ok: (v: unknown) => unknown) =>
      Promise.resolve(
        table === 'products' && deleting
          ? { data: [{ id: opts.row.id }], error: null }
          : { data: (opts.stillUsed?.[table] ?? []).map((storage_path) => ({ storage_path })), error: null },
      ).then(ok)
    return b
  }
  return {
    from: (t: string) => builder(t),
    rpc: () => Promise.resolve({ data: opts.row.id, error: null }),
    storage: {
      from: () => ({
        createSignedUrls: (paths: string[]) => {
          calls.push({ table: 'storage', op: 'sign', args: [paths] })
          return Promise.resolve({ data: paths.map((p) => ({ path: p, signedUrl: `https://signed.test/${p}` })), error: null })
        },
        remove: (paths: string[]) => {
          calls.push({ table: 'storage', op: 'remove', args: [paths] })
          return Promise.resolve({ data: [], error: null })
        },
      }),
    },
  } as unknown as SupabaseClient
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
  product_models: [{ format: 'glb', url: null, storage_path: 'b1/main.glb', file_name: 'm.glb', size_bytes: null, required_extensions: ['KHR_texture_transform'] }],
  product_variants: [
    {
      id: 'v1',
      name: { en: 'Damask' },
      color_hex: null,
      sku: null,
      price_delta: null,
      sort_order: 0,
      product_variant_images: [
        { id: 'vi2', storage_path: 'b1/d2.jpg', alt: null, is_primary: false, sort_order: 1 },
        { id: 'vi1', storage_path: 'b1/d1.jpg', alt: null, is_primary: true, sort_order: 0 },
      ],
      product_variant_models: [{ format: 'glb', storage_path: 'b1/d.glb', file_name: 'd.glb', size_bytes: 10, required_extensions: [] }],
    },
  ],
}

describe('Supabase service: variant media', () => {
  it('loads variant photos and models with signed URLs', async () => {
    const calls: Call[] = []
    const res = await createSupabaseCatalogService(fakeClient({ row }, calls)).getProductById('p1')
    if (!res.ok) throw new Error(res.error.message)
    const v = res.data.variants[0]!
    expect(v.images?.map((i) => [i.id, i.url])).toEqual([
      ['vi1', 'https://signed.test/b1/d1.jpg'],
      ['vi2', 'https://signed.test/b1/d2.jpg'],
    ])
    expect(v.models?.glb).toMatchObject({ url: 'https://signed.test/b1/d.glb', storagePath: 'b1/d.glb', requiredExtensions: [] })
    expect(res.data.models.glb?.requiredExtensions).toEqual(['KHR_texture_transform'])
    expect(calls.find((c) => c.op === 'sign')?.args[0]).toEqual(expect.arrayContaining(['b1/d1.jpg', 'b1/d2.jpg', 'b1/d.glb']))
  })

  it('deleting a product keeps files a variant elsewhere still uses (e.g. a duplicate), and removes the rest', async () => {
    const calls: Call[] = []
    const svc = createSupabaseCatalogService(fakeClient({ row, stillUsed: { product_variant_models: ['b1/d.glb'], product_images: ['b1/main.jpg'] } }, calls))
    expect((await svc.deleteProduct('p1')).ok).toBe(true)
    const checked = calls.filter((c) => c.op === 'in').map((c) => c.table)
    expect(checked).toEqual(expect.arrayContaining(['product_images', 'product_models', 'product_variant_images', 'product_variant_models']))
    const removed = calls.find((c) => c.op === 'remove')?.args[0] as string[]
    expect(removed.sort()).toEqual(['b1/d1.jpg', 'b1/d2.jpg', 'b1/main.glb'])
  })

  it('refuses variant files that were not uploaded to storage', async () => {
    const calls: Call[] = []
    const svc = createSupabaseCatalogService(fakeClient({ row }, calls))
    const res = await svc.createProduct({ ...base, variants: [{ id: 'v', name: { en: 'Blob' }, models: { glb: { format: 'glb', url: 'blob:x', fileName: 'x.glb', status: 'session-only' } } }] })
    expect(res.ok === false && res.error.fieldErrors?.variants).toEqual({ key: 'common.validation.product.variantFilesNotUploaded' })
  })
})
