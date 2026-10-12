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
    for (const op of ['select', 'insert', 'update', 'delete', 'eq', 'gte', 'order', 'limit', 'returns'])
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
    storage: { from: () => ({ createSignedUrls: () => Promise.resolve({ data: [], error: null }) }) },
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

  it('records analytics as an insert-only row without personal data', async () => {
    const calls: { table: string; op: string; args: unknown[] }[] = []
    const svc = createSupabaseCatalogService(fakeClient({ data: null, error: null }, calls))
    expect((await svc.recordEvent({ productId: 'p1', businessId: 'b1', type: 'view' })).ok).toBe(true)
    expect(calls).toEqual([{ table: 'product_analytics', op: 'insert', args: [{ product_id: 'p1', business_id: 'b1', event_type: 'view' }] }])
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
    expect(args.p_models).toEqual([{ url: null, storage_path: 'b1/m.glb', format: 'glb', file_name: 'm.glb', size_bytes: null }])
    expect(args.p_product).toMatchObject({ id: null, business_id: 'b1', price: 12000, dimension_unit: 'cm' })
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
    const sql = readFileSync('supabase/migrations/20261012171915_init_schema.sql', 'utf8')
    const list = /slug not in \(([^)]+)\)/.exec(sql)?.[1]?.match(/'([a-z]+)'/g)?.map((s) => s.slice(1, -1))
    expect(new Set(list)).toEqual(RESERVED_SUBDOMAINS)
  })
})
