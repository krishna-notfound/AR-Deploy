import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { readBackendConfig } from './backend'
import type { ProductInput } from './catalogService'
import { selectService, unavailableService } from './index'
import { mockCatalogService } from './mock/mockCatalogService'
import { createSupabaseCatalogService, toSaveProductArgs } from './supabase/supabaseCatalogService'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }))

const URL_ = 'https://abc.supabase.co'
const KEY = 'sb_publishable_test'
const jwt = (payload: object) => `x.${btoa(JSON.stringify(payload))}.y`

describe('readBackendConfig', () => {
  it('defaults to demo when nothing is set', () => {
    expect(readBackendConfig({})).toEqual({ mode: 'demo' })
    expect(readBackendConfig({ VITE_DATA_MODE: 'demo' })).toEqual({ mode: 'demo' })
    expect(readBackendConfig({ VITE_DATA_MODE: 'Supabase' }).mode).toBe('misconfigured')
  })

  it('does not switch to Supabase just because credentials exist', () => {
    expect(readBackendConfig({ VITE_SUPABASE_URL: URL_, VITE_SUPABASE_PUBLISHABLE_KEY: KEY })).toEqual({ mode: 'demo' })
  })

  it('reports a partial Supabase configuration instead of guessing', () => {
    const c = readBackendConfig({ VITE_DATA_MODE: 'supabase', VITE_SUPABASE_URL: URL_ })
    expect(c.mode).toBe('misconfigured')
    expect(c.mode === 'misconfigured' && c.problem).toContain('VITE_SUPABASE_PUBLISHABLE_KEY')
    expect(readBackendConfig({ VITE_DATA_MODE: 'prod' }).mode).toBe('misconfigured')
    expect(readBackendConfig({ VITE_DATA_MODE: 'supabase', VITE_SUPABASE_URL: 'abc', VITE_SUPABASE_PUBLISHABLE_KEY: KEY }).mode).toBe('misconfigured')
  })

  it('refuses secret and service_role keys in the browser', () => {
    const base = { VITE_DATA_MODE: 'supabase', VITE_SUPABASE_URL: URL_ }
    expect(readBackendConfig({ ...base, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' }).mode).toBe('misconfigured')
    expect(readBackendConfig({ ...base, VITE_SUPABASE_PUBLISHABLE_KEY: jwt({ role: 'service_role' }) }).mode).toBe('misconfigured')
    expect(readBackendConfig({ ...base, VITE_SUPABASE_PUBLISHABLE_KEY: jwt({ role: 'anon' }) }).mode).toBe('supabase')
  })

  it('accepts a complete Supabase configuration', () => {
    expect(readBackendConfig({ VITE_DATA_MODE: 'supabase', VITE_SUPABASE_URL: URL_, VITE_SUPABASE_PUBLISHABLE_KEY: KEY })).toEqual({
      mode: 'supabase',
      url: URL_,
      publishableKey: KEY,
    })
  })
})

describe('selectService', () => {
  beforeEach(() => vi.mocked(createClient).mockClear())

  it('uses the mock service in demo mode and never creates a Supabase client', () => {
    expect(selectService({ mode: 'demo' })).toBe(mockCatalogService)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('fails every call when misconfigured, rather than serving demo data', async () => {
    const svc = selectService({ mode: 'misconfigured', problem: 'Missing key' })
    expect(createClient).not.toHaveBeenCalled()
    const res = await svc.getProducts()
    expect(res).toEqual({ ok: false, error: { code: 'CONFIG', message: 'Missing key' } })
    expect(typeof svc.subscribe(() => {})).toBe('function')
  })

  it('creates exactly one Supabase client in Supabase mode', () => {
    const cfg = { mode: 'supabase' as const, url: URL_, publishableKey: KEY }
    selectService(cfg)
    selectService(cfg)
    expect(createClient).toHaveBeenCalledTimes(1)
    expect(createClient).toHaveBeenCalledWith(URL_, KEY)
  })

  it('unavailableService returns errors for writes too', async () => {
    const res = await unavailableService('x').createBusiness({} as never)
    expect(res.ok).toBe(false)
  })
})

// ---- Supabase service against a fake client: errors must surface, never fake success ----

type Resp = { data: unknown; error: { code?: string; message: string } | null }

function fakeClient(resp: Resp | (() => never), calls: { table: string; op: string; args: unknown[] }[] = []) {
  const settle = () => (typeof resp === 'function' ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(resp))
  const builder = (table: string): Record<string, unknown> => {
    const b: Record<string, unknown> = {}
    for (const op of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'gte', 'order', 'limit', 'returns'])
      b[op] = (...args: unknown[]) => {
        calls.push({ table, op, args })
        return b
      }
    b.maybeSingle = () => settle()
    b.single = () => settle()
    b.then = (ok: (v: Resp) => unknown, err: (e: unknown) => unknown) => settle().then(ok, err)
    return b
  }
  return {
    from: (t: string) => builder(t),
    rpc: (...args: unknown[]) => {
      calls.push({ table: 'rpc', op: 'rpc', args })
      return settle()
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: () => Promise.resolve({ data: [], error: null }),
        list: () => Promise.resolve({ data: [], error: null }),
        remove: (paths: string[]) => {
          calls.push({ table: `storage:${bucket}`, op: 'remove', args: [paths] })
          return Promise.resolve({ data: [], error: null })
        },
      }),
    },
    functions: {
      invoke: (name: string, opts: unknown) => {
        calls.push({ table: 'functions', op: name, args: [opts] })
        return typeof resp === 'function' ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(resp)
      },
    },
  } as unknown as SupabaseClient
}

const businessInput = {
  name: 'Casa',
  slug: 'casa',
  description: '',
  contact: {},
  status: 'draft' as const,
  branding: { accentColor: '#B4441A' },
  defaultCurrency: 'EUR' as const,
}

describe('Supabase catalog service', () => {
  it('maps a duplicate slug to a CONFLICT field error', async () => {
    const svc = createSupabaseCatalogService(fakeClient({ data: null, error: { code: '23505', message: 'duplicate key' } }))
    const res = await svc.createBusiness(businessInput)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.code).toBe('CONFLICT')
      expect(res.error.fieldErrors?.slug).toMatch(/already used/)
    }
  })

  it('maps RLS denials to PERMISSION and does not notify listeners', async () => {
    const svc = createSupabaseCatalogService(fakeClient({ data: null, error: { code: '42501', message: 'new row violates row-level security policy' } }))
    const listener = vi.fn()
    svc.subscribe(listener)
    const res = await svc.createBusiness(businessInput)
    expect(res.ok === false && res.error.code).toBe('PERMISSION')
    expect(listener).not.toHaveBeenCalled()
  })

  it('treats an update that matched no rows as an error, not success', async () => {
    const svc = createSupabaseCatalogService(fakeClient({ data: null, error: null }))
    const res = await svc.setBusinessStatus('b1', 'active')
    expect(res.ok === false && res.error.code).toBe('NOT_FOUND')
  })

  it('returns an error when Supabase is unreachable', async () => {
    const svc = createSupabaseCatalogService(
      fakeClient(() => {
        throw new Error('unused')
      }),
    )
    const res = await svc.getBusinesses()
    expect(res.ok === false && res.error.code).toBe('UNKNOWN')
    expect(res.ok === false && res.error.message).toMatch(/Failed to fetch/)
  })

  it('notifies listeners after a successful write', async () => {
    const row = { ...businessInput, id: 'b1', logo_url: null, contact_email: null, contact_phone: null, contact_website: null, contact_address: null, accent_color: '#B4441A', default_currency: 'EUR', created_at: 'x', updated_at: 'x' }
    const svc = createSupabaseCatalogService(fakeClient({ data: row, error: null }))
    const listener = vi.fn()
    svc.subscribe(listener)
    const res = await svc.createBusiness(businessInput)
    expect(res.ok).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('records analytics only through the rate-limited Edge Function, never by direct insert', async () => {
    const calls: { table: string; op: string; args: unknown[] }[] = []
    const svc = createSupabaseCatalogService(fakeClient({ data: null, error: null }, calls))
    expect((await svc.recordEvent({ productId: 'p1', businessId: 'b1', type: 'view' })).ok).toBe(true)
    expect(calls).toEqual([{ table: 'functions', op: 'track-event', args: [{ body: { productId: 'p1', businessId: 'b1', type: 'view' } }] }])
  })

  it('surfaces a rate-limited event as RATE_LIMITED, not success', async () => {
    const svc = createSupabaseCatalogService(fakeClient({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { status: 429 } } as never }))
    const res = await svc.recordEvent({ productId: 'p1', businessId: 'b1', type: 'view' })
    expect(res.ok === false && res.error.code).toBe('RATE_LIMITED')
  })

  it('refuses to save products that still reference browser-only files', async () => {
    const calls: { table: string; op: string; args: unknown[] }[] = []
    const svc = createSupabaseCatalogService(fakeClient({ data: 'p1', error: null }, calls))
    const input = sampleProduct({ images: [{ id: 'i', url: 'data:image/png;base64,AAA', isPrimary: true, kind: 'gallery' }] })
    const res = await svc.createProduct(input)
    expect(res.ok === false && res.error.code).toBe('VALIDATION')
    expect(calls.some((c) => c.op === 'rpc')).toBe(false)
  })

  it('reset is demo-only', async () => {
    const res = await createSupabaseCatalogService(fakeClient({ data: null, error: null })).resetDemoData()
    expect(res.ok === false && res.error.code).toBe('UNSUPPORTED')
  })
})

describe('toSaveProductArgs', () => {
  it('stores storage paths instead of signed URLs and keeps external URLs', () => {
    const args = toSaveProductArgs(
      null,
      sampleProduct({
        images: [
          { id: 'a', url: 'https://signed.example/x?token=1', storagePath: 'b1/a.jpg', isPrimary: false, kind: 'gallery' },
          { id: 'b', url: 'https://cdn.example/y.jpg', isPrimary: false, kind: 'additional' },
        ],
        models: { glb: { format: 'glb', url: 'https://signed.example/m', storagePath: 'b1/m.glb', fileName: 'm.glb', status: 'valid' } },
      }),
    )
    expect(args.p_images[0]).toMatchObject({ url: null, storage_path: 'b1/a.jpg', is_primary: true, sort_order: 0 })
    expect(args.p_images[1]).toMatchObject({ url: 'https://cdn.example/y.jpg', storage_path: null, kind: 'additional' })
    expect(args.p_models).toEqual([{ url: null, storage_path: 'b1/m.glb', format: 'glb', file_name: 'm.glb', size_bytes: null, required_extensions: null }])
    expect(args.p_product).toMatchObject({ id: null, business_id: 'b1', price: 12000, dimension_unit: 'cm' })
  })
})

describe('product draft validation', () => {
  it('limits slugs to 70 characters and rejects bad variant price differences', async () => {
    const { validateProductDraft } = await import('./validation')
    expect(validateProductDraft(sampleProduct({ slug: 'a'.repeat(70) }), []).slug).toBeUndefined()
    expect(validateProductDraft(sampleProduct({ slug: 'a'.repeat(71) }), []).slug).toMatch(/70 characters/)
    const variant = (priceDelta?: number) => sampleProduct({ variants: [{ id: 'v', name: { en: 'Oak' }, priceDelta }] })
    expect(validateProductDraft(variant(2500), []).variants).toBeUndefined()
    expect(validateProductDraft(variant(undefined), []).variants).toBeUndefined()
    expect(validateProductDraft(variant(NaN), []).variants).toBeDefined()
    expect(validateProductDraft(variant(-100), []).variants).toBeDefined()
  })
})

function sampleProduct(over: Partial<ProductInput> = {}): ProductInput {
  return {
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
    dimensions: { width: 50, height: 80, depth: 50, unit: 'cm' },
    material: { en: '' },
    variants: [],
    cta: { label: { en: '' } },
    ...over,
  }
}

describe('reserved subdomains', () => {
  it('refuses reserved catalog addresses and matches the database check', async () => {
    const { validateBusiness } = await import('./validation')
    const { RESERVED_SUBDOMAINS } = await import('@/tenant/resolveTenant')
    expect(validateBusiness({ ...businessInput, slug: 'www' }, []).slug).toMatch(/reserved/)
    const { readFileSync } = await import('node:fs')
    const sql = readFileSync('supabase/migrations/20261012192143_init_schema.sql', 'utf8')
    const list = /slug not in \(([^)]+)\)/.exec(sql)?.[1]?.match(/'([a-z]+)'/g)?.map((s) => s.slice(1, -1))
    expect(new Set(list)).toEqual(RESERVED_SUBDOMAINS)
  })
})

