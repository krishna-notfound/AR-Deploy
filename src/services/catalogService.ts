// Service contract. UI talks only to this interface; swap the implementation in services/index.ts.
import type {
  ActivityItem,
  AnalyticsEventType,
  AnalyticsSummary,
  AssetStatus,
  Business,
  BusinessCatalog,
  BusinessStatus,
  Category,
  ID,
  Product,
  ProductStatus,
} from '@/domain/types'

export type ServiceErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'STORAGE'
  | 'PERMISSION'
  /** Backend selected but not configured correctly (see services/backend.ts). */
  | 'CONFIG'
  /** The operation exists only in demo mode (e.g. reset demo data). */
  | 'UNSUPPORTED'
  /** Too many requests from this visitor (analytics limiter). */
  | 'RATE_LIMITED'
  | 'UNKNOWN'

export interface ServiceError {
  code: ServiceErrorCode
  message: string
  fieldErrors?: Record<string, string>
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ServiceError }

export const ok = <T>(data: T): Result<T> => ({ ok: true, data })
export const fail = <T = never>(code: ServiceErrorCode, message: string, fieldErrors?: Record<string, string>): Result<T> => ({
  ok: false,
  error: fieldErrors ? { code, message, fieldErrors } : { code, message },
})

export type BusinessInput = Omit<Business, 'id' | 'createdAt' | 'updatedAt'>
export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'status'> & {
  status?: ProductStatus
}

export interface ProductQuery {
  businessId?: ID
  status?: ProductStatus
  search?: string
  category?: Category
}

export type UploadKind = 'logo' | 'image' | 'glb' | 'usdz'

export interface UploadedAsset {
  url: string
  storagePath?: string
  /** 'session-only' in demo mode for 3D files (ADR-0007); 'valid' when stored by a backend. */
  status: AssetStatus
}

export interface BusinessMember {
  userId: ID
  email: string
  addedAt: string
}

export interface CatalogService {
  // businesses
  getBusinesses(): Promise<Result<Business[]>>
  getBusinessById(id: ID): Promise<Result<Business>>
  getBusinessBySlug(slug: string): Promise<Result<Business>>
  createBusiness(data: BusinessInput): Promise<Result<Business>>
  updateBusiness(id: ID, data: Partial<BusinessInput>): Promise<Result<Business>>
  setBusinessStatus(id: ID, status: BusinessStatus): Promise<Result<Business>>
  deleteBusiness(id: ID): Promise<Result<void>>
  getCatalog(slug: string): Promise<Result<BusinessCatalog>>
  getCatalogs(): Promise<Result<BusinessCatalog[]>>

  // products
  getProducts(query?: ProductQuery): Promise<Result<Product[]>>
  getProductsByBusiness(businessId: ID): Promise<Result<Product[]>>
  getProductById(id: ID): Promise<Result<Product>>
  getPublicProduct(businessSlug: string, productSlug: string, opts?: { allowDraft?: boolean }): Promise<Result<{ business: Business; product: Product }>>
  createProduct(data: ProductInput): Promise<Result<Product>>
  updateProduct(id: ID, data: Partial<ProductInput>): Promise<Result<Product>>
  duplicateProduct(id: ID): Promise<Result<Product>>
  deleteProduct(id: ID): Promise<Result<void>>
  publishProduct(id: ID): Promise<Result<Product>>
  unpublishProduct(id: ID): Promise<Result<Product>>

  // analytics & activity
  getAnalytics(): Promise<Result<AnalyticsSummary>>
  getBusinessAnalytics(businessId: ID): Promise<Result<AnalyticsSummary>>
  recordEvent(e: { productId: ID; businessId: ID; type: AnalyticsEventType }): Promise<Result<void>>
  getRecentActivity(opts?: { businessId?: ID; limit?: number }): Promise<Result<ActivityItem[]>>

  // business owners (platform admins only; enforced by the database)
  getBusinessMembers(businessId: ID): Promise<Result<BusinessMember[]>>
  /** Links an existing account by email. */
  addBusinessMember(businessId: ID, email: string): Promise<Result<void>>
  removeBusinessMember(businessId: ID, userId: ID): Promise<Result<void>>

  // files: validate on the client first (lib/files.ts); this only stores them
  uploadAsset(input: { kind: UploadKind; file: File; businessId?: ID }): Promise<Result<UploadedAsset>>

  /** Called after any successful write, so open queries can refetch. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void

  // demo utilities
  resetDemoData(): Promise<Result<void>>
}
