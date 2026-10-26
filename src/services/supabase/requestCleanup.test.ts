import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createSupabaseCatalogService } from './supabaseCatalogService'

// S4 Task 8 (R-S4-18): request photos and staged files are cleaned up with their product, option and business.
const variantRow = (id: string) => ({ id, product_id: 'p1', name: { en: id }, sort_order: 0, product_variant_images: [], product_variant_models: [] })
const productRow = (variants: string[]) => ({
  id: 'p1', business_id: 'b1', slug: 'c', name: { en: 'C' }, short_description: { en: '' }, description: { en: '' }, material: { en: '' },
  cta_label: { en: '' }, cta_url: null, category: 'chair', price: 1, currency: 'EUR', status: 'draft', width: 1, height: 1, depth: 1,
  dimension_unit: 'cm', weight_value: null, weight_unit: null, published_at: null, created_at: 'x', updated_at: 'x',
  product_images: [], product_models: [], product_variants: variants.map(variantRow),
})
const PATHS = [
  { bucket: 'model-request-photos', path: 'b1/r1/a.jpg', variant_id: null },
  { bucket: 'model-request-photos', path: 'b1/r2/b.jpg', variant_id: 'v1' },
  { bucket: 'model-request-photos', path: 'b1/r2/c.jpg', variant_id: 'v1' },
  { bucket: 'product-media', path: 'b1/staged.glb', variant_id: 'v1' },
]

type Opts = { tree?: Record<string, { name: string; id: string | null }[]>; variants?: string[]; variantsAfter?: string[]; paths?: unknown; pathsError?: boolean; saveError?: boolean; removeFail?: string[] }

function fake(o: Opts, log: string[]) {
  let saved = false
  const builder = (table: string) => {
    let op = 'select'
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'returns']) b[m] = () => b
    b.delete = () => ((op = 'delete'), b)
    const result = () => {
      if (table === 'products') return op === 'delete' ? { data: [{ id: 'p1' }], error: null } : { data: productRow((saved ? o.variantsAfter : undefined) ?? o.variants ?? []), error: null }
      if (table === 'businesses') return op === 'delete' ? { data: [{ id: 'b1' }], error: null } : { data: null, error: null }
      return { data: [], error: null } // no media table still references anything
    }
    b.single = () => Promise.resolve(result())
    b.maybeSingle = () => Promise.resolve(result())
    b.then = (f: (v: unknown) => unknown) => Promise.resolve(result()).then(f)
    return b
  }
  return {
    from: builder,
    rpc: (fn: string, args: unknown) => {
      log.push(`rpc ${fn} ${JSON.stringify(args)}`)
      if (fn === 'model_request_storage_paths') return Promise.resolve(o.pathsError ? { data: null, error: { message: 'boom' } } : { data: o.paths ?? [], error: null })
      saved = !o.saveError
      return Promise.resolve(o.saveError ? { data: null, error: { message: 'boom', code: 'XX000' } } : { data: 'p1', error: null })
    },
    storage: {
      from: (bucket: string) => ({
        list: (folder: string) => {
          log.push(`list ${bucket}/${folder}`)
          if (!o.tree) return Promise.resolve({ data: [], error: null })
          const entry = o.tree[`${bucket}/${folder}`]
          return Promise.resolve(entry ? { data: entry, error: null } : { data: null, error: { message: 'no' } })
        },
        remove: (paths: string[]) => {
          log.push(`remove ${bucket} ${[...paths].sort().join(',')}`)
          return Promise.resolve(o.removeFail?.includes(bucket) ? { data: null, error: { message: 'denied' } } : { data: [], error: null })
        },
        getPublicUrl: (p: string) => ({ data: { publicUrl: p } }),
      }),
    },
  } as unknown as SupabaseClient
}