describe('storage path helpers', () => {
  it('collects every stored file of a product, ignoring external URLs', async () => {
    const { mediaPaths } = await import('./supabase/supabaseCatalogService')
    const p = sampleProduct({
      images: [
        { id: 'a', url: 'https://s/x', storagePath: 'b1/a.jpg', isPrimary: true, kind: 'gallery' },
        { id: 'b', url: 'https://cdn.example/y.jpg', isPrimary: false, kind: 'additional' },
      ],
      models: { glb: { format: 'glb', url: 'https://s/m', storagePath: 'b1/m.glb', fileName: 'm.glb', status: 'valid' } },
    })
    expect(mediaPaths(p)).toEqual(['b1/a.jpg', 'b1/m.glb'])
  })

  it('extracts the object path of logos in our public bucket only', async () => {
    const { logoPath } = await import('./supabase/supabaseCatalogService')
    expect(logoPath('https://ref.supabase.co/storage/v1/object/public/business-logos/b1/l%201.png')).toBe('b1/l 1.png')
    expect(logoPath('https://cdn.example/logo.png')).toBeNull()
    expect(logoPath(undefined)).toBeNull()
  })

  it('demo mode keeps owner management session-only and never claims an email was sent', async () => {
    const res = await mockCatalogService.provisionOwner({ businessId: 'biz_casa', email: 'owner@demo.test', language: 'en' })
    expect(res.ok && res.data.email).toMatchObject({ status: 'blocked', error: 'demo_mode' })
  })
})

