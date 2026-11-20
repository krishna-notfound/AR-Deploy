import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { ModelAsset, ProductImage } from '@/domain/types'
import type { ProductInput } from '../catalogService'
import { type ProductRow, createSupabaseCatalogService, mediaPaths, toProduct, toSaveProductArgs } from './supabaseCatalogService'

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
      { storage_path: 'b1/d1.jpg', original_path: null, crop: null, page_path: null, page_crop: null, alt: null, is_primary: true },
      { storage_path: 'b1/d2.jpg', original_path: null, crop: null, page_path: null, page_crop: null, alt: null, is_primary: false },
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

describe('photo originals and crops (ADR-0063)', () => {
  const crop = { x: -10, y: 0, width: 800, height: 1000 }
  const cropped: ProductImage = { ...photo('b1/shown.webp', true), originalPath: 'b1/orig.jpg', originalUrl: 'https://signed.test/orig', crop }

  it('sends original_path and crop per photo and per option photo, and never the signed link', () => {
    const args = toSaveProductArgs('p1', { ...base, images: [cropped, photo('b1/old.jpg')], variants: [{ id: 'var_1', name: { en: 'A' }, images: [cropped] }] })
    expect(args.p_images[0]).toMatchObject({ storage_path: 'b1/shown.webp', original_path: 'b1/orig.jpg', crop })
    expect(args.p_images[1]).toMatchObject({ storage_path: 'b1/old.jpg', original_path: null, crop: null })
    expect(args.p_variants[0]!.images[0]).toEqual({ storage_path: 'b1/shown.webp', original_path: 'b1/orig.jpg', crop, page_path: null, page_crop: null, alt: null, is_primary: true })
    expect(JSON.stringify(args)).not.toContain('signed.test/orig')
  })

  it('reads them back from the rows (a stray crop is ignored) and leaves the original unsigned', () => {
    const row = (over: object) => ({ id: 'i1', url: null, storage_path: 'b1/shown.webp', alt: null, is_primary: true, kind: 'gallery', sort_order: 0, ...over })
    const product = (images: object[]) => toProduct({ ...row, product_images: images } as ProductRow, new Map([['b1/shown.webp', 'https://signed.test/shown']]))
    expect(product([row({ original_path: 'b1/orig.jpg', crop })]).images[0]).toMatchObject({ url: 'https://signed.test/shown', originalPath: 'b1/orig.jpg', crop })
    expect(product([row({ original_path: 'b1/orig.jpg', crop })]).images[0]!.originalUrl).toBeUndefined()
    const plain = product([row({ original_path: null, crop: null })]).images[0]!
    expect('originalPath' in plain || 'crop' in plain).toBe(false)
    expect(product([row({ crop: { x: 0, y: 0, width: 0, height: 5 } })]).images[0]!.crop).toBeUndefined()
    expect(product([row({ crop: 'wide' })]).images[0]!.crop).toBeUndefined()
  })

  it('orphan cleanup and signing cover the originals too', () => {
    expect(mediaPaths({ ...base, images: [cropped], models: {}, variants: [{ id: 'v', name: { en: 'A' }, images: [{ ...cropped, storagePath: 'b1/v.webp', originalPath: 'b1/vo.png' }] }] })).toEqual(['b1/shown.webp', 'b1/orig.jpg', 'b1/v.webp', 'b1/vo.png'])
  })
})

