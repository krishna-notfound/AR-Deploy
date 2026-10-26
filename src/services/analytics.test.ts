import { describe, expect, it } from 'vitest'
import { type AnalyticsInput, EMBED_VIEWS_SINCE, summarize } from './analytics'
import { mockCatalogService as svc } from './mock/mockCatalogService'

const NOW = new Date('2026-10-26T12:00:00Z')
const base = (over: Partial<AnalyticsInput> = {}): AnalyticsInput => ({
  businesses: [{ id: 'b1' }, { id: 'b2' }],
  products: [
    { id: 'p1', businessId: 'b1', status: 'published' },
    { id: 'p2', businessId: 'b1', status: 'draft' },
    { id: 'p3', businessId: 'b2', status: 'published' },
  ],
  dailyStats: [],
  events: [],
  ...over,
})
const stat = (productId: string | null, businessId: string, date: string, views: number, embedViews = 0, arActivations = 0) =>
  ({ productId, businessId, date, views, embedViews, arActivations, modelInteractions: 0 })

describe('summarize', () => {
  it('summarize adds null-product rows to totals and the series and returns them as deletedProducts', () => {
    const s = summarize(
      base({
        dailyStats: [stat('p1', 'b1', '2026-10-26', 10, 2, 3), stat(null, 'b1', '2026-10-25', 500, 4, 6), stat(null, 'b2', '2026-10-25', 7)],
      }),
      'b1',
      NOW,
      false,
    )
    expect(s.totals).toMatchObject({ views: 510, embedViews: 6, arActivations: 9 })
    expect(s.deletedProducts).toEqual({ views: 500, embedViews: 4, arActivations: 6, modelInteractions: 0 })
    // The series counts page and embed views together; b2's deleted product is out of scope.
    expect(s.series.find((p) => p.date === '2026-10-25')).toEqual({ date: '2026-10-25', views: 504, arActivations: 6 })
    expect(s.series.find((p) => p.date === '2026-10-26')).toEqual({ date: '2026-10-26', views: 12, arActivations: 3 })
    // Not a product row: the per-product list only has products that exist.
    expect(s.byProduct.map((p) => p.productId)).toEqual(['p1', 'p2'])
    expect(s.byBusiness).toEqual([{ businessId: 'b1', views: 516, arActivations: 9, products: 2 }])
    expect(summarize(base({ dailyStats: [stat('p1', 'b1', '2026-10-26', 1)] }), undefined, NOW, false).deletedProducts).toBeNull()
  })

  it('series keys follow timeZone', () => {
    const at = '2026-10-26T01:30:00Z'
    const events = [{ productId: 'p1', businessId: 'b1', type: 'view' as const, at }]
    const sp = summarize(base({ events }), undefined, NOW, false, 'America/Sao_Paulo')
    const lx = summarize(base({ events }), undefined, NOW, false, 'Europe/Lisbon')
    expect(sp.series.at(-1)!.date).toBe('2026-10-26')
    expect(sp.series[0]!.date).toBe('2026-09-27')
    expect(sp.series.filter((p) => p.views).map((p) => p.date)).toEqual(['2026-10-25'])
    expect(lx.series.filter((p) => p.views).map((p) => p.date)).toEqual(['2026-10-26'])
    // Late evening in São Paulo is already the next day in UTC: "today" is the local date.
    const late = summarize(base(), undefined, new Date('2026-10-27T01:00:00Z'), false, 'America/Sao_Paulo')
    expect(late.series.at(-1)!.date).toBe('2026-10-26')
    expect(late.series).toHaveLength(30)
    // An unknown zone counts as UTC rather than failing.
    expect(summarize(base({ events }), undefined, NOW, false, 'Mars/Base').series.filter((p) => p.views).map((p) => p.date)).toEqual(['2026-10-26'])
  })

  it('skips rows outside the 30-day window, counts embed views in the AR rate and ranks products by all views', () => {
    const s = summarize(
      base({ dailyStats: [stat('p1', 'b1', '2026-09-26', 1000), stat('p1', 'b1', '2026-10-01', 2, 2, 1), stat('p3', 'b2', '2026-10-01', 3)] }),
      undefined,
      NOW,
      false,
    )
    expect(s.totals.views).toBe(5)
    expect(s.byProduct.map((p) => p.productId)).toEqual(['p1', 'p3', 'p2'])
    expect(s.byProduct[0]).toMatchObject({ views: 2, embedViews: 2, arActivations: 1, arRate: 0.25 })
    expect(s.byProduct[2]).toMatchObject({ views: 0, embedViews: 0, arRate: 0 })
  })

  it('takes product counts from productCounts when given (exact counts past the 1000-row read)', () => {
    const s = summarize(
      base({ productCounts: [{ businessId: 'b1', total: 1200, published: 200, drafts: 1000 }, { businessId: 'b2', total: 1, published: 1, drafts: 0 }] }),
      undefined,
      NOW,
      false,
    )
    expect(s.totals).toMatchObject({ businesses: 2, products: 1201, published: 201, drafts: 1000 })
    expect(s.byBusiness.find((b) => b.businessId === 'b1')?.products).toBe(1200)
  })

  it('EMBED_VIEWS_SINCE is a date', () => {
    expect(EMBED_VIEWS_SINCE).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('demo service (R-W5-4)', () => {
  it("keeps a deleted product's views in the totals as deletedProducts", async () => {
    const before = await svc.getAnalytics({ timeZone: 'UTC' })
    if (!before.ok) throw new Error(before.error.message)
    const top = before.data.byProduct[0]!
    expect(top.views).toBeGreaterThan(0)
    expect((await svc.deleteProduct(top.productId)).ok).toBe(true)
    const after = await svc.getAnalytics({ timeZone: 'UTC' })
    if (!after.ok) throw new Error(after.error.message)
    expect(after.data.totals.views).toBe(before.data.totals.views)
    expect(after.data.deletedProducts?.views).toBe(top.views)
    expect(after.data.byProduct.some((p) => p.productId === top.productId)).toBe(false)
  })
})

describe('summarize: rows outside the series (S1.5 R-W8-3)', () => {
  it("summarize skips rows whose day isn't in the series", () => {
    const s = summarize(
      base({
        dailyStats: [stat('p1', 'b1', '2026-10-26', 5), stat('p1', 'b1', '2026-01-01', 900), stat(null, 'b1', '2026-01-01', 700)],
        events: [{ productId: 'p1', businessId: 'b1', type: 'view', at: '2025-01-01T10:00:00Z' }],
      }),
      'b1',
      NOW,
      false,
    )
    expect(s.totals.views).toBe(5)
    expect(s.deletedProducts).toBeNull()
    expect(s.byProduct.find((p) => p.productId === 'p1')?.views).toBe(5)
  })
})