describe('database errors shown to users', () => {
  it('never echo raw Postgres text (policy, constraint or column names)', async () => {
    const { mapDbError } = await import('./supabase/supabaseCatalogService')
    const raw = 'new row violates row-level security policy "Members manage products" for table "products"'
    for (const code of ['42501', '23514', '23502', '22P02', 'XX000', undefined]) {
      const r = mapDbError({ code, message: raw })
      expect(r.ok === false && r.error.message).not.toMatch(/policy|products|violates/)
    }
  })

  it('turns the publish-needs-a-photo database rule into a field error', async () => {
    const { mapDbError } = await import('./supabase/supabaseCatalogService')
    const r = mapDbError({ code: '23514', message: 'publish_requires_gallery_image' })
    expect(r.ok === false && r.error.fieldErrors?.images).toMatch(/image/)
  })

  it('keeps our own user-facing messages from database functions (P0002)', async () => {
    const { mapDbError } = await import('./supabase/supabaseCatalogService')
    const r = mapDbError({ code: 'P0002', message: 'No account uses this email address' })
    expect(r.ok === false && r.error.message).toBe('No account uses this email address')
  })
})

describe('logo cleanup', () => {
  it('only deletes logo files inside the business’s own folder', async () => {
    const { ownedLogoPath } = await import('./supabase/supabaseCatalogService')
    const url = (p: string) => `https://ref.supabase.co/storage/v1/object/public/business-logos/${p}`
    expect(ownedLogoPath(url('b1/l.png'), 'b1')).toBe('b1/l.png')
    expect(ownedLogoPath(url('b2/l.png'), 'b1')).toBeNull() // another business's logo
    expect(ownedLogoPath(url('new/l.png'), 'b1')).toBeNull() // shared staging folder: never deleted
    expect(ownedLogoPath(url('b1/../b2/l.png'), 'b1')).toBeNull()
  })
})

