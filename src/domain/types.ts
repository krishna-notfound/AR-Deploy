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
  /** GLB only: the file's glTF `extensionsRequired`, read when uploaded or loaded. Undefined = not checked yet. */
  requiredExtensions?: string[]
}

export type ProductModels = { glb?: ModelAsset; usdz?: ModelAsset }

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
  /** Own gallery photos (owner uploads). Empty: the product's photos are shown. */
  images?: ProductImage[]
  /** Own 3D files. Without a GLB the product's model is shown (never this variant's USDZ with another GLB). */
  models?: ProductModels
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
  models: ProductModels
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
  /** Platform users (role 'super_admin'): Owner, Admin or Team and what that role may do (ADR-0029). */
  platform?: PlatformAccess
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

// ---------------- business applications & owner onboarding (ADR-0024, design/24) ----------------

export type ApplicationStatus = 'submitted' | 'under_review' | 'approved' | 'rejected'
export const APPLICATION_STATUSES: readonly ApplicationStatus[] = ['submitted', 'under_review', 'approved', 'rejected']
export type ReviewAction = 'start_review' | 'approve' | 'reject'

/** What the public wizard submits. Validated by supabase/functions/_shared/application.ts (client and server). */
export interface ApplicationInput {
  businessName: string
  website?: string
  description: string
  category: string
  country: string
  city: string
  applicantName: string
  applicantRole?: string
  applicantEmail: string
  applicantPhone?: string
  language: Lang
  productCount: string
  photoReadiness: string
  modelReadiness: string
  notes?: string
  consent: boolean
  /** One per wizard session: retries and double clicks create one application. */
  submissionKey: string
}

export interface BusinessApplication {
  id: ID
  reference: string
  status: ApplicationStatus
  businessName: string
  applicantName: string
  applicantEmail: string
  applicantPhone?: string
  website?: string
  country: string
  city: string
  category: string
  language: Lang
  answers: { description?: string; applicantRole?: string; productCount?: string; photoReadiness?: string; modelReadiness?: string; notes?: string }
  decisionReason?: string
  reviewedBy?: ID
  reviewedAt?: ISODate
  businessId?: ID
  createdAt: ISODate
  updatedAt: ISODate
}

export interface AuditEvent {
  id: ID
  createdAt: ISODate
  eventType: string
  actorId?: ID
  applicationId?: ID
  businessId?: ID
  fromStatus?: string
  toStatus?: string
  metadata: Record<string, unknown>
}

export type EmailAttemptStatus = 'blocked' | 'failed' | 'accepted' | 'sent' | 'delivered' | 'delayed' | 'bounced' | 'complained'

export interface EmailAttempt {
  id: ID
  createdAt: ISODate
  updatedAt: ISODate
  kind: string
  recipient: string
  subject: string
  status: EmailAttemptStatus
  providerMessageId?: string
  error?: string
  applicationId?: ID
  businessId?: ID
  workflow?: string
  attempt: number
}

// ---------------------------------------------------------------------------
// Platform team roles (ADR-0029, ADR-0030)
// ---------------------------------------------------------------------------

export type Permission =
  | 'businesses.view' | 'businesses.edit' | 'businesses.status' | 'businesses.delete' | 'owners.manage'
  | 'applications.view' | 'applications.approve' | 'applications.reject'
  | 'products.view' | 'products.edit' | 'products.publish' | 'products.delete'
  | 'analytics.view' | 'records.view' | 'access.view'
