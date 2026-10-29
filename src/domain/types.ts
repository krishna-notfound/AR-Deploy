// Single source of truth for entity shapes. See System_arch/design/04-domain-model.md.
import type { CustomAnswer } from '../../supabase/functions/_shared/applyForm'

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
  /** Whether the business may add, replace or remove its own GLB/USDZ files; only the platform changes it (S4 R-S4-2). */
  allowOwnModels: boolean
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
  /**
   * A stable public URL of this file for the phone's AR viewer (Scene Viewer, Quick Look): the public ar-models copy
   * of a published product (Supabase mode). Absent → AR uses `url` (demo sample URLs are already public).
   */
  publicUrl?: string
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
  /** When the product's or an option's 3D files last changed (S4 R-S4-17); unset until the first change. */
  modelsChangedAt?: ISODate
  createdAt: ISODate
  updatedAt: ISODate
}

/**
 * model_interaction = the visitor rotated/zoomed the 3D model (recorded once per page view). embed_view = the product
 * was loaded in an embed on another site; view = the product page itself.
 */
export type AnalyticsEventType = 'view' | 'embed_view' | 'ar_activation' | 'model_interaction'

export interface AnalyticsEvent {
  id: ID
  /** Null once the product was deleted: its history stays in the business totals as "Deleted product". */
  productId: ID | null
  businessId: ID
  type: AnalyticsEventType
  at: ISODate
  /** True for seeded sample data, false for events recorded in this demo. */
  sample: boolean
}

export interface DailyPoint {
  /** A local date (YYYY-MM-DD) in the time zone the summary was made for. */
  date: string
  /** Product page and embed views. */
  views: number
  arActivations: number
}

export interface ProductAnalytics {
  productId: ID
  businessId: ID
  /** Product page views. */
  views: number
  embedViews: number
  arActivations: number
  modelInteractions: number
  /** AR launches per view: arActivations / (views + embedViews), 0 without views. Never a percentage. */
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
    embedViews: number
    arActivations: number
    modelInteractions: number
  }
  series: DailyPoint[]
  byProduct: ProductAnalytics[]
  byBusiness: BusinessAnalytics[]
  /** Events of products that were deleted (counted in the totals and the series), or null when there are none. */
  deletedProducts: { views: number; embedViews: number; arActivations: number; modelInteractions: number } | null
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
  /** Business owners: true until the owner finishes the invitation (business_members.accepted_at is unset, R-W1-9). */
  invitationPending?: boolean
}

/** The audit event types Recent activity shows (R-W5-5). */
export const ACTIVITY_KINDS = [
  'business_created',
  'business_status_changed',
  'business_deleted',
  'product_created',
  'product_published',
  'product_unpublished',
  'product_slug_changed',
  'product_deleted',
] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

/** What an activity sentence is built from, so the dashboard can word it in the person's language. */
export interface ActivityParams {
  /** The product's name, or the deleted business's. */
  name?: string
  business?: string
  /** New product address (slug). */
  to?: string
  /** The status a catalog moved to. */
  status?: string
}

export interface ActivityItem {
  id: ID
  at: ISODate
  kind: ActivityKind
  /** The sentence in English (logs, tests). Screens word it with `activityText(kind, params, t)`. */
  message: string
  params?: ActivityParams
  businessId?: ID
  productId?: ID
}

// ---------------- business applications & owner onboarding (ADR-0024, design/24) ----------------

