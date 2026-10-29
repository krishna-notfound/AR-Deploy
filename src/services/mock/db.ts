import type { AnalyticsEvent, AuditEvent, Business, BusinessApplication, EmailAttempt, ID, Product } from '@/domain/types'
import type { DailyStat } from '../analytics'
import type { DemoTeam } from './teamSeed'
import type { ModelRequest, ModelRequestPhoto } from '@/domain/modelRequests'
import type { SiteContent } from '@/domain/siteContent'

export type { DailyStat }

export const SCHEMA_VERSION = 1

export interface DemoInviteAttempt {
  businessId: ID
  /** Lower-case. */
  recipient: string
  attempt: number
  outcome: 'accepted' | 'sent' | 'failed' | 'blocked'
  createdAt: string
}


/**
 * A stored demo 3D model request (S4). The names and photo count are read from the products and businesses, as the
 * Supabase select embeds them. Photos picked in this session have their object URLs in sessionRequestMedia.
 */
export type DemoModelRequest = Omit<ModelRequest, 'photoCount' | 'productName' | 'businessName' | 'variantName' | 'productPhotoUrl'> & {
  photos: ModelRequestPhoto[]
}

/**
 * The demo Content Editor document (ADR-0043): the draft, the published copy and the version history. Absent until the
 * Editor first writes (and after "Reset demo data"): nothing published (version 0), an empty draft.
 */
export interface DemoContent {
  draft: SiteContent
  draftUpdatedAt: string
  published: SiteContent | null
  version: number
  publishedAt: string | null
  publishedByName: string | null
  /** Oldest first. */
  versions: { version: number; content: SiteContent; publishedAt: string; publishedByName: string }[]
}

export interface Db {
  schemaVersion: typeof SCHEMA_VERSION
  businesses: Business[]
  products: Product[]
  /** Live events recorded during this demo (sample: false). */
  events: AnalyticsEvent[]
  /** Seeded sample data (sample: true). */
  dailyStats: DailyStat[]
  // Added with the application workflow (ADR-0024). Optional so demo data saved earlier stays valid.
  applications?: BusinessApplication[]
  audit?: AuditEvent[]
  emails?: EmailAttempt[]
  /** Demo owners: there are no real accounts in demo mode, so only the invitation state is kept. */
  owners?: Record<ID, { email: string; invitedAt: string; acceptedAt?: string }>
  /** Owner invitation attempts, newest first (as private.owner_invite_attempts, S1.5 R-W2-4). Kept when an owner is removed. */
  ownerInviteAttempts?: DemoInviteAttempt[]
  /** Sample platform team (ADR-0029). Optional so demo data saved earlier stays valid. */
  team?: DemoTeam
  /** 3D model requests (S4). Optional so demo data saved earlier stays valid. */
  modelRequests?: DemoModelRequest[]
  /** Content Editor draft, published copy and history (ADR-0043). Optional so demo data saved earlier stays valid. */
  content?: DemoContent
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
    Array.isArray(v.dailyStats)
  )
}