export type PlatformRole = 'owner' | 'admin' | 'team'
export type MemberRole = Exclude<PlatformRole, 'owner'>
export interface PlatformAccess {
  role: PlatformRole
  permissions: Permission[]
}
export type MemberStatus = 'invited' | 'active' | 'deactivated'
export type InviteStatus = 'pending' | 'sent' | 'email_failed' | 'accepted' | 'expired' | 'revoked'
export interface PlatformMember {
  id: ID
  userId: ID | null
  email: string
  fullName: string | null
  role: PlatformRole
  status: MemberStatus
  /** Email of whoever invited them. */
  invitedBy: string | null
  createdAt: ISODate
  activatedAt: ISODate | null
  deactivatedAt: ISODate | null
  lastSignInAt: ISODate | null
  invite: { status: InviteStatus; expiresAt: ISODate } | null
  /** Their profile photo (public URL), or null for initials. Absent when the source does not know it. */
  avatarUrl?: string | null
}
export interface MemberInvite {
  id: ID
  status: InviteStatus
  createdAt: ISODate
  expiresAt: ISODate
  createdBy: string | null
  lastEmailAt: ISODate | null
  lastEmailResult: string | null
  acceptedAt: ISODate | null
  revokedAt: ISODate | null
}
export interface InviteOutcome {
  memberId: ID
  status: 'sent' | 'email_failed'
  sentAt: ISODate
  expiresAt: ISODate
  error?: string
}
export type RolePermissions = Record<MemberRole, Permission[]>
export type AccessAction =
  | 'invite_created' | 'invite_email_sent' | 'invite_email_failed' | 'invite_accepted' | 'invite_revoked' | 'invite_expired_attempt'
  | 'role_changed' | 'permissions_changed' | 'member_deactivated' | 'member_reactivated' | 'denied'
export interface AccessEvent {
  id: ID
  at: ISODate
  actor: string | null
  member: string | null
  action: AccessAction
  fromRole?: string
  toRole?: string
  outcome: 'ok' | 'denied'
  details: string
}
export interface AccessQuery {
  q?: string
  action?: AccessAction
  outcome?: 'ok' | 'denied'
  from?: string
  to?: string
  page?: number
  pageSize?: number
}
export type InviteState = 'valid' | 'expired' | 'revoked' | 'used' | 'invalid'
export interface InviteInspection {
  state: InviteState
  email?: string
  role?: MemberRole
  invitedBy?: string
  expiresAt?: ISODate
  accountExists?: boolean
}

// Account settings, security and 2FA (S1). The service interface is in services/accountService.ts.
export type SettingsSection = 'account' | 'profile' | 'security' | 'notifications' | 'preferences' | 'activity' | 'business' | 'platform' | 'security-policy'
/** What an emailed 6-digit action code unlocks. */
export type ActionPurpose = 'disable_2fa' | 'regenerate_recovery' | 'request_closure' | 'owner_reset_2fa' | 'complete_closure'
export type DateFormatPref = 'd MMM yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd'
export interface Profile {
  userId: ID
  displayName: string | null
  avatarUrl: string | null
  timezone: string
  dateFormat: DateFormatPref
  clock: '24h' | '12h'
  notifyNewApplications: boolean
  onboardingCompletedAt: string | null
  onboardingDismissedAt: string | null
}
export interface SecurityState {
  /** The platform policy requires 2FA for the caller's group (staff or business). */
  requires2fa: boolean
  aal: 'aal1' | 'aal2'
  hasVerifiedFactor: boolean
  /** Unused recovery codes; null while the user has no verified 2FA factor. */
  recoveryCodesLeft: number | null
  /** The address an email change is waiting to confirm. */
  pendingEmail: string | null
  closure: { requestedAt: string; businessId: ID | null } | null
  onboarding: { completedAt: string | null; dismissedAt: string | null }
}
export interface TotpEnrollment {
  factorId: string
  qrSvg: string
  secret: string
}
export interface SecurityEvent {
  id: ID
  type: string
  at: string
  userAgent: string | null
  ip: string | null
}
export interface PlatformSettings {
  require2faStaff: boolean
  require2faBusiness: boolean
  updatedAt: string | null
}
export interface ClosureRequest {
  userId: ID
  email: string
  businessId: ID | null
  businessName: string | null
  requestedAt: string
}