export type ApplicationStatus = 'submitted' | 'under_review' | 'approved' | 'rejected'
export const APPLICATION_STATUSES: readonly ApplicationStatus[] = ['submitted', 'under_review', 'approved', 'rejected']
/** reopen: an approved application whose business was deleted goes back to under_review (R-W2-2). */
export type ReviewAction = 'start_review' | 'approve' | 'reject' | 'reopen'

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
  /** The "I agree to the Terms and the Privacy Policy" tick; submit-application refuses the request without it. */
  acceptedTerms?: boolean
  /** Answers to the application form's custom questions, by question id (text, yes/no, option id, or option ids). */
  custom?: Record<string, string | boolean | string[]>
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
  /** Absent when the application form hides the field (Content Editor): show "Not given", never a stray comma. */
  country?: string
  city?: string
  category?: string
  language: Lang
  answers: {
    description?: string
    applicantRole?: string
    productCount?: string
    photoReadiness?: string
    modelReadiness?: string
    notes?: string
    /** Answers to the form's custom questions, with label snapshots from the day it was sent. */
    custom?: CustomAnswer[]
    /** The published form version used (0 = the built-in form). */
    formVersion?: number
  }
  decisionReason?: string
  reviewedBy?: ID
  reviewedAt?: ISODate
  businessId?: ID
  /** When the business created from this application was deleted (R-W2-2). Unknown for deletions before S1.5. */
  businessDeletedAt?: ISODate
  createdAt: ISODate
  updatedAt: ISODate
}

/**
 * Possible duplicates of one application (R-W2-9), newest first, at most 10 of each. Only a warning for the reviewer.
 * A business match never carries the owner's email.
 */
export interface ApplicationDuplicates {
  applications: { id: ID; reference: string; businessName: string; status: ApplicationStatus; createdAt: ISODate; match: 'email' | 'name' | 'both' }[]
  businesses: { id: ID; name: string; status: BusinessStatus; match: 'owner_email' | 'name' | 'both' }[]
}

/** A reviewed application; a rejection also says what happened to the decision email (R-W2-1). Not proof of delivery. */
type DecisionEmailOutcome = { status: EmailAttemptStatus; error?: string }
/**
 * A reviewed application, re-read after the change. `reloaded: false` when the decision was applied but the re-read
 * failed: only the new status (and the decision email outcome) is known, and the page refetches.
 */
export type ReviewedApplication =
  | (BusinessApplication & { reloaded?: true; decisionEmail?: DecisionEmailOutcome })
  | { reloaded: false; id: ID; status: ApplicationStatus; businessId?: ID; decisionEmail?: DecisionEmailOutcome }

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

/**
 * A business's owner, for the businesses list (S1.5 R-W2-5). `lastInvitedAt`: the newest invitation attempt (or the
 * newest invitation email for owners invited before attempts were kept). `emailFailed`: that invitation was not sent,
 * failed, bounced or was marked as spam.
 */
export interface OwnerState {
  businessId: ID
  state: 'needs_owner' | 'invite_pending' | 'owner_active'
  lastInvitedAt: string | null
  emailFailed: boolean
}

// ---------------------------------------------------------------------------
// Platform team roles (ADR-0029, ADR-0030)
// ---------------------------------------------------------------------------

export type Permission =
  | 'businesses.view' | 'businesses.edit' | 'businesses.status' | 'businesses.delete' | 'owners.manage'
  | 'applications.view' | 'applications.approve' | 'applications.reject'
  | 'products.view' | 'products.edit' | 'products.publish' | 'products.delete' | 'models.manage'
  | 'analytics.view' | 'records.view' | 'access.view' | 'content.manage'
export type PlatformRole = 'owner' | 'admin' | 'team'
export type MemberRole = Exclude<PlatformRole, 'owner'>
export interface PlatformAccess {
  /** null with status 'deactivated': the Owner turned this member's access off (S1.5 R-W6-7). */
  role: PlatformRole | null
  permissions: Permission[]
  status: 'active' | 'deactivated'
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
  /** They have 2FA the Owner could reset: a verified authenticator or unused recovery codes (R-W6-6). */
  has2fa: boolean
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
  | 'member_removed' | 'member_email_changed' | 'member_closed'
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
  /**
   * One member's history (R-W6-4): events whose metadata names this member, plus access refusals by `userId` (their
   * login, when they have one). Exact ids, never an email search.
   */
  memberId?: ID
  userId?: ID
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
  /** An account_deleted logged after the deletion itself failed (metadata delete_failed): the account still exists. */
  deleteFailed?: boolean
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
