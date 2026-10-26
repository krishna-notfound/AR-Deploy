import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { BusinessInput } from '../catalogService'
import { createSupabaseCatalogService, stagedLogoPath } from './supabaseCatalogService'

const BASE = 'https://x.supabase.co/storage/v1/object/public/business-logos/'
const input: BusinessInput = {
  name: 'Casa',
  slug: 'casa',
  description: '',
  contact: {},
  status: 'draft',
  branding: { accentColor: '#B4441A' },
  defaultCurrency: 'EUR',
}
const bizRow = (logo: string | null) => ({
  id: 'b1', name: 'Casa', slug: 'casa', description: '', status: 'draft', logo_url: logo, contact_email: null, contact_phone: null,
  contact_website: null, contact_address: null, accent_color: '#B4441A', default_currency: 'EUR', created_at: 'x', updated_at: 'x',
})
const productRow = {
  id: 'p1', business_id: 'b1', slug: 'c', name: { en: 'C' }, short_description: { en: '' }, description: { en: '' }, material: { en: '' },
  cta_label: { en: '' }, cta_url: null, category: 'chair', price: 1, currency: 'EUR', status: 'draft', width: 1, height: 1, depth: 1,
  dimension_unit: 'cm', weight_value: null, weight_unit: null, published_at: null, created_at: 'x', updated_at: 'x',
  product_images: [
    { id: 'i1', url: null, storage_path: 'b1/a.jpg', alt: null, is_primary: true, kind: 'gallery', sort_order: 0 },
    { id: 'i2', url: null, storage_path: 'b1/b.jpg', alt: null, is_primary: false, kind: 'gallery', sort_order: 1 },
  ],
  product_models: [],
  product_variants: [],
}

type Opts = {
  insert?: { data: unknown; error: unknown }
  update?: { data: unknown; error: unknown }
  /** Object counts per `bucket/folder`. */
  files?: Record<string, number>
  listError?: string[]
  removeFail?: boolean
  moveError?: boolean
  stillUsed?: string[]
  refsError?: boolean
  businessRow?: unknown
}

function fake(o: Opts, log: string[]) {
  const builder = (table: string) => {
    let op = 'select'
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'returns']) b[m] = () => b
    b.insert = () => ((op = 'insert'), b)
    b.update = () => ((op = 'update'), b)
    b.delete = () => ((op = 'delete'), b)
    const result = () => {
      if (table === 'businesses') {
        if (op === 'insert') return o.insert ?? { data: bizRow(null), error: null }
        if (op === 'update') return o.update ?? { data: bizRow(null), error: null }
        if (op === 'delete') return { data: [{ id: 'b1' }], error: null }
        return { data: o.businessRow ?? bizRow(null), error: null }
      }
      if (table === 'products') return op === 'delete' ? { data: [{ id: 'p1' }], error: null } : { data: productRow, error: null }
      if (o.refsError) return { data: null, error: { message: 'boom' } }
      return { data: (o.stillUsed ?? []).map((storage_path) => ({ storage_path })), error: null }
    }
    b.single = () => Promise.resolve(result())
    b.maybeSingle = () => Promise.resolve(result())
    b.then = (f: (v: unknown) => unknown) => Promise.resolve(result()).then(f)
    return b
  }
  return {
    from: builder,
    rpc: () => Promise.resolve({ data: 'p1', error: null }),
    storage: {
      from: (bucket: string) => ({
        list: (folder: string, opts: { limit: number; offset?: number }) => {
          const key = `${bucket}/${folder}`
          log.push(`list ${key} ${opts.offset ?? 0}`)
          if (o.listError?.includes(key)) return Promise.resolve({ data: null, error: { message: 'no' } })
          const total = o.files?.[key] ?? 0
          const from = opts.offset ?? 0
          const n = Math.max(0, Math.min(opts.limit, total - from))
          return Promise.resolve({ data: Array.from({ length: n }, (_, i) => ({ id: `id${from + i}`, name: `f${from + i}` })), error: null })
        },
        remove: (paths: string[]) => {
          log.push(`remove ${bucket} ${paths.length}`)
          return Promise.resolve(o.removeFail ? { data: null, error: { message: 'denied' } } : { data: [], error: null })
        },
        move: (from: string, to: string) => {
          log.push(`move ${from} ${to}`)
          return Promise.resolve(o.moveError ? { data: null, error: { message: 'no' } } : { data: {}, error: null })
        },
        getPublicUrl: (p: string) => ({ data: { publicUrl: `${BASE}${p}` } }),
        createSignedUrls: (ps: string[]) => Promise.resolve({ data: ps.map((p) => ({ path: p, signedUrl: `s/${p}` })), error: null }),
      }),
    },
  } as unknown as SupabaseClient
}