describe('production build guard', () => {
  const good = { VERCEL_ENV: 'production', VITE_DATA_MODE: 'supabase', VITE_SUPABASE_URL: URL_, VITE_SUPABASE_PUBLISHABLE_KEY: KEY }
  it('accepts a complete Supabase configuration', async () => {
    const { productionBuildProblem } = await import('./backendConfig')
    expect(productionBuildProblem(good)).toBeNull()
  })
  it('rejects demo mode, missing values, http URLs and secret keys in production', async () => {
    const { productionBuildProblem } = await import('./backendConfig')
    expect(productionBuildProblem({ ...good, VITE_DATA_MODE: undefined })).toMatch(/VITE_DATA_MODE/)
    expect(productionBuildProblem({ ...good, VITE_SUPABASE_URL: '' })).toMatch(/VITE_SUPABASE_URL/)
    expect(productionBuildProblem({ ...good, VITE_SUPABASE_URL: 'http://abc.supabase.co' })).toMatch(/https/)
    expect(productionBuildProblem({ ...good, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_x' })).toMatch(/secret/)
    expect(productionBuildProblem({ ...good, VITE_SUPABASE_PUBLISHABLE_KEY: jwt({ role: 'service_role' }) })).toMatch(/secret/)
  })
  it('leaves local, preview and demo builds alone', async () => {
    const { productionBuildProblem } = await import('./backendConfig')
    expect(productionBuildProblem({})).toBeNull()
    expect(productionBuildProblem({ VERCEL_ENV: 'preview', VITE_DATA_MODE: 'demo' })).toBeNull()
  })
})
