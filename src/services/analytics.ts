// Shared by the mock and Supabase services: turns daily aggregates + raw events into an AnalyticsSummary.
import { ACTIVITY_KINDS, type ActivityItem, type ActivityParams, type ActivityKind, type AnalyticsEvent, type AnalyticsSummary, type AuditEvent, type Business, type DailyPoint, type ID, type Product, type ProductAnalytics } from '@/domain/types'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { type TFn, tEn } from '@/i18n/translate'

const DAYS = 30

/**
 * The day embed loads started to be recorded as `embed_view` (the S1.5 migration). Before it, an embed load was
 * recorded as a page view and can't be split. The release step in the runbook sets it to the apply date.
 */
export const EMBED_VIEWS_SINCE = '2026-10-26'

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** This device's time zone, or UTC when the browser can't tell (the default when a caller passes none). */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>()

/** The local date (YYYY-MM-DD) of an instant in `timeZone`. An unknown zone counts as UTC. */
export function localDay(at: Date, timeZone: string): string {
  let f = dayFormatters.get(timeZone)
  if (!f) {
    const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' }
    try {
      f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone })
    } catch {
      f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' })
    }
    dayFormatters.set(timeZone, f)
  }
  const n: Record<string, string> = {}
  for (const p of f.formatToParts(at)) n[p.type] = p.value
  return `${n.year}-${n.month}-${n.day}`
}

export interface DailyStat {
  /** Null for a product that was deleted (its rows are kept, R-W5-4). */
  productId: ID | null
  businessId: ID
  date: string // YYYY-MM-DD, a local date in the zone the stats were bucketed in
  views: number
  embedViews: number
  arActivations: number
  modelInteractions?: number
}

/** Exact product counts for one business (the business_product_counts view). */
export interface ProductCount {
  businessId: ID
  total: number
  published: number
  drafts: number
}

export interface AnalyticsInput {
  businesses: Pick<Business, 'id'>[]
  products: Pick<Product, 'id' | 'businessId' | 'status'>[]
  dailyStats: DailyStat[]
  events: Pick<AnalyticsEvent, 'productId' | 'businessId' | 'type' | 'at'>[]
  /** When given, the product counts come from here instead of from `products`. */
  productCounts?: ProductCount[]
}

interface Counts {
  views: number
  embedViews: number
  arActivations: number
  modelInteractions: number
}

/**
 * Aggregates the last 30 local days in `timeZone` (today included): the series is keyed by local dates, and rows
 * outside the window are skipped. Rows of deleted products (productId null) count in the totals, the series and their
 * business, and are returned once as `deletedProducts`. `isSample` marks demo data so the UI can label it.
 */
export function summarize(db: AnalyticsInput, businessId?: ID, now: Date = new Date(), isSample = true, timeZone = 'UTC'): AnalyticsSummary {
  const businesses = businessId ? db.businesses.filter((b) => b.id === businessId) : db.businesses
  const businessIds = new Set(businesses.map((b) => b.id))
  const products = businessId ? db.products.filter((p) => p.businessId === businessId) : db.products

  const [y, m, d] = localDay(now, timeZone).split('-').map(Number) as [number, number, number]
  const days: string[] = []
  for (let i = DAYS - 1; i >= 0; i--) days.push(isoDay(new Date(Date.UTC(y, m - 1, d - i))))
  const seriesMap = new Map<string, DailyPoint>(days.map((day) => [day, { date: day, views: 0, arActivations: 0 }]))
  const byProduct = new Map<ID, ProductAnalytics>(
    products.map((p) => [p.id, { productId: p.id, businessId: p.businessId, views: 0, embedViews: 0, arActivations: 0, modelInteractions: 0, arRate: 0 }]),
  )
  const deleted: Counts = { views: 0, embedViews: 0, arActivations: 0, modelInteractions: 0 }
  let hasDeleted = false
  const deletedByBusiness = new Map<ID, Counts>()

  const add = (productId: ID | null, bizId: ID, date: string, c: Counts) => {
    const point = seriesMap.get(date)
    if (!point) return // outside the window
    let target: Counts | undefined
    if (productId === null) {
      if (!businessIds.has(bizId)) return
      hasDeleted = true
      target = deletedByBusiness.get(bizId) ?? { views: 0, embedViews: 0, arActivations: 0, modelInteractions: 0 }
      deletedByBusiness.set(bizId, target)
      for (const k of ['views', 'embedViews', 'arActivations', 'modelInteractions'] as const) deleted[k] += c[k]
    } else {
      target = byProduct.get(productId)
      if (!target) return
    }
    target.views += c.views
    target.embedViews += c.embedViews
    target.arActivations += c.arActivations
    target.modelInteractions += c.modelInteractions
    point.views += c.views + c.embedViews
    point.arActivations += c.arActivations
  }

  for (const s of db.dailyStats) {
    // Demo data saved before embed views existed has no embedViews.
    add(s.productId, s.businessId, s.date, { views: s.views, embedViews: s.embedViews ?? 0, arActivations: s.arActivations, modelInteractions: s.modelInteractions ?? 0 })
  }
  for (const e of db.events) {
    add(e.productId, e.businessId, localDay(new Date(e.at), timeZone), {
      views: e.type === 'view' ? 1 : 0,
      embedViews: e.type === 'embed_view' ? 1 : 0,
      arActivations: e.type === 'ar_activation' ? 1 : 0,
      modelInteractions: e.type === 'model_interaction' ? 1 : 0,
    })
  }

  const allViews = (c: Counts) => c.views + c.embedViews
  const byProductList = [...byProduct.values()]
    .map((p) => ({ ...p, arRate: allViews(p) > 0 ? p.arActivations / allViews(p) : 0 }))
    .sort((a, b) => allViews(b) - allViews(a))

  const counts = db.productCounts
    ? db.productCounts.filter((c) => businessIds.has(c.businessId))
    : businesses.map((b) => {
        const own = products.filter((p) => p.businessId === b.id)
        return { businessId: b.id, total: own.length, published: own.filter((p) => p.status === 'published').length, drafts: own.filter((p) => p.status === 'draft').length }
      })
  const countOf = new Map(counts.map((c) => [c.businessId, c]))

  const byBusiness = businesses
    .map((b) => {
      const rows: Counts[] = byProductList.filter((p) => p.businessId === b.id)
      const gone = deletedByBusiness.get(b.id)
      if (gone) rows.push(gone)
      return {
        businessId: b.id,
        views: rows.reduce((s, r) => s + allViews(r), 0),
        arActivations: rows.reduce((s, r) => s + r.arActivations, 0),
        products: countOf.get(b.id)?.total ?? 0,
      }
    })
    .sort((a, b) => b.views - a.views)

  const sum = (k: keyof Counts) => byProductList.reduce((s, r) => s + r[k], 0) + deleted[k]
  return {
    totals: {
      businesses: businesses.length,
      products: counts.reduce((s, c) => s + c.total, 0),
      published: counts.reduce((s, c) => s + c.published, 0),
      drafts: counts.reduce((s, c) => s + c.drafts, 0),
      views: sum('views'),
      embedViews: sum('embedViews'),
      arActivations: sum('arActivations'),
      modelInteractions: sum('modelInteractions'),
    },
    series: days.map((day) => seriesMap.get(day)!),
    byProduct: byProductList,
    byBusiness,
    deletedProducts: hasDeleted ? deleted : null,
    isSample,
  }
}

