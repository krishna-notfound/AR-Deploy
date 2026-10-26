import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createSupabaseCatalogService } from './supabaseCatalogService'

type Call = [string, ...unknown[]]

/** supabase-js that answers each table with fixed rows (or an error) and records every builder call per table. */
function stub(tables: Record<string, { data?: unknown[]; error?: { code: string; message: string } }>) {
  const calls: Record<string, Call[]> = {}
  const sb = {
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'order', 'limit', 'range', 'returns'])
        q[m] = (...args: unknown[]) => {
          ;(calls[table] ??= []).push([m, ...args])
          return q
        }
      q.then = (resolve: (v: unknown) => void) => {
        const t = tables[table] ?? {}
        resolve({ data: t.error ? null : (t.data ?? []), error: t.error ?? null })
      }
      return q
    },
  } as unknown as SupabaseClient
  return { sb, calls }
}

const row = (id: string, event_type: string, extra: Record<string, unknown> = {}) => ({
  id,
  created_at: `2026-10-2${id}T10:00:00Z`,
  event_type,
  actor_id: null,
  application_id: null,
  business_id: 'b1',
  from_status: null,
  to_status: null,
  metadata: {},
  ...extra,
})

describe('getRecentActivity from audit events (R-W5-5)', () => {
  it('reads the activity event types newest first, scoped to the business, and names the catalog from its row', async () => {
    const { sb, calls } = stub({
      audit_events: {
        data: [
          row('5', 'product_unpublished', { metadata: { product_id: 'p1', name: 'Oslo sofa' } }),
          row('4', 'business_status_changed', { from_status: 'active', to_status: 'inactive' }),
          row('3', 'product_deleted', { metadata: { product_id: 'p2', name: 'Porto chair' } }),
          row('2', 'product_slug_changed', { metadata: { product_id: 'p1', name: 'Oslo sofa', from: 'oslo', to: 'oslo-sofa' } }),
          row('1', 'product_created', { metadata: { product_id: 'p1', name: 'Oslo sofa' } }),
        ],
      },
      businesses: { data: [{ id: 'b1', name: 'Nordhaus Living' }] },
    })
    const r = await createSupabaseCatalogService(sb).getRecentActivity({ businessId: 'b1', limit: 6 })
    if (!r.ok) throw new Error(r.error.message)
    expect(r.data.map((a) => a.message)).toEqual([
      'Oslo sofa was unpublished',
      'Catalog for Nordhaus Living was paused',
      'Porto chair was deleted',
      'Oslo sofa has a new address: /oslo-sofa',
      'Oslo sofa was added',
    ])
    expect(r.data[0]).toMatchObject({ kind: 'product_unpublished', businessId: 'b1', productId: 'p1' })
    // A deleted product links nowhere.
    expect(r.data[2]!.productId).toBeUndefined()
    const q = calls.audit_events!
    expect(q).toContainEqual(['in', 'event_type', ['business_created', 'business_status_changed', 'business_deleted', 'product_created', 'product_published', 'product_unpublished', 'product_slug_changed', 'product_deleted']])
    expect(q).toContainEqual(['order', 'created_at', { ascending: false }])
    expect(q).toContainEqual(['eq', 'business_id', 'b1'])
    expect(q).toContainEqual(['limit', 6])
    expect(calls.businesses).toContainEqual(['in', 'id', ['b1']])
  })

  it('never says "was published" for a product whose only events are drafts', async () => {
    const { sb } = stub({ audit_events: { data: [row('1', 'product_created', { metadata: { product_id: 'p9', name: 'Draft lamp' } })] } })
    const r = await createSupabaseCatalogService(sb).getRecentActivity()
    if (!r.ok) throw new Error(r.error.message)
    expect(r.data.map((a) => a.message)).toEqual(['Draft lamp was added'])
  })

  it('names a business_created row from its business, as the demo does', async () => {
    const { sb, calls } = stub({
      audit_events: { data: [row('1', 'business_created', { metadata: { source: 'application' } })] },
      businesses: { data: [{ id: 'b1', name: 'Atelier Norte' }] },
    })
    const r = await createSupabaseCatalogService(sb).getRecentActivity()
    if (!r.ok) throw new Error(r.error.message)
    expect(r.data.map((a) => a.message)).toEqual(['Atelier Norte was created'])
    expect(calls.businesses).toContainEqual(['in', 'id', ['b1']])
  })

  it('an error is returned as an error, with no fallback data', async () => {
    const { sb } = stub({ audit_events: { error: { code: '42501', message: 'permission denied' } } })
    const r = await createSupabaseCatalogService(sb).getRecentActivity()
    expect(r.ok).toBe(false)
  })
})

describe('catalogs count products exactly (R-W5-6)', () => {
  it('getCatalogs reads business_product_counts, not the products table', async () => {
    const { sb, calls } = stub({
      businesses: { data: [{ id: 'b1', name: 'Big', slug: 'big', status: 'active', description: '', contact: {}, branding: {}, default_currency: 'EUR', created_at: '2026-01-01', updated_at: '2026-01-01' }] },
      business_product_counts: { data: [{ business_id: 'b1', total: 1200, published: 1100 }] },
    })
    const r = await createSupabaseCatalogService(sb).getCatalogs()
    if (!r.ok) throw new Error(r.error.message)
    expect(r.data[0]).toMatchObject({ totalProductCount: 1200, publishedProductCount: 1100 })
    expect(calls.products).toBeUndefined()
  })
})
