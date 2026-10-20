// Service contract. UI talks only to this interface; swap the implementation in services/index.ts.
import type {
  ActivityItem,
  AnalyticsEventType,
  AnalyticsSummary,
  ApplicationInput,
  ApplicationStatus,
  AssetStatus,
  AuditEvent,
  Business,
  BusinessApplication,
  BusinessCatalog,
  BusinessStatus,
  Category,
  EmailAttempt,
  EmailAttemptStatus,
  ID,
  Lang,
  Product,
  ProductStatus,
  ReviewAction,
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

/**
 * Media URLs returned by the service stay valid at least this long (Supabase: signed URLs of the private
 * product-media bucket; demo: never expire). Pages refresh before expiry (useRefreshWhenStale).
 */
export const MEDIA_URL_TTL_SECONDS = 12 * 60 * 60

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
  /** Set when a platform admin provisioned the owner through an invitation. */
  invitedAt?: string
  /** Set when the owner completed onboarding (set a password from the invitation). */
  acceptedAt?: string
  lastSignInAt?: string
}

export interface Page<T> {
  items: T[]
  total: number
}

export interface ApplicationQuery {
  /** Business name, applicant name or email, or the application reference/id. */
  search?: string
  status?: ApplicationStatus
  /** Inclusive dates (YYYY-MM-DD) on the submission date. */
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export interface AuditQuery {
  applicationId?: ID
  businessId?: ID
  /** Matches the event type. */
  search?: string
  page?: number
  pageSize?: number
}

/** An audit entry with the acting account's email resolved (platform admins only). */
export type AuditEntry = AuditEvent & { actorEmail?: string }

export interface ProvisionOutcome {
  owner: 'linked' | 'already_linked'
  /** The invitation email attempt, as recorded in the email log. Not proof of delivery. */
  email: { status: EmailAttemptStatus; error?: string; attempt: number }
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

  // business owners (platform admins only; enforced by the database and the Edge Functions)
  getBusinessMembers(businessId: ID): Promise<Result<BusinessMember[]>>
  removeBusinessMember(businessId: ID, userId: ID): Promise<Result<void>>
  /** Creates or links the business's single owner and emails a Supabase Auth invitation link. */
  provisionOwner(input: { businessId: ID; email: string; language: Lang; applicationId?: ID }): Promise<Result<ProvisionOutcome>>
  /** New invitation link for an owner who has not completed onboarding yet (cooldown and limits apply). */
  resendOwnerInvitation(businessId: ID, language: Lang): Promise<Result<ProvisionOutcome>>

  // business applications: anyone may submit; everything else is for platform admins
  submitApplication(input: ApplicationInput): Promise<Result<{ id: ID; reference: string }>>
  getApplications(query?: ApplicationQuery): Promise<Result<Page<BusinessApplication>>>
  getApplication(id: ID): Promise<Result<BusinessApplication>>
  /** Status transition through the database (approve creates the draft business in the same transaction). */
  reviewApplication(id: ID, action: ReviewAction, reason?: string): Promise<Result<BusinessApplication>>
  getAuditEvents(query?: AuditQuery): Promise<Result<Page<AuditEntry>>>
  getEmailAttempts(query: { applicationId?: ID; businessId?: ID }): Promise<Result<EmailAttempt[]>>

  // files: validate on the client first (lib/files.ts); this only stores them
  uploadAsset(input: { kind: UploadKind; file: File; businessId?: ID }): Promise<Result<UploadedAsset>>

  /** Called after any successful write, so open queries can refetch. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void

  // demo utilities
  resetDemoData(): Promise<Result<void>>
}
