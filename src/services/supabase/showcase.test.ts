import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createSupabaseCatalogService, toBusiness, type BusinessRow, type ProductRow } from './supabaseCatalogService'

type Call = [string, ...unknown[]]
type Table = { data?: unknown[]; error?: { code: string; message: string } }

/** supabase-js that answers each table with fixed rows (or an error) and records every builder call per table. */
function stub(tables: Record<string, Table>) {
  const calls: Record<string, Call[]> = {}
  const sb = {
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      const result = () => {
        const t = tables[table] ?? {}
        return { data: t.error ? null : (t.data ?? []), error: t.error ?? null }
      }
      for (const m of ['select', 'eq', 'neq', 'in', 'order', 'range', 'returns'])
        q[m] = (...args: unknown[]) => {
          ;(calls[table] ??= []).push([m, ...args])
          return q
        }
      q.maybeSingle = () => {
        ;(calls[table] ??= []).push(['maybeSingle'])
        const r = result()
        return Promise.resolve({ data: r.error ? null : ((r.data as unknown[])[0] ?? null), error: r.error })
      }
      q.then = (resolve: (v: unknown) => void) => resolve(result())
      return q
    },
  } as unknown as SupabaseClient
  return { sb, calls }
}

const business = (over: Partial<BusinessRow> = {}): BusinessRow => ({
  id: 'b1',
  name: 'Nordhaus',
  slug: 'nordhaus',
  logo_url: null,
  description: '',
  contact_email: null,
  contact_phone: null,
  contact_website: null,
  contact_address: null,
  status: 'active',
  accent_color: '#8A765C',
  default_currency: 'EUR',
  allow_own_models: false,
  is_house: false,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  ...over,
})
const HOUSE = business({ id: 'house', name: 'Sanctus', slug: 'sanctus-showcase', is_house: true })

const product = (id: string, business_id: string, over: Partial<ProductRow> = {}): ProductRow => ({
  id,
  business_id,
  slug: id,
  name: { en: id },
  short_description: { en: '' },
  description: { en: '' },
  material: { en: '' },
  cta_label: { en: '' },
  cta_url: null,
  category: 'sofa',
  price: 100,
  currency: 'EUR',
  status: 'published',
  width: 1,
  height: 1,
  depth: 1,
  dimension_unit: 'cm',
  weight_value: null,
  weight_unit: null,
  published_at: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  product_images: [],
  product_models: [],
  product_variants: [],
  ...over,
})

