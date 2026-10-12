// Shared by the mock and Supabase services: turns daily aggregates + raw events into an AnalyticsSummary.
import type { ActivityItem, AnalyticsEvent, AnalyticsSummary, Business, DailyPoint, ID, Product, ProductAnalytics } from '@/domain/types'

const DAYS = 30

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export interface DailyStat {
  productId: ID
  businessId: ID
  date: string // YYYY-MM-DD
  views: number
  arActivations: number
}

export interface AnalyticsInput {
  businesses: Pick<Business, 'id'>[]
  products: Pick<Product, 'id' | 'businessId' | 'status'>[]
  dailyStats: DailyStat[]
  events: Pick<AnalyticsEvent, 'productId' | 'type' | 'at'>[]
}

/** Aggregates the last 30 days. `isSample` marks demo data so the UI can label it. */
export function summarize(db: AnalyticsInput, businessId?: ID, now: Date = new Date(), isSample = true): AnalyticsSummary {
  const businesses = businessId ? db.businesses.filter((b) => b.id === businessId) : db.businesses
  const products = businessId ? db.products.filter((p) => p.businessId === businessId) : db.products
  const productIds = new Set(products.map((p) => p.id))

  const days: string[] = []
  for (let i = DAYS - 1; i >= 0; i--) days.push(isoDay(new Date(now.getTime() - i * 86_400_000)))
  const seriesMap = new Map<string, DailyPoint>(days.map((d) => [d, { date: d, views: 0, arActivations: 0 }]))
  const byProduct = new Map<ID, ProductAnalytics>(
    products.map((p) => [p.id, { productId: p.id, businessId: p.businessId, views: 0, arActivations: 0, arRate: 0 }]),
  )

  const add = (productId: ID, date: string, views: number, ar: number) => {
    const pa = byProduct.get(productId)
    if (!pa) return
    pa.views += views
    pa.arActivations += ar
    const point = seriesMap.get(date)
    if (point) {
      point.views += views
      point.arActivations += ar
    }
  }

  for (const s of db.dailyStats) if (productIds.has(s.productId)) add(s.productId, s.date, s.views, s.arActivations)
  for (const e of db.events) {
    if (!productIds.has(e.productId)) continue
    add(e.productId, e.at.slice(0, 10), e.type === 'view' ? 1 : 0, e.type === 'ar_activation' ? 1 : 0)
  }

  const byProductList = [...byProduct.values()]
    .map((p) => ({ ...p, arRate: p.views > 0 ? p.arActivations / p.views : 0 }))
    .sort((a, b) => b.views - a.views)

  const byBusiness = businesses
    .map((b) => {
      const rows = byProductList.filter((p) => p.businessId === b.id)
      return {
        businessId: b.id,
        views: rows.reduce((s, r) => s + r.views, 0),
        arActivations: rows.reduce((s, r) => s + r.arActivations, 0),
        products: products.filter((p) => p.businessId === b.id).length,
      }
    })
    .sort((a, b) => b.views - a.views)

  return {
    totals: {
      businesses: businesses.length,
      products: products.length,
      published: products.filter((p) => p.status === 'published').length,
      drafts: products.filter((p) => p.status === 'draft').length,
      views: byProductList.reduce((s, r) => s + r.views, 0),
      arActivations: byProductList.reduce((s, r) => s + r.arActivations, 0),
    },
    series: days.map((d) => seriesMap.get(d)!),
    byProduct: byProductList,
    byBusiness,
    isSample,
  }
}

/** Activity derived from record timestamps (used to seed the demo and by the Supabase service, which keeps no activity log). */
export function deriveActivity(
  businesses: Pick<Business, 'id' | 'name' | 'createdAt'>[],
  products: Pick<Product, 'id' | 'businessId' | 'name' | 'createdAt' | 'publishedAt'>[],
): ActivityItem[] {
  const items: ActivityItem[] = []
  let n = 0
  for (const b of businesses) {
    items.push({ id: `act_${++n}`, at: b.createdAt, kind: 'business_created', businessId: b.id, message: `Business “${b.name}” was created` })
  }
  for (const p of products) {
    items.push({ id: `act_${++n}`, at: p.createdAt, kind: 'product_created', businessId: p.businessId, productId: p.id, message: `Product “${p.name.en}” was added` })
    if (p.publishedAt)
      items.push({ id: `act_${++n}`, at: p.publishedAt, kind: 'product_published', businessId: p.businessId, productId: p.id, message: `Product “${p.name.en}” was published` })
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60)
}
