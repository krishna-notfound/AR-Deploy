import type { ActivityItem, AnalyticsEvent, AuditEvent, Business, BusinessApplication, EmailAttempt, ID, Product } from '@/domain/types'
import type { DailyStat } from '../analytics'
import type { DemoTeam } from './teamSeed'

export type { DailyStat }

export const SCHEMA_VERSION = 1


export interface Db {
  schemaVersion: typeof SCHEMA_VERSION
  businesses: Business[]
  products: Product[]
  /** Live events recorded during this demo (sample: false). */
  events: AnalyticsEvent[]
  /** Seeded sample data (sample: true). */
  dailyStats: DailyStat[]
  activity: ActivityItem[]
  // Added with the application workflow (ADR-0024). Optional so demo data saved earlier stays valid.
  applications?: BusinessApplication[]
  audit?: AuditEvent[]
  emails?: EmailAttempt[]
  /** Demo owners: there are no real accounts in demo mode, so only the invitation state is kept. */
  owners?: Record<ID, { email: string; invitedAt: string; acceptedAt?: string }>
  /** Sample platform team (ADR-0029). Optional so demo data saved earlier stays valid. */
  team?: DemoTeam
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isLocalized = (v: unknown) => isObj(v) && isStr(v.en)

function isBusiness(v: unknown): v is Business {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.name) &&
    isStr(v.slug) &&
    isStr(v.description) &&
    isObj(v.contact) &&
    (v.status === 'active' || v.status === 'inactive' || v.status === 'draft') &&
    isObj(v.branding) &&
    isStr(v.defaultCurrency) &&
    isStr(v.createdAt) &&
    isStr(v.updatedAt)
  )
}

function isProduct(v: unknown): v is Product {
  if (!isObj(v)) return false
  const d = v.dimensions
  return (
    isStr(v.id) &&
    isStr(v.businessId) &&
    isStr(v.slug) &&
    isLocalized(v.name) &&
    isLocalized(v.shortDescription) &&
    isLocalized(v.description) &&
    isStr(v.category) &&
    isNum(v.price) &&
    isStr(v.currency) &&
    Array.isArray(v.images) &&
    isObj(v.models) &&
    isObj(d) &&
    isNum(d.width) &&
    isNum(d.height) &&
    isNum(d.depth) &&
    (d.unit === 'cm' || d.unit === 'in') &&
    isLocalized(v.material) &&
    Array.isArray(v.variants) &&
    isObj(v.cta) &&
    (v.status === 'draft' || v.status === 'published') &&
    isStr(v.createdAt) &&
    isStr(v.updatedAt)
  )
}

/** Hand-written guard for data read back from localStorage. */
export function isValidDb(v: unknown): v is Db {
  return (
    isObj(v) &&
    v.schemaVersion === SCHEMA_VERSION &&
    Array.isArray(v.businesses) &&
    v.businesses.every(isBusiness) &&
    Array.isArray(v.products) &&
    v.products.every(isProduct) &&
    Array.isArray(v.events) &&
    Array.isArray(v.dailyStats) &&
    Array.isArray(v.activity)
  )
}
