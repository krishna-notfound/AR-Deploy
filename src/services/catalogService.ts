// Service contract. UI talks only to this interface; swap the implementation in services/index.ts.
import type {
  AccessEvent,
  AccessQuery,
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
  InviteInspection,
  InviteOutcome,
  Lang,
  MemberInvite,
  MemberRole,
  Permission,
  PlatformAccess,
  PlatformMember,
  Product,
  ProductStatus,
  ReviewAction,
  RolePermissions,
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
  /** A more specific machine-readable cause, e.g. 'already_member' (team roles, ADR-0029). */
  reason?: string
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

  // platform team (ADR-0029, ADR-0030): Owner-only except getMyAccess and the /join calls
  getMyAccess(): Promise<Result<PlatformAccess | null>>
  listMembers(): Promise<Result<PlatformMember[]>>
  getMember(id: ID): Promise<Result<PlatformMember>>
  listMemberInvites(id: ID): Promise<Result<MemberInvite[]>>
  inviteMember(input: { email: string; role: MemberRole; note?: string }): Promise<Result<InviteOutcome>>
  resendMemberInvite(id: ID): Promise<Result<InviteOutcome>>
  revokeMemberInvite(id: ID): Promise<Result<void>>
  setMemberRole(id: ID, role: MemberRole): Promise<Result<void>>
  deactivateMember(id: ID): Promise<Result<void>>
  reactivateMember(id: ID): Promise<Result<void>>
  getRolePermissions(): Promise<Result<RolePermissions>>
  setRolePermissions(role: MemberRole, permissions: Permission[]): Promise<Result<void>>
  getAccessEvents(query?: AccessQuery): Promise<Result<Page<AccessEvent>>>
  inspectInvite(token: string): Promise<Result<InviteInspection>>
  acceptInviteCreate(input: { token: string; fullName: string; password: string }): Promise<Result<{ email: string }>>
  acceptInviteExisting(token: string): Promise<Result<void>>

  // demo utilities
  resetDemoData(): Promise<Result<void>>
}

/** Team errors: one sentence per reason (spec section 7), shared by the demo and Supabase services. */
export const TEAM_ERRORS: Record<string, { code: ServiceErrorCode; message: string }> = {
  forbidden: { code: 'PERMISSION', message: "You don't have permission to do this." },
  already_member: { code: 'CONFLICT', message: 'This email already has platform access.' },
  business_owner: { code: 'CONFLICT', message: "This email owns a business. Business owners can't join the platform team." },
  owner_protected: { code: 'CONFLICT', message: "The platform owner can't be changed here." },
  self: { code: 'CONFLICT', message: "You can't change your own access." },
  not_found: { code: 'NOT_FOUND', message: 'That team member no longer exists.' },
  not_invited: { code: 'CONFLICT', message: 'This person has already accepted or is no longer invited.' },
  not_deactivated: { code: 'CONFLICT', message: 'This member is not deactivated.' },
  no_live_invite: { code: 'CONFLICT', message: 'There is no open invitation to revoke.' },
  unknown_permission: { code: 'VALIDATION', message: "That permission doesn't exist." },
  invalid_email: { code: 'VALIDATION', message: 'Enter a valid email address.' },
  invalid_role: { code: 'VALIDATION', message: 'Choose Admin or Team.' },
  note_too_long: { code: 'VALIDATION', message: 'Keep the note under 500 characters.' },
  rate_limited: { code: 'RATE_LIMITED', message: 'Too many invitations for this person. Try again in an hour.' },
  invite_invalid: { code: 'NOT_FOUND', message: "This link isn't valid." },
  invite_expired: { code: 'CONFLICT', message: 'This invitation has expired. Ask the platform owner to send a new one.' },
  invite_revoked: { code: 'CONFLICT', message: 'This invitation was revoked. Ask the platform owner if you still need access.' },
  invite_used: { code: 'CONFLICT', message: 'This invitation has already been accepted. Sign in instead.' },
  email_mismatch: { code: 'PERMISSION', message: 'You are signed in with a different email than the one invited. Sign out and try again.' },
  account_exists: { code: 'CONFLICT', message: 'You already have an account. Sign in to accept.' },
  weak_password: { code: 'VALIDATION', message: 'Choose a stronger password.' },
}

export function teamFail<T = never>(reason: string, message?: string): Result<T> {
  const e = TEAM_ERRORS[reason] ?? { code: 'UNKNOWN' as const, message: 'Something went wrong. Try again.' }
  return { ok: false, error: { code: e.code, message: message ?? e.message, reason } }
}