describe('product-page copies (ADR-0081)', () => {
  const crop = { x: -10, y: 0, width: 800, height: 1000 }
  const pageCrop = { x: 0, y: 100, width: 1600, height: 900 }
  const twoCrops: ProductImage = { ...photo('b1/card.webp', true), originalPath: 'b1/orig.jpg', crop, pagePath: 'b1/page.webp', pageUrl: 'https://signed.test/page', pageCrop }

  it('sends page_path and page_crop per photo and per option photo, and never the signed page link', () => {
    const args = toSaveProductArgs('p1', { ...base, images: [twoCrops, photo('b1/old.jpg')], variants: [{ id: 'var_1', name: { en: 'A' }, images: [twoCrops] }] })
    expect(args.p_images[0]).toMatchObject({ storage_path: 'b1/card.webp', original_path: 'b1/orig.jpg', crop, page_path: 'b1/page.webp', page_crop: pageCrop })
    expect(args.p_images[1]).toMatchObject({ storage_path: 'b1/old.jpg', page_path: null, page_crop: null })
    expect(args.p_variants[0]!.images[0]).toEqual({ storage_path: 'b1/card.webp', original_path: 'b1/orig.jpg', crop, page_path: 'b1/page.webp', page_crop: pageCrop, alt: null, is_primary: true })
    expect(JSON.stringify(args)).not.toContain('signed.test/page')
  })

  it('reads them back: the page copy is signed into pageUrl; a stray page_crop is ignored; none means no keys', () => {
    const row = (over: object) => ({ id: 'i1', url: null, storage_path: 'b1/card.webp', alt: null, is_primary: true, kind: 'gallery', sort_order: 0, ...over })
    const signed = new Map([['b1/card.webp', 'https://signed.test/card'], ['b1/page.webp', 'https://signed.test/page']])
    const product = (images: object[]) => toProduct({ ...row, product_images: images } as ProductRow, signed)
    expect(product([row({ page_path: 'b1/page.webp', page_crop: pageCrop })]).images[0]).toMatchObject({ url: 'https://signed.test/card', pagePath: 'b1/page.webp', pageUrl: 'https://signed.test/page', pageCrop })
    const plain = product([row({ page_path: null, page_crop: null })]).images[0]!
    expect('pagePath' in plain || 'pageUrl' in plain || 'pageCrop' in plain).toBe(false)
    expect(product([row({ page_path: 'b1/page.webp', page_crop: { x: 0, y: 0, width: -1, height: 5 } })]).images[0]!.pageCrop).toBeUndefined()
    // A page copy with no link (missing file) keeps its path but no pageUrl, so the page falls back to the card copy.
    expect(product([row({ page_path: 'b1/gone.webp' })]).images[0]).toMatchObject({ pagePath: 'b1/gone.webp' })
    expect(product([row({ page_path: 'b1/gone.webp' })]).images[0]!.pageUrl).toBeUndefined()
  })

  it('orphan cleanup covers the page copies too', () => {
    expect(mediaPaths({ ...base, images: [twoCrops], models: {}, variants: [{ id: 'v', name: { en: 'A' }, images: [{ ...twoCrops, storagePath: 'b1/v.webp', originalPath: 'b1/vo.png', pagePath: 'b1/vp.webp' }] }] })).toEqual(['b1/card.webp', 'b1/orig.jpg', 'b1/page.webp', 'b1/v.webp', 'b1/vo.png', 'b1/vp.webp'])
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
          : { data: (opts.stillUsed?.[table] ?? []).map((p) => ({ storage_path: p, original_path: p, page_path: p })), error: null },
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
  cta_hidden: false,
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

  it('deleting a product removes its photos’ originals too, except one a duplicate still uses', async () => {
    const withOriginals: ProductRow = { ...row, product_images: [{ ...row.product_images![0]!, original_path: 'b1/main-orig.jpg' }, { id: 'i2', url: null, storage_path: 'b1/side.jpg', original_path: 'b1/side-orig.jpg', alt: null, is_primary: false, kind: 'additional', sort_order: 1 }] }
    const calls: Call[] = []
    const svc = createSupabaseCatalogService(fakeClient({ row: withOriginals, stillUsed: { product_images: ['b1/side-orig.jpg'] } }, calls))
    expect((await svc.deleteProduct('p1')).ok).toBe(true)
    const removed = calls.find((c) => c.op === 'remove')?.args[0] as string[]
    expect(removed).toContain('b1/main-orig.jpg')
    expect(removed).not.toContain('b1/side-orig.jpg')
  })

  it('signs a main and an option photo’s product-page copy (ADR-0081) and maps it to pageUrl, pagePath and pageCrop', async () => {
    const pageCrop = { x: 0, y: 40, width: 1200, height: 900 }
    const withPages: ProductRow = {
      ...row,
      product_images: [{ ...row.product_images![0]!, page_path: 'b1/main-page.webp', page_crop: pageCrop }],
      product_variants: [{ ...row.product_variants![0]!, product_variant_images: [{ id: 'vi1', storage_path: 'b1/d1.jpg', page_path: 'b1/d1-page.webp', page_crop: pageCrop, alt: null, is_primary: true, sort_order: 0 }] }],
    }
    const calls: Call[] = []
    const res = await createSupabaseCatalogService(fakeClient({ row: withPages }, calls)).getProductById('p1')
    if (!res.ok) throw new Error(res.error.message)
    expect(calls.find((c) => c.op === 'sign')?.args[0]).toEqual(expect.arrayContaining(['b1/main.jpg', 'b1/main-page.webp', 'b1/d1-page.webp']))
    expect(res.data.images[0]).toMatchObject({ url: 'https://signed.test/b1/main.jpg', pagePath: 'b1/main-page.webp', pageUrl: 'https://signed.test/b1/main-page.webp', pageCrop })
    expect(res.data.variants[0]!.images![0]).toMatchObject({ pagePath: 'b1/d1-page.webp', pageUrl: 'https://signed.test/b1/d1-page.webp', pageCrop })
  })

  it('deleting a product removes its photos’ page copies too, except one a duplicate still uses', async () => {
    const withPages: ProductRow = { ...row, product_images: [{ ...row.product_images![0]!, page_path: 'b1/main-page.webp' }, { id: 'i2', url: null, storage_path: 'b1/side.jpg', page_path: 'b1/side-page.webp', alt: null, is_primary: false, kind: 'gallery', sort_order: 1 }] }
    const calls: Call[] = []
    const svc = createSupabaseCatalogService(fakeClient({ row: withPages, stillUsed: { product_images: ['b1/side-page.webp'] } }, calls))
    expect((await svc.deleteProduct('p1')).ok).toBe(true)
    expect(calls.some((c) => c.op === 'in' && c.args[0] === 'page_path')).toBe(true)
    const removed = calls.find((c) => c.op === 'remove')?.args[0] as string[]
    expect(removed).toContain('b1/main-page.webp')
    expect(removed).not.toContain('b1/side-page.webp')
  })

  it('refuses variant files that were not uploaded to storage', async () => {
    const calls: Call[] = []
    const svc = createSupabaseCatalogService(fakeClient({ row }, calls))
    const res = await svc.createProduct({ ...base, variants: [{ id: 'v', name: { en: 'Blob' }, models: { glb: { format: 'glb', url: 'blob:x', fileName: 'x.glb', status: 'session-only' } } }] })
    expect(res.ok === false && res.error.fieldErrors?.variants).toEqual({ key: 'common.validation.product.variantFilesNotUploaded' })
  })
})
