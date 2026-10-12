// Single source of truth for entity shapes. See System_arch/design/04-domain-model.md.

export type ID = string
export type ISODate = string
export type Lang = 'en' | 'pt'
/** Customer-facing text. PT is optional and falls back to EN. */
export type LocalizedText = { en: string; pt?: string }

export type BusinessStatus = 'active' | 'inactive' | 'draft'
export type ProductStatus = 'draft' | 'published'
export type LengthUnit = 'cm' | 'in'
export type WeightUnit = 'kg' | 'lb'
export type Currency = 'EUR' | 'BRL' | 'USD'

export const CURRENCIES: readonly Currency[] = ['EUR', 'BRL', 'USD']

export const CATEGORIES = ['sofa', 'chair', 'table', 'bed', 'storage', 'lighting', 'decor'] as const
export type Category = (typeof CATEGORIES)[number]

export interface BusinessContact {
  email?: string
  phone?: string
  website?: string
  address?: string
}

export interface Business {
  id: ID
  name: string
  slug: string
  logoUrl?: string
  description: string
  contact: BusinessContact
  status: BusinessStatus
  /** Applied to public pages only. */
  branding: { accentColor: string }
  defaultCurrency: Currency
  createdAt: ISODate
  updatedAt: ISODate
}

/** Derived view, never stored. */
export interface BusinessCatalog {
  business: Business
  catalogUrl: string
  localPath: string
  publishedProductCount: number
  totalProductCount: number
}

export interface ProductImage {
  id: ID
  url: string
  alt?: string
  isPrimary: boolean
  kind: 'gallery' | 'additional'
  /** Object path in Supabase Storage (private bucket); `url` is then a short-lived signed URL. */
  storagePath?: string
}

export type ModelFormat = 'glb' | 'usdz'
export type AssetStatus = 'valid' | 'invalid' | 'missing' | 'session-only'

export interface ModelAsset {
  format: ModelFormat
  url: string
  fileName: string
  sizeBytes?: number
  status: AssetStatus
  validationMessage?: string
  /** Object path in Supabase Storage (private bucket); `url` is then a short-lived signed URL. */
  storagePath?: string
}

export interface Dimensions {
  width: number
  height: number
  depth: number
  unit: LengthUnit
}

export interface ProductVariant {
  id: ID
  name: LocalizedText
  colorHex?: string
  sku?: string
  /** Minor units, added to the base price. */
  priceDelta?: number
}

export interface Product {
  id: ID
  businessId: ID
  slug: string
  name: LocalizedText
  shortDescription: LocalizedText
  description: LocalizedText
  category: Category
  /** Minor units (cents). See ADR-0003. */
  price: number
  currency: Currency
  images: ProductImage[]
  models: { glb?: ModelAsset; usdz?: ModelAsset }
  dimensions: Dimensions
  material: LocalizedText
  weight?: { value: number; unit: WeightUnit }
  variants: ProductVariant[]
  cta: { label: LocalizedText; url?: string }
  status: ProductStatus
  publishedAt?: ISODate
  createdAt: ISODate
  updatedAt: ISODate
}

/** model_interaction = the visitor rotated/zoomed the 3D model (recorded once per page view). */
export type AnalyticsEventType = 'view' | 'ar_activation' | 'model_interaction'

export interface AnalyticsEvent {
  id: ID
  productId: ID
  businessId: ID
  type: AnalyticsEventType
  at: ISODate
  /** True for seeded sample data, false for events recorded in this demo. */
  sample: boolean
}

export interface DailyPoint {
  date: string
  views: number
  arActivations: number
}

export interface ProductAnalytics {
  productId: ID
  businessId: ID
  views: number
  arActivations: number
  modelInteractions: number
  arRate: number
}

export interface BusinessAnalytics {
  businessId: ID
  views: number
  arActivations: number
  products: number
}

export interface AnalyticsSummary {
  totals: {
    businesses: number
    products: number
    published: number
    drafts: number
    views: number
    arActivations: number
    modelInteractions: number
  }
  series: DailyPoint[]
  byProduct: ProductAnalytics[]
  byBusiness: BusinessAnalytics[]
  /** True for demo data (seeded + recorded in this browser); false for a real backend. */
  isSample: boolean
}

export type Role = 'super_admin' | 'business_admin'

export interface User {
  id: ID
  name: string
  email: string
  role: Role
  businessId?: ID
}

export type ActivityKind =
  | 'business_created'
  | 'business_updated'
  | 'business_deleted'
  | 'product_created'
  | 'product_updated'
  | 'product_published'
  | 'product_unpublished'
  | 'product_deleted'

export interface ActivityItem {
  id: ID
  at: ISODate
  kind: ActivityKind
  message: string
  businessId?: ID
  productId?: ID
}