describe('request clean-up (R-S4-18)', () => {
  it('deleteProduct removes the request photos from model-request-photos and the staged files from product-media after the delete', async () => {
    const log: string[] = []
    const svc = createSupabaseCatalogService(fake({ variants: ['v1'], paths: PATHS }, log))
    expect(await svc.deleteProduct('p1')).toEqual({ ok: true, data: { removedFiles: 4, failedFiles: 0 } })
    expect(log).toContain('rpc model_request_storage_paths {"p_product":"p1"}')
    expect(log).toContain('remove model-request-photos b1/r1/a.jpg,b1/r2/b.jpg,b1/r2/c.jpg')
    expect(log).toContain('remove product-media b1/staged.glb')
  })

  it('deleteProduct counts a photo removal that fails, and still succeeds', async () => {
    const svc = createSupabaseCatalogService(fake({ paths: PATHS, removeFail: ['model-request-photos'] }, []))
    expect(await svc.deleteProduct('p1')).toEqual({ ok: true, data: { removedFiles: 1, failedFiles: 3 } })
  })

  it('deleteProduct still deletes, and counts one failed file, when the paths cannot be read', async () => {
    const svc = createSupabaseCatalogService(fake({ pathsError: true }, []))
    expect(await svc.deleteProduct('p1')).toEqual({ ok: true, data: { removedFiles: 0, failedFiles: 1 } })
  })

  it('deleteBusiness removes the business model-request-photos folder', async () => {
    const log: string[] = []
    const svc = createSupabaseCatalogService(fake({}, log))
    expect(await svc.deleteBusiness('b1')).toEqual({ ok: true, data: { removedFiles: 0, failedFiles: 0 } })
    expect(log.filter((l) => l.startsWith('list ')).sort()).toEqual(['list business-logos/b1', 'list model-request-photos/b1', 'list product-media/b1'])
  })

  it('deleteBusiness descends into the request subfolders of model-request-photos and counts their files', async () => {
    const log: string[] = []
    const tree = {
      'product-media/b1': [], 'business-logos/b1': [],
      'model-request-photos/b1': [{ name: 'r1', id: null }, { name: 'r2', id: null }],
      'model-request-photos/b1/r1': [{ name: 'a.jpg', id: 'x' }, { name: 'b.jpg', id: 'y' }],
      'model-request-photos/b1/r2': [{ name: 'c.jpg', id: 'z' }],
    }
    const svc = createSupabaseCatalogService(fake({ tree }, log))
    expect(await svc.deleteBusiness('b1')).toEqual({ ok: true, data: { removedFiles: 3, failedFiles: 0 } })
    expect(log).toContain('remove model-request-photos b1/r1/a.jpg,b1/r1/b.jpg')
    expect(log).toContain('remove model-request-photos b1/r2/c.jpg')
    expect(log.filter((l) => l.startsWith('list ')).every((l) => l.includes('/b1'))).toBe(true)
  })

  it('deleteBusiness counts a request subfolder it cannot list as one failed file', async () => {
    const tree = {
      'product-media/b1': [], 'business-logos/b1': [],
      'model-request-photos/b1': [{ name: 'r1', id: null }, { name: 'r2', id: null }],
      'model-request-photos/b1/r2': [{ name: 'c.jpg', id: 'z' }],
    }
    const svc = createSupabaseCatalogService(fake({ tree }, []))
    expect(await svc.deleteBusiness('b1')).toEqual({ ok: true, data: { removedFiles: 1, failedFiles: 1 } })
  })

  it('updateProduct that drops an option while the paths cannot be read warns, and still saves', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const log: string[] = []
      const svc = createSupabaseCatalogService(fake({ variants: ['v1', 'v2'], variantsAfter: ['v2'], pathsError: true }, log))
      const current = await svc.getProductById('p1')
      if (!current.ok) throw new Error('product')
      const saved = await svc.updateProduct('p1', { variants: current.data.variants.filter((v) => v.id !== 'v1') })
      expect(saved.ok).toBe(true)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0]![0])).toMatch(/could not be read/)
    } finally {
      warn.mockRestore()
    }
  })

  it('updateProduct that removes an option deletes that option request photos after the save succeeds', async () => {
    const log: string[] = []
    const svc = createSupabaseCatalogService(fake({ variants: ['v1', 'v2'], variantsAfter: ['v2'], paths: PATHS }, log))
    const current = await svc.getProductById('p1')
    if (!current.ok) throw new Error('product')
    log.length = 0
    const saved = await svc.updateProduct('p1', { variants: current.data.variants.filter((v) => v.id !== 'v1') })
    expect(saved.ok).toBe(true)
    const iRpc = log.findIndex((l) => l.startsWith('rpc model_request_storage_paths'))
    const iSave = log.findIndex((l) => l.startsWith('rpc save_product'))
    expect(iRpc).toBeGreaterThanOrEqual(0)
    expect(iSave).toBeGreaterThan(iRpc)
    expect(log).toContain('remove model-request-photos b1/r2/b.jpg,b1/r2/c.jpg')
    expect(log).toContain('remove product-media b1/staged.glb')
    expect(log.some((l) => l.includes('b1/r1/a.jpg'))).toBe(false) // the product-level request stays
  })

  it('updateProduct that removes an option deletes nothing when the save fails', async () => {
    const log: string[] = []
    const svc = createSupabaseCatalogService(fake({ variants: ['v1', 'v2'], paths: PATHS, saveError: true }, log))
    const current = await svc.getProductById('p1')
    if (!current.ok) throw new Error('product')
    log.length = 0
    const saved = await svc.updateProduct('p1', { variants: current.data.variants.filter((v) => v.id !== 'v1') })
    expect(saved.ok).toBe(false)
    expect(log.filter((l) => l.startsWith('remove model-request-photos'))).toEqual([])
    expect(log.filter((l) => l.startsWith('remove product-media'))).toEqual([])
  })

  it('updateProduct that keeps every option does not read the paths', async () => {
    const log: string[] = []
    const svc = createSupabaseCatalogService(fake({ variants: ['v1'], paths: PATHS }, log))
    const current = await svc.getProductById('p1')
    if (!current.ok) throw new Error('product')
    log.length = 0
    expect((await svc.updateProduct('p1', { variants: current.data.variants })).ok).toBe(true)
    expect(log.some((l) => l.startsWith('rpc model_request_storage_paths'))).toBe(false)
  })
})