describe('the showcase business in the Supabase service (ADR-0047)', () => {
  it('toBusiness marks the house and leaves every other business without the key', () => {
    expect(toBusiness(HOUSE).house).toBe(true)
    expect('house' in toBusiness(business())).toBe(false)
  })

  it('getBusinesses asks for non-house rows only', async () => {
    const { sb, calls } = stub({ businesses: { data: [business()] } })
    const r = await createSupabaseCatalogService(sb).getBusinesses()
    if (!r.ok) throw new Error(r.error.message)
    expect(r.data.map((b) => b.slug)).toEqual(['nordhaus'])
    expect(calls.businesses).toContainEqual(['eq', 'is_house', false])
  })

  it('getCatalogs asks for non-house rows only', async () => {
    const { sb, calls } = stub({ businesses: { data: [business()] }, business_product_counts: { data: [{ business_id: 'b1', total: 2, published: 1 }] } })
    const r = await createSupabaseCatalogService(sb).getCatalogs()
    if (!r.ok) throw new Error(r.error.message)
    expect(r.data).toHaveLength(1)
    expect(calls.businesses).toContainEqual(['eq', 'is_house', false])
  })

  it("getCatalog('sanctus-showcase') is NOT_FOUND: the house is filtered out in the query", async () => {
    const { sb, calls } = stub({ businesses: { data: [] }, business_product_counts: { data: [] } })
    const r = await createSupabaseCatalogService(sb).getCatalog('sanctus-showcase')
    expect(r).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(calls.businesses).toEqual(expect.arrayContaining([['eq', 'is_house', false], ['eq', 'slug', 'sanctus-showcase']]))
  })

  it('getProducts leaves out the products of the house business, and resolves its id once', async () => {
    const { sb, calls } = stub({ businesses: { data: [{ id: 'house' }] }, products: { data: [product('p1', 'b1')] } })
    const svc = createSupabaseCatalogService(sb)
    const r = await svc.getProducts()
    if (!r.ok) throw new Error(r.error.message)
    expect(r.data.map((p) => p.id)).toEqual(['p1'])
    expect(calls.businesses).toContainEqual(['eq', 'is_house', true])
    expect(calls.products).toContainEqual(['neq', 'business_id', 'house'])
    await svc.getProducts({ status: 'published' })
    expect(calls.businesses!.filter((c) => c[0] === 'maybeSingle')).toHaveLength(1)
  })

  it('getProducts works when there is no house yet (no filter), and fails loudly when the lookup fails', async () => {
    const none = stub({ businesses: { data: [] }, products: { data: [product('p1', 'b1')] } })
    expect((await createSupabaseCatalogService(none.sb).getProducts()).ok).toBe(true)
    expect(none.calls.products!.some((c) => c[0] === 'neq')).toBe(false)
    const broken = stub({ businesses: { error: { code: '42703', message: 'column businesses.is_house does not exist' } }, products: { data: [product('p1', 'b1')] } })
    const r = await createSupabaseCatalogService(broken.sb).getProducts()
    expect(r.ok).toBe(false)
    expect(broken.calls.products).toBeUndefined() // no fallback to an unfiltered list
  })

  it('getShowcase returns the house business and its products', async () => {
    const { sb, calls } = stub({ businesses: { data: [HOUSE] }, products: { data: [product('h1', 'house'), product('h2', 'house', { status: 'draft' })] } })
    const r = await createSupabaseCatalogService(sb).getShowcase()
    if (!r.ok) throw new Error(r.error.message)
    expect(r.data.business).toMatchObject({ id: 'house', slug: 'sanctus-showcase', house: true })
    expect(r.data.products.map((p) => p.id)).toEqual(['h1', 'h2'])
    expect(calls.businesses).toContainEqual(['eq', 'is_house', true])
    expect(calls.products).toContainEqual(['eq', 'business_id', 'house'])
    expect(calls.products).toContainEqual(['order', 'updated_at', { ascending: false }])
  })

  it('getShowcase is NOT_FOUND without a house, and reports a read error instead of an empty showcase', async () => {
    expect(await createSupabaseCatalogService(stub({ businesses: { data: [] } }).sb).getShowcase()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    const r = await createSupabaseCatalogService(stub({ businesses: { data: [HOUSE] }, products: { error: { code: '57014', message: 'canceled' } } }).sb).getShowcase()
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error.code).not.toBe('NOT_FOUND')
  })

  it('getAnalytics leaves the house out of the platform view (businesses, products, counts, numbers)', async () => {
    const { sb, calls } = stub({
      businesses: { data: [{ id: 'b1' }] },
      products: { data: [{ id: 'p1', business_id: 'b1', status: 'published' }, { id: 'h1', business_id: 'house', status: 'published' }] },
      business_product_counts: { data: [{ business_id: 'b1', total: 1, published: 1, drafts: 0 }, { business_id: 'house', total: 4, published: 4, drafts: 0 }] },
    })
    const withRpc = { ...sb, rpc: () => stub({ analytics_daily: { data: [] } }).sb.from('analytics_daily') } as unknown as SupabaseClient
    const r = await createSupabaseCatalogService(withRpc).getAnalytics({ timeZone: 'Europe/Lisbon' })
    if (!r.ok) throw new Error(r.error.message)
    expect(calls.businesses).toContainEqual(['eq', 'is_house', false])
    expect(r.data.totals).toMatchObject({ businesses: 1, products: 1, published: 1 })
  })
})
