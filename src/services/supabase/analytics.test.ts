import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { localDay } from '../analytics'
import { createSupabaseCatalogService } from './supabaseCatalogService'

const N = 1200
const today = localDay(new Date(), 'Europe/Lisbon')
const ROWS: Record<string, (i: number) => Record<string, unknown>> = {
  businesses: (i) => ({ id: `b${i}` }),
  products: (i) => ({ id: `p${i}`, business_id: `b${i}`, status: 'published' }),
  business_product_counts: (i) => ({ business_id: `b${i}`, total: 1, published: 1, drafts: 0 }),
  analytics_daily: (i) => ({ business_id: `b${i}`, product_id: `p${i}`, day: today, views: 1, embed_views: 2, ar_activations: 0, model_interactions: 0 }),
}

/**
 * supabase-js for getAnalytics: every read holds 1,200 rows and returns at most 1,000 per request (the API's
 * max_rows), so only paging with range reads them all. Records the ranges and the RPC arguments.
 */
function stub(rpcError?: { code: string; message: string }) {
  const ranges: Record<string, [number, number][]> = {}
  const rpcArgs: unknown[] = []
  const builder = (name: string) => {
    let range: [number, number] = [0, 999]
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'returns']) q[m] = () => q
    q.range = (from: number, to: number) => {
      ;(ranges[name] ??= []).push([from, to])
      range = [from, to]
      return q
    }
    q.then = (resolve: (v: unknown) => void) => {
      if (rpcError && name === 'analytics_daily') return resolve({ data: null, error: rpcError })
      const [from, to] = range
      const rows = Array.from({ length: Math.max(0, Math.min(N, from + 1000, to + 1) - from) }, (_, k) => ROWS[name]!(from + k))
      resolve({ data: rows, error: null })
    }
    return q
  }
  const sb = {
    from: (table: string) => builder(table),
    rpc: (fn: string, args: unknown) => {
      rpcArgs.push(args)
      return builder(fn)
    },
  } as unknown as SupabaseClient
  return { sb, ranges, rpcArgs }
}

describe('getAnalytics (R-W5-2, R-W5-6)', () => {
  it('getAnalytics pages products, businesses and analytics_daily with range until fewer than 1000 rows', async () => {
    const { sb, ranges, rpcArgs } = stub()
    const r = await createSupabaseCatalogService(sb).getAnalytics({ timeZone: 'Europe/Lisbon' })
    if (!r.ok) throw new Error(r.error.message)
    for (const name of ['businesses', 'products', 'business_product_counts', 'analytics_daily'])
      expect({ name, ranges: ranges[name] }).toEqual({ name, ranges: [[0, 999], [1000, 1999]] })
    // One call per page, with the same arguments.
    expect(rpcArgs).toEqual([{ p_tz: 'Europe/Lisbon', p_days: 30, p_business: null }, { p_tz: 'Europe/Lisbon', p_days: 30, p_business: null }])
    expect(r.data.isSample).toBe(false)
    expect(r.data.totals).toMatchObject({ businesses: N, products: N, published: N, drafts: 0, views: N, embedViews: 2 * N })
    expect(r.data.byProduct).toHaveLength(N)
    expect(r.data.series.at(-1)).toEqual({ date: today, views: 3 * N, arActivations: 0 })
  })

  it('passes the business and maps invalid_timezone to the fixed copy; no fallback data', async () => {
    const { sb, rpcArgs } = stub({ code: '22023', message: 'invalid_timezone' })
    const r = await createSupabaseCatalogService(sb).getBusinessAnalytics('b1', { timeZone: 'Nowhere/Gone' })
    expect(rpcArgs).toEqual([{ p_tz: 'Nowhere/Gone', p_days: 30, p_business: 'b1' }])
    expect(r).toEqual({ ok: false, error: { code: 'VALIDATION', message: "Your time zone setting isn't recognised. Choose it again in Preferences." } })
  })
})