const CATALOG_STATUS_KEY: Record<string, TranslationKey> = {
  active: 'admin.activity.catalogActive',
  inactive: 'admin.activity.catalogInactive',
  draft: 'admin.activity.catalogDraft',
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/** The parts of one Recent activity sentence, taken from an audit event. */
export function activityParams(e: Pick<AuditEvent, 'eventType' | 'toStatus' | 'metadata'>, businessName?: string): ActivityParams {
  const business = text(e.metadata.business_name) ?? businessName ?? (e.eventType === 'business_deleted' ? text(e.metadata.name) : undefined)
  return {
    ...(text(e.metadata.name) ? { name: text(e.metadata.name) } : {}),
    ...(business ? { business } : {}),
    ...(text(e.metadata.to) ? { to: text(e.metadata.to) } : {}),
    ...(e.toStatus ? { status: e.toStatus } : {}),
  }
}

/** One Recent activity sentence for an event type, or null for a type the feed does not show. */
export function activityText(eventType: string, p: ActivityParams, t: TFn = tEn): string | null {
  const product = p.name ?? t('admin.activity.aProduct')
  switch (eventType) {
    case 'product_created':
      return t('admin.activity.productAdded', { product })
    case 'product_published':
      return t('admin.activity.productPublished', { product })
    case 'product_unpublished':
      return t('admin.activity.productUnpublished', { product })
    case 'product_slug_changed':
      return p.to ? t('admin.activity.productSlug', { product, to: p.to }) : t('admin.activity.productSlugNoAddress', { product })
    case 'product_deleted':
      return t('admin.activity.productDeleted', { product })
    case 'business_status_changed':
      return t(CATALOG_STATUS_KEY[p.status ?? ''] ?? 'admin.activity.catalogChanged', { business: p.business ?? t('admin.activity.aBusinessLower') })
    case 'business_created':
      return t('admin.activity.businessCreated', { business: p.business ?? t('admin.activity.aBusiness') })
    case 'business_deleted':
      return t('admin.activity.businessDeleted', { business: p.business ?? t('admin.activity.aBusiness') })
    default:
      return null
  }
}

/** One Recent activity sentence for an audit event, or null for a type the feed does not show. */
export function activityMessage(e: Pick<AuditEvent, 'eventType' | 'businessId' | 'toStatus' | 'metadata'>, businessName?: string, t: TFn = tEn): string | null {
  return activityText(e.eventType, activityParams(e, businessName), t)
}

/**
 * Recent activity from audit events (R-W5-5), newest first: product events and catalog status changes, as written
 * by the database triggers (Supabase) or the demo service. `businessNames` names businesses the rows don't.
 */
export function deriveActivity(events: AuditEvent[], businessNames: ReadonlyMap<ID, string> = new Map()): ActivityItem[] {
  const items: ActivityItem[] = []
  for (const e of events) {
    if (!(ACTIVITY_KINDS as readonly string[]).includes(e.eventType)) continue
    const message = activityMessage(e, e.businessId ? businessNames.get(e.businessId) : undefined)
    if (!message) continue
    const productId = e.eventType !== 'product_deleted' ? text(e.metadata.product_id) : undefined
    items.push({ id: e.id, at: e.createdAt, kind: e.eventType as ActivityKind, message, params: activityParams(e, e.businessId ? businessNames.get(e.businessId) : undefined), ...(e.businessId ? { businessId: e.businessId } : {}), ...(productId ? { productId } : {}) })
  }
  return items.sort((a, b) => b.at.localeCompare(a.at))
}