describe('storage sweep (R-W3-4)', () => {
  it('removeFolder pages past 1000 objects (1001 files: two list calls, removedFiles 1001)', async () => {
    const log: string[] = []
    const svc = createSupabaseCatalogService(fake({ files: { 'product-media/b1': 1001 } }, log))
    expect(await svc.deleteBusiness('b1')).toEqual({ ok: true, data: { removedFiles: 1001, failedFiles: 0 } })
    expect(log.filter((l) => l.startsWith('list product-media/b1'))).toEqual(['list product-media/b1 0', 'list product-media/b1 1000'])
  })

  it('deleteBusiness returns failedFiles 2 when remove fails for a page of 2', async () => {
    const svc = createSupabaseCatalogService(fake({ files: { 'product-media/b1': 2 }, removeFail: true }, []))
    expect(await svc.deleteBusiness('b1')).toEqual({ ok: true, data: { removedFiles: 0, failedFiles: 2 } })
  })

  it('an unlistable folder counts as 1 failed file', async () => {
    const svc = createSupabaseCatalogService(fake({ listError: ['business-logos/b1'] }, []))
    expect(await svc.deleteBusiness('b1')).toEqual({ ok: true, data: { removedFiles: 0, failedFiles: 1 } })
  })

  it('sums the media folder, the logo folder and the owned logo', async () => {
    const svc = createSupabaseCatalogService(fake({ files: { 'product-media/b1': 2, 'business-logos/b1': 1 }, businessRow: bizRow(`${BASE}b1/f0`) }, []))
    expect(await svc.deleteBusiness('b1')).toEqual({ ok: true, data: { removedFiles: 3, failedFiles: 0 } })
  })

  it('counts a logo the folder sweep could not remove once, not twice', async () => {
    const svc = createSupabaseCatalogService(fake({ files: { 'business-logos/b1': 1 }, removeFail: true, businessRow: bizRow(`${BASE}b1/f0`) }, []))
    expect(await svc.deleteBusiness('b1')).toEqual({ ok: true, data: { removedFiles: 0, failedFiles: 1 } })
  })

  it('deleteProduct returns the orphan count as removedFiles; a failed reference check keeps the files and counts them as failedFiles', async () => {
    const log: string[] = []
    const used = createSupabaseCatalogService(fake({ stillUsed: ['b1/a.jpg'] }, log))
    expect(await used.deleteProduct('p1')).toEqual({ ok: true, data: { removedFiles: 1, failedFiles: 0 } })
    const unsure = createSupabaseCatalogService(fake({ refsError: true }, log))
    log.length = 0
    expect(await unsure.deleteProduct('p1')).toEqual({ ok: true, data: { removedFiles: 0, failedFiles: 2 } })
    expect(log.some((l) => l.startsWith('remove'))).toBe(false)
  })
})

describe('createBusiness logo move (R-W3-4)', () => {
  const staged = `${BASE}new/abc.png`

  it('stagedLogoPath is new/<file> for a logo-bucket URL in new/, else null', () => {
    expect(stagedLogoPath(staged)).toBe('new/abc.png')
    expect(stagedLogoPath(`${BASE}b1/abc.png`)).toBeNull()
    expect(stagedLogoPath(`${BASE}new/../b1/abc.png`)).toBeNull()
    expect(stagedLogoPath('https://example.com/new/abc.png')).toBeNull()
    expect(stagedLogoPath(undefined)).toBeNull()
  })

  it('createBusiness with a new/ logo moves it to <id>/ and updates logo_url to the new public URL', async () => {
    const log: string[] = []
    const svc = createSupabaseCatalogService(fake({ insert: { data: bizRow(staged), error: null }, update: { data: bizRow(`${BASE}b1/abc.png`), error: null } }, log))
    const r = await svc.createBusiness({ ...input, logoUrl: staged })
    expect(log).toContain('move new/abc.png b1/abc.png')
    expect(r.ok && r.data.logoUrl).toBe(`${BASE}b1/abc.png`)
    expect(r.ok && r.data.logoMoveFailed).toBeUndefined()
  })

  it('a failed move keeps the business and returns logoMoveFailed: true', async () => {
    const svc = createSupabaseCatalogService(fake({ insert: { data: bizRow(staged), error: null }, moveError: true }, []))
    const r = await svc.createBusiness({ ...input, logoUrl: staged })
    expect(r.ok && r.data.logoMoveFailed).toBe(true)
    expect(r.ok && r.data.id).toBe('b1')
  })

  it('a failed logo_url update keeps the business and returns logoMoveFailed: true', async () => {
    const svc = createSupabaseCatalogService(fake({ insert: { data: bizRow(staged), error: null }, update: { data: null, error: { message: 'no' } } }, []))
    const r = await svc.createBusiness({ ...input, logoUrl: staged })
    expect(r.ok && r.data.logoMoveFailed).toBe(true)
    expect(r.ok && r.data.logoUrl).toBeUndefined()
  })

  it('a logo outside new/ is not moved', async () => {
    const log: string[] = []
    const own = `${BASE}b1/abc.png`
    const svc = createSupabaseCatalogService(fake({ insert: { data: bizRow(own), error: null } }, log))
    expect((await svc.createBusiness({ ...input, logoUrl: own })).ok).toBe(true)
    expect(log.some((l) => l.startsWith('move'))).toBe(false)
  })

  it('a refused insert never calls storage.move', async () => {
    const log: string[] = []
    const svc = createSupabaseCatalogService(fake({ insert: { data: null, error: { code: '42501', message: 'rls' } } }, log))
    expect((await svc.createBusiness({ ...input, logoUrl: staged })).ok).toBe(false)
    expect(log.some((l) => l.startsWith('move'))).toBe(false)
  })
})
