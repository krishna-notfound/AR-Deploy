// Supabase implementation of CatalogService: same contract as the mock, different storage.
// Access control is enforced by RLS and storage policies in supabase/migrations; checks here are for UX only.
// Every failure is returned as an error Result. Nothing falls back to demo data.
import { createSupabaseTeam } from './supabaseTeam'
import { createSupabaseModelRequestsBusiness } from './modelRequestsBusiness'
import { createSupabaseModelRequestsRead } from './modelRequestsRead'
import { createSupabaseModelRequestsStaff } from './modelRequestsStaff'
import { MODEL_REQUEST_ERRORS } from '../modelRequestRules'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ApplicationStatus,
  AuditEvent,
  Business,
  BusinessApplication,
  BusinessCatalog,
  BusinessStatus,
  Category,
  Currency,
  EmailAttempt,
  EmailAttemptStatus,
  ID,
  Lang,
  LengthUnit,
  LocalizedText,
  ModelAsset,
  ModelFormat,
  OwnerState,
  Product,
  ProductImage,
  ProductModels,
  ProductStatus,
  ProductVariant,
  WeightUnit,
} from '@/domain/types'
import { ACTIVITY_KINDS } from '@/domain/types'
import { localDayBounds } from '@/lib/format'
import { PRODUCT_SLUG_MAX, uniqueSlug } from '@/lib/slug'
import { catalogLocalPath, catalogPublicUrl } from '@/lib/urls'
import { deriveActivity, deviceTimeZone, summarize } from '../analytics'
import { type AuditEntry, type BusinessInput, CLOSURE_PENDING_ERROR, type CatalogService, type CreatedBusiness, PLATFORM_ACTOR_LABELS, PLATFORM_CHANGE_EVENTS, REOPEN_NOT_ALLOWED_ERROR, MEDIA_URL_TTL_SECONDS, type ProductInput, type ProvisionOutcome, type Result, type ServiceError, type ServiceErrorCode, type StorageSweep, type UploadKind, fail, ok, teamFail, toAuditEntry } from '../catalogService'
import { msg } from '@/i18n/fieldMessage'
import { normalizeImages, validateBusiness, validateForPublish, validateProductDraft } from '../validation'

export const MEDIA_BUCKET = 'product-media'
const REQUEST_PHOTO_BUCKET = 'model-request-photos'
export const LOGO_BUCKET = 'business-logos'
export const TRACK_EVENT_FUNCTION = 'track-event'
export const NOTIFY_OWNER_FUNCTION = 'notify-business-owner'
/** Keeps the public ar-models copies of a product's GLB/USDZ in line with its status (owner decision 2026-10-26). */
export const SYNC_AR_MODELS_FUNCTION = 'sync-ar-models'
// 12 h: anonymous visitors can already sign any published product's media (storage policy), so a longer
// lifetime only widens the window in which a just-unpublished file stays reachable by an old link.
const SIGNED_URL_TTL_SECONDS = MEDIA_URL_TTL_SECONDS
export const PRODUCT_SELECT = '*, product_images(*), product_models(*), product_variants(*, product_variant_images(*), product_variant_models(*))'

// Hand-written row shapes matching supabase/migrations; schemaDrift.check.ts compares them with the
// schema is applied (`npm run db:types`, see design/19-supabase.md).
export interface BusinessRow {
  id: string
  name: string
  slug: string
  logo_url: string | null
  description: string
  contact_email: string | null
  contact_phone: string | null
  contact_website: string | null
  contact_address: string | null
  status: BusinessStatus
  accent_color: string
  default_currency: Currency
  allow_own_models: boolean
  created_at: string
  updated_at: string
}
export interface ImageRow {
  url: string | null
  storage_path: string | null
  alt: string | null
  is_primary: boolean
  kind: ProductImage['kind']
  sort_order: number
  id: string
}
export interface ModelRow {
  format: ModelFormat
  url: string | null
  storage_path: string | null
  file_name: string
  size_bytes: number | null
  required_extensions: string[] | null
  /** The public ar-models copy for phone AR (sync-ar-models); null until synced. */
  public_url?: string | null
}
export interface VariantImageRow {
  id: string
  storage_path: string
  alt: string | null
  is_primary: boolean
  sort_order: number
}
export interface VariantModelRow {
  format: ModelFormat
  storage_path: string
  file_name: string
  size_bytes: number | null
  required_extensions: string[] | null
  public_url?: string | null
}
export interface VariantRow {
  id: string
  name: LocalizedText
  color_hex: string | null
  sku: string | null
  price_delta: number | null
  sort_order: number
  product_variant_images?: VariantImageRow[]
  product_variant_models?: VariantModelRow[]
}
export interface ProductRow {
  id: string
  business_id: string
  slug: string
  name: LocalizedText
  short_description: LocalizedText
  description: LocalizedText
  material: LocalizedText
  cta_label: LocalizedText
  cta_url: string | null
  category: Category
  price: number
  currency: Currency
  status: ProductStatus
  width: number
  height: number
  depth: number
  dimension_unit: LengthUnit
  weight_value: number | null
  weight_unit: WeightUnit | null
  published_at: string | null
  models_changed_at?: string | null
  created_at: string
  updated_at: string
  product_images?: ImageRow[]
  product_models?: ModelRow[]
  product_variants?: VariantRow[]
}
const DAILY_PAGE = 1000

/** A row of analytics_daily (R-W5-2); product_id is null for a deleted product. */
export interface DailyRow {
  business_id: string
  product_id: string | null
  day: string
  views: number
  embed_views: number
  ar_activations: number
  model_interactions: number
}

type DbError = { code?: string; message: string }

const SLUG_TAKEN = {
  business: 'This catalog address is already used by another business.',
  product: 'Another product in this catalog already uses this slug.',
}

/** Rules raised by our own triggers (supabase/migrations), keyed by their exception message. */
const DB_RULES: Record<string, { field: string; message: string }> = {
  publish_requires_gallery_image: { field: 'images', message: 'Add at least one product image before publishing.' },
  too_many_variants: { field: 'variants', message: 'Use 50 colours or options or fewer.' },
  too_many_variant_images: { field: 'variants', message: 'Each colour or option can have up to 20 photos.' },
}

/** Stable message keys raised by the database functions (20261020091428_applications_and_owner_access). */
const ACCOUNT_RULES: Record<string, ServiceError> = {
  sign_in_required: { code: 'PERMISSION', message: 'Sign in first.' },
  platform_admin_only: { code: 'PERMISSION', message: 'Only platform admins can do this.' },
  application_not_found: { code: 'NOT_FOUND', message: 'Application not found.' },
  business_not_found: { code: 'NOT_FOUND', message: 'This business no longer exists.' },
  closure_pending: CLOSURE_PENDING_ERROR,
  invalid_timezone: { code: 'VALIDATION', message: "Your time zone setting isn't recognised. Choose it again in Preferences." },
  reopen_not_allowed: REOPEN_NOT_ALLOWED_ERROR,
}

/** S4 keys whose shared meaning is application review: only mapModelRequestError gives them the S4 copy. */
const S4_REQUEST_ONLY = new Set(['invalid_transition', 'reason_required'])

/**
 * Maps Postgres/PostgREST/Storage errors to service errors with a message the user can act on.
 * Raw database text (policy, constraint and column names) is never shown; in development it is logged.
 */
export function mapDbError<T>(e: DbError, ctx: { notFound?: string; conflictField?: keyof typeof SLUG_TAKEN } = {}): Result<T> {
  if (import.meta.env.DEV) console.error('[supabase]', e.code, e.message)
  const account = ACCOUNT_RULES[e.message]
  if (account) return { ok: false, error: account }
  // S4 keys raised only by S4 (invalid_transition and reason_required mean application review here; mapModelRequestError).
  const s4 = Object.hasOwn(MODEL_REQUEST_ERRORS, e.message) && !S4_REQUEST_ONLY.has(e.message) ? MODEL_REQUEST_ERRORS[e.message] : undefined
  if (s4) return { ok: false, error: s4 }
  const rule = DB_RULES[e.message]
  if (rule) return fail('VALIDATION', 'Please fix the highlighted fields.', { [rule.field]: rule.message })
  switch (e.code) {
    case '23505':
      return ctx.conflictField
        ? fail('CONFLICT', 'Please fix the highlighted fields.', { slug: SLUG_TAKEN[ctx.conflictField] })
        : fail('CONFLICT', 'This record already exists.')
    case '42501':
      return teamFail('forbidden')
    case '23514':
    case '23502':
    case '22P02':
      return fail('VALIDATION', 'Some values were rejected. Check the fields and try again.')
    case 'P0002':
      return fail('NOT_FOUND', e.message)
    case 'PGRST116':
      return fail('NOT_FOUND', ctx.notFound ?? 'Not found.')
    default:
      return fail('UNKNOWN', 'The request could not be completed. Try again in a moment.')
  }
}

/** A storage refusal by RLS (R-W3-6): HTTP 403, or Postgres's "new row violates row-level security policy". */
export function isStorageForbidden(e: { statusCode?: string | number; message?: string }): boolean {
  return String(e.statusCode ?? '') === '403' || /row-level security/i.test(e.message ?? '')
}

export const toBusiness = (r: BusinessRow): Business => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  logoUrl: r.logo_url ?? undefined,
  description: r.description,
  contact: {
    email: r.contact_email ?? undefined,
    phone: r.contact_phone ?? undefined,
    website: r.contact_website ?? undefined,
    address: r.contact_address ?? undefined,
  },
  status: r.status,
  branding: { accentColor: r.accent_color },
  defaultCurrency: r.default_currency,
  allowOwnModels: r.allow_own_models === true,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

function fromBusinessInput(d: Partial<BusinessInput>): Partial<BusinessRow> {
  const row: Partial<BusinessRow> = {}
  if (d.name !== undefined) row.name = d.name.trim()
  if (d.slug !== undefined) row.slug = d.slug
  if ('logoUrl' in d) row.logo_url = d.logoUrl ?? null
  if (d.description !== undefined) row.description = d.description
  if (d.contact) {
    row.contact_email = d.contact.email || null
    row.contact_phone = d.contact.phone || null
    row.contact_website = d.contact.website || null
    row.contact_address = d.contact.address || null
  }
  if (d.status !== undefined) row.status = d.status
  if (d.branding) row.accent_color = d.branding.accentColor
  if (d.defaultCurrency !== undefined) row.default_currency = d.defaultCurrency
  return row
}

type Resolve = (x: { url?: string | null; storage_path: string | null }) => string

function toModels(rows: (ModelRow | VariantModelRow)[], resolve: Resolve): ProductModels {
  const models: ProductModels = {}
  for (const m of rows) {
    const url = resolve(m)
    models[m.format] = {
      format: m.format,
      url,
      fileName: m.file_name,
      sizeBytes: m.size_bytes ?? undefined,
      status: url ? 'valid' : 'invalid',
      validationMessage: url ? undefined : 'A download link for this file could not be created.',
      storagePath: m.storage_path ?? undefined,
      ...(m.required_extensions ? { requiredExtensions: m.required_extensions } : {}),
      ...(m.public_url ? { publicUrl: m.public_url } : {}),
    }
  }
  return models
}

function toVariant(v: VariantRow, resolve: Resolve): ProductVariant {
  const images = [...(v.product_variant_images ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i): ProductImage => ({ id: i.id, url: resolve(i), alt: i.alt ?? undefined, isPrimary: i.is_primary, kind: 'gallery', storagePath: i.storage_path }))
  const models = toModels(v.product_variant_models ?? [], resolve)
  return {
    id: v.id,
    name: v.name,
    colorHex: v.color_hex ?? undefined,
    sku: v.sku ?? undefined,
    priceDelta: v.price_delta ?? undefined,
    ...(images.length ? { images } : {}),
    ...(models.glb || models.usdz ? { models } : {}),
  }
}

export function toProduct(r: ProductRow, signed: Map<string, string>): Product {
  const resolve: Resolve = (x) => (x.storage_path ? (signed.get(x.storage_path) ?? '') : (x.url ?? ''))
  const models = toModels(r.product_models ?? [], resolve)
  return {
    id: r.id,
    businessId: r.business_id,
    slug: r.slug,
    name: r.name,
    shortDescription: r.short_description,
    description: r.description,
    material: r.material,
    category: r.category,
    price: r.price,
    currency: r.currency,
    images: [...(r.product_images ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({ id: i.id, url: resolve(i), alt: i.alt ?? undefined, isPrimary: i.is_primary, kind: i.kind, storagePath: i.storage_path ?? undefined })),
    models,
    dimensions: { width: Number(r.width), height: Number(r.height), depth: Number(r.depth), unit: r.dimension_unit },
    weight: r.weight_value != null && r.weight_unit ? { value: Number(r.weight_value), unit: r.weight_unit } : undefined,
    variants: [...(r.product_variants ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((v) => toVariant(v, resolve)),
    cta: { label: r.cta_label, url: r.cta_url ?? undefined },
    status: r.status,
    publishedAt: r.published_at ?? undefined,
    ...(r.models_changed_at ? { modelsChangedAt: r.models_changed_at } : {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** Arguments for the save_product RPC (one transaction for the product and its child rows). */
export function toSaveProductArgs(id: ID | null, p: ProductInput) {
  const stored = (x: { url: string; storagePath?: string }) => (x.storagePath ? { url: null, storage_path: x.storagePath } : { url: x.url, storage_path: null })
  return {
    p_product: {
      id,
      business_id: p.businessId,
      slug: p.slug,
      name: p.name,
      short_description: p.shortDescription,
      description: p.description,
      material: p.material,
      cta_label: p.cta.label,
      cta_url: p.cta.url || null,
      category: p.category,
      price: p.price,
      currency: p.currency,
      width: p.dimensions.width,
      height: p.dimensions.height,
      depth: p.dimensions.depth,
      dimension_unit: p.dimensions.unit,
      weight_value: p.weight?.value ?? null,
      weight_unit: p.weight?.unit ?? null,
      // S4 R-S4-3/R-S4-17: leave every model row alone (own uploads off), and the models_changed_at the editor loaded.
      keep_models: p.keepModels === true,
      expected_models_changed_at: p.modelsChangedAt ?? null,
    },
    p_images: normalizeImages(p.images).map((img, i) => ({ ...stored(img), alt: img.alt ?? null, is_primary: img.isPrimary, kind: img.kind, sort_order: i })),
    p_models: modelList(p.models).map((m) => ({ ...stored(m), format: m.format, file_name: m.fileName, size_bytes: m.sizeBytes ?? null, required_extensions: m.requiredExtensions ?? null })),
    // Variant ids are sent so they stay stable (save_product honours only ids of this product's own variants).
    // Variant media is always an owner upload: its rows carry the storage path only.
    p_variants: p.variants.map((v, i) => ({
      id: v.id,
      name: v.name,
      color_hex: v.colorHex ?? null,
      sku: v.sku ?? null,
      price_delta: v.priceDelta ?? null,
      sort_order: i,
      images: normalizeImages(v.images ?? [])
        .filter((img) => img.storagePath)
        .map((img) => ({ storage_path: img.storagePath, alt: img.alt ?? null, is_primary: img.isPrimary })),
      models: modelList(v.models)
        .filter((m) => m.storagePath)
        .map((m) => ({ format: m.format, storage_path: m.storagePath, file_name: m.fileName, size_bytes: m.sizeBytes ?? null, required_extensions: m.requiredExtensions ?? null })),
    })),
  }
}

const modelList = (m: ProductModels | undefined): ModelAsset[] => [m?.glb, m?.usdz].filter((x): x is ModelAsset => !!x)

/** The product with no 3D files on it or its options (a photo-only duplicate, S4 R-S4-3). */
const withoutModels = (p: Product): Product => ({ ...p, models: {}, variants: p.variants.map(({ models: _models, ...v }) => v) })

/** Storage paths a product points at: its images and models and every variant's photos and models. */
export function mediaPaths(p: Pick<Product, 'images' | 'models' | 'variants'>): string[] {
  const own = (images: ProductImage[] = [], models?: ProductModels) => [...images.map((i) => i.storagePath), ...modelList(models).map((m) => m.storagePath)]
  return [...own(p.images, p.models), ...p.variants.flatMap((v) => own(v.images, v.models))].filter((x): x is string => !!x)
}

/** Object path of a logo stored in our public bucket, or null for external URLs. */
export function logoPath(url: string | undefined): string | null {
  const marker = `/storage/v1/object/public/${LOGO_BUCKET}/`
  const i = url?.indexOf(marker) ?? -1
  return url && i >= 0 ? decodeURIComponent(url.slice(i + marker.length).split('?')[0] ?? '') || null : null
}

/** A logo file we may delete for this business: only objects in its own folder (never `new/` or another business). */
export function ownedLogoPath(url: string | undefined, businessId: ID): string | null {
  const path = logoPath(url)
  return path && path.startsWith(`${businessId}/`) && !path.includes('..') ? path : null
}

/** `new/<file>` for a logo uploaded before its business existed (a logo-bucket URL directly in new/), else null. */
export function stagedLogoPath(url: string | undefined): string | null {
  const path = logoPath(url)
  return path && /^new\/[^/]+$/.test(path) && !path.includes('..') ? path : null
}

const isBlobOrDataUrl = (u: string) => u.startsWith('blob:') || u.startsWith('data:')

const UPLOAD_CONTENT_TYPE: Partial<Record<UploadKind, string>> = { glb: 'model/gltf-binary', usdz: 'model/vnd.usdz+zip' }
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']
const IMAGE_EXT_BY_TYPE: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
/** Every table whose rows may reference a product-media file. */
const MEDIA_TABLES = ['product_images', 'product_models', 'product_variant_images', 'product_variant_models'] as const

// ---------------- applications, audit, email log (20261020091428_applications_and_owner_access) ----------------

const SUBMIT_APPLICATION_FUNCTION = 'submit-application'
const PROVISION_OWNER_FUNCTION = 'provision-owner'
const REVIEW_APPLICATION_FUNCTION = 'review-application'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ApplicationRow {
  id: string
  reference: string
  status: ApplicationStatus
  business_name: string
  applicant_name: string
  applicant_email: string
  applicant_phone: string | null
  website: string | null
  country: string
  city: string
  category: string
  language: Lang
  answers: BusinessApplication['answers'] | null
  decision_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  business_id: string | null
  business_deleted_at?: string | null
  created_at: string
  updated_at: string
}

export interface AuditRow {
  id: string
  created_at: string
  event_type: string
  actor_id: string | null
  application_id: string | null
  business_id: string | null
  from_status: string | null
  to_status: string | null
  metadata: Record<string, unknown> | null
}

export interface EmailRow {
  id: string
  created_at: string
  updated_at: string
  kind: string
  recipient: string
  subject: string
  status: EmailAttemptStatus
  provider_message_id: string | null
  error: string | null
  application_id: string | null
  business_id: string | null
  workflow: string | null
  attempt: number
}

/** admin_application_duplicates (R-W2-9). */
type DuplicatesAnswer =
  | { error: 'forbidden' | 'not_found' }
  | {
      applications: { id: string; reference: string; business_name: string; status: ApplicationStatus; created_at: string; match: 'email' | 'name' | 'both' }[]
      businesses: { id: string; name: string; status: BusinessStatus; match: 'owner_email' | 'name' | 'both' }[]
    }

/** Application and/or business scope: with both, rows of either match (an application and the business it created). */
function scoped<Q extends { eq(c: string, v: string): Q; or(f: string): Q }>(query: Q, s: { applicationId?: string; businessId?: string }): Q {
  const ids = [s.applicationId, s.businessId].filter((x): x is string => !!x)
  if (!ids.every((x) => UUID_PATTERN.test(x))) return query.eq('id', '00000000-0000-0000-0000-000000000000')
  if (s.applicationId && s.businessId) return query.or(`application_id.eq.${s.applicationId},business_id.eq.${s.businessId}`)
  if (s.applicationId) return query.eq('application_id', s.applicationId)
  if (s.businessId) return query.eq('business_id', s.businessId)
  return query
}

const toApplication = (r: ApplicationRow): BusinessApplication => ({
  id: r.id,
  reference: r.reference,
  status: r.status,
  businessName: r.business_name,
  applicantName: r.applicant_name,
  applicantEmail: r.applicant_email,
  applicantPhone: r.applicant_phone ?? undefined,
  website: r.website ?? undefined,
  country: r.country,
  city: r.city,
  category: r.category,
  language: r.language,
  answers: r.answers ?? {},
  decisionReason: r.decision_reason ?? undefined,
  reviewedBy: r.reviewed_by ?? undefined,
  reviewedAt: r.reviewed_at ?? undefined,
  businessId: r.business_id ?? undefined,
  businessDeletedAt: r.business_deleted_at ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

const toAuditEvent = (r: AuditRow): AuditEvent => ({
  id: r.id,
  createdAt: r.created_at,
  eventType: r.event_type,
  actorId: r.actor_id ?? undefined,
  applicationId: r.application_id ?? undefined,
  businessId: r.business_id ?? undefined,
  fromStatus: r.from_status ?? undefined,
  toStatus: r.to_status ?? undefined,
  metadata: r.metadata ?? {},
})

/** An audit row with the snapshot taken at insert (R-W7-1): the actor's role label and the business's name. */
const rowToAuditEntry = (r: AuditRow): AuditEntry => toAuditEntry(toAuditEvent(r))

const toEmailAttempt = (r: EmailRow): EmailAttempt => ({
  id: r.id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  kind: r.kind,
  recipient: r.recipient,
  subject: r.subject,
  status: r.status,
  providerMessageId: r.provider_message_id ?? undefined,
  error: r.error ?? undefined,
  applicationId: r.application_id ?? undefined,
  businessId: r.business_id ?? undefined,
  workflow: r.workflow ?? undefined,
  attempt: r.attempt,
})

/** Edge Function error bodies → service errors. Function messages are written for people; codes map to plain text. */
const FUNCTION_ERRORS: Record<string, { code: ServiceErrorCode; message: string }> = {
  invalid_application: { code: 'VALIDATION', message: 'Please fix the highlighted fields.' },
  rate_limited: { code: 'RATE_LIMITED', message: 'Too many requests. Wait a little and try again.' },
  not_signed_in: { code: 'PERMISSION', message: 'Sign in again to continue.' },
  platform_admin_only: { code: 'PERMISSION', message: 'Only platform admins can do this.' },
  // The 2FA gate of the staff Edge Functions (R-W1-1).
  aal2_required: { code: 'PERMISSION', message: 'This needs 2FA. Sign in with your authenticator code first.' },
  forbidden: { code: 'PERMISSION', message: "You don't have permission to do this." },
  business_not_found: { code: 'NOT_FOUND', message: 'This business no longer exists.' },
  business_has_owner: { code: 'CONFLICT', message: 'This business already has an owner. Remove them first to invite someone else.' },
  no_owner: { code: 'NOT_FOUND', message: 'This business has no invited owner yet.' },
  already_accepted: { code: 'CONFLICT', message: 'The owner has already accepted the invitation and can sign in.' },
  // Owner invitations (R-W2-4): both carry retryAt, and the reason names which limit applied.
  cooldown: { code: 'RATE_LIMITED', message: 'Wait a minute between invitations.' },
  too_many_invitations: { code: 'RATE_LIMITED', message: 'Ten invitations were sent to this owner in the last 24 hours.' },
  invite_link_failed: { code: 'UNKNOWN', message: 'Supabase could not create the invitation link. Check the Auth settings and try again.' },
  not_configured: { code: 'CONFIG', message: 'This feature is not configured on the server yet.' },
  duplicate_application: { code: 'CONFLICT', message: 'An application for this business from this email is already being reviewed.' },
  email_is_admin: { code: 'CONFLICT', message: 'This email belongs to a platform admin. Invite the business owner’s own address.' },
  email_owns_business: { code: 'CONFLICT', message: 'This email already owns another business. Each owner account manages one business; use a different address.' },
  account_not_invited: {
    code: 'CONFLICT',
    message: 'An account with this email already exists but was not created by an invitation, so it cannot be made owner. Use a different address, or remove that account in Supabase Auth first.',
  },
  invalid_request: { code: 'VALIDATION', message: 'Check the details and try again.' },
  // review-application (R-W2-1): admin_review_application's refusals.
  reason_required: { code: 'VALIDATION', message: 'Give a reason for the rejection.' },
  invalid_transition: { code: 'CONFLICT', message: 'This application can no longer change to that status.' },
  reopen_not_allowed: REOPEN_NOT_ALLOWED_ERROR,
  application_not_found: { code: 'NOT_FOUND', message: 'Application not found.' },
}

export function createSupabaseCatalogService(sb: SupabaseClient): CatalogService {
  const listeners = new Set<() => void>()
  /** Notify open queries after a successful write. */
  const changed = <T>(r: Result<T>): Result<T> => {
    if (r.ok) listeners.forEach((l) => l())
    return r
  }
  /** Network failures throw inside supabase-js in some paths; surface them as errors too. */
  const guard = async <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
    try {
      return await fn()
    } catch (err) {
      return fail('UNKNOWN', `Could not reach Supabase: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /**
   * R-W7-2: after a platform-team member pauses or activates a catalogue, or unpublishes or deletes a product, ask
   * notify-business-owner to email the owner. Fire-and-forget: the action's result is already decided and is never
   * changed; any failure (a business owner's own change, the function down, a 403) is dropped, without a retry.
   */
  const notifyOwner = (businessId: ID): void => {
    void (async () => {
      const access = await sb.rpc('my_platform_access')
      if (access.error || !(access.data as { role?: string | null } | null)?.role) return
      await sb.functions.invoke(NOTIFY_OWNER_FUNCTION, { body: { businessId } })
    })().catch(() => undefined)
  }

  /**
   * After a product is published, unpublished, edited while published, duplicated as published or deleted, ask
   * sync-ar-models to refresh its public AR copies (ar-models). Fire-and-forget like notifyOwner: the action's result
   * is already decided and never changes; a failure is dropped (phone AR then uses the signed URL). businessId names
   * the folder of a product that no longer exists.
   */
  const syncArModels = (productId: ID, businessId?: ID): void => {
    void Promise.resolve()
      .then(() => sb.functions.invoke(SYNC_AR_MODELS_FUNCTION, { body: businessId ? { productId, businessId } : { productId } }))
      .catch(() => undefined)
  }
  /** The ids of a business's published products (the ones that can have public AR copies); [] when unreadable. */
  const publishedIds = async (businessId: ID): Promise<ID[]> => {
    try {
      const { data } = await sb.from('products').select('id').eq('business_id', businessId).eq('status', 'published').returns<{ id: ID }[]>()
      return Array.isArray(data) ? data.map((r) => r.id) : []
    } catch {
      return [] // never blocks the business action; the copies are then left for the next sync
    }
  }

  /** Calls an Edge Function; its JSON error body ({ error, fields }) becomes a service error. */
  async function invokeFunction<T>(name: string, body: unknown): Promise<Result<T>> {
    const { data, error } = await sb.functions.invoke(name, { body: body as Record<string, unknown> })
    if (!error) return ok(data as T)
    const res = (error as { context?: Response }).context
    const payload = res && typeof res.json === 'function' ? ((await res.json().catch(() => ({}))) as { error?: string; message?: string; fields?: Record<string, string>; retryAt?: string }) : {}
    const known = payload.error ? FUNCTION_ERRORS[payload.error] : undefined
    // A refusal that can be retried later (owner invitations) keeps its reason and time.
    if (known && typeof payload.retryAt === 'string') return { ok: false, error: { code: known.code, message: known.message, reason: payload.error, retryAt: payload.retryAt } }
    if (known) return fail(known.code, payload.message ?? known.message, payload.fields)
    return fail('UNKNOWN', 'The request could not be completed. Try again in a moment.')
  }

  async function hydrate(rows: ProductRow[]): Promise<Product[]> {
    const paths = new Set<string>()
    for (const r of rows) {
      const variantMedia = (r.product_variants ?? []).flatMap((v) => [...(v.product_variant_images ?? []), ...(v.product_variant_models ?? [])])
      for (const x of [...(r.product_images ?? []), ...(r.product_models ?? []), ...variantMedia]) if (x.storage_path) paths.add(x.storage_path)
    }
    const signed = new Map<string, string>()
    if (paths.size) {
      // A signing failure leaves the URL empty; the UI then shows its missing-image / invalid-model state.
      const { data, error } = await sb.storage.from(MEDIA_BUCKET).createSignedUrls([...paths], SIGNED_URL_TTL_SECONDS)
      for (const d of data ?? []) if (d.path && d.signedUrl) signed.set(d.path, d.signedUrl)
      if (import.meta.env.DEV && (error || signed.size < paths.size)) console.warn('[media] signing product media failed', error ?? (data ?? []).filter((d) => !d.signedUrl))
    }
    return rows.map((r) => toProduct(r, signed))
  }

  async function productById(id: ID): Promise<Result<Product>> {
    const { data, error } = await sb.from('products').select(PRODUCT_SELECT).eq('id', id).maybeSingle<ProductRow>()
    if (error) return mapDbError(error)
    if (!data) return fail('NOT_FOUND', 'Product not found.')
    const [p] = await hydrate([data])
    return p ? ok(p) : fail('NOT_FOUND', 'Product not found.')
  }

  async function businessById(id: ID): Promise<Result<Business>> {
    const { data, error } = await sb.from('businesses').select('*').eq('id', id).maybeSingle<BusinessRow>()
    if (error) return mapDbError(error)
    return data ? ok(toBusiness(data)) : fail('NOT_FOUND', 'Business not found.')
  }

  async function catalogs(slug?: string): Promise<Result<BusinessCatalog[]>> {
    let bq = sb.from('businesses').select('*').order('name')
    if (slug) bq = bq.eq('slug', slug)
    // Exact counts, one row per business (R-W5-6): a plain products read stops at the API's 1000-row cap.
    const [b, c] = await Promise.all([
      bq.returns<BusinessRow[]>(),
      sb.from('business_product_counts').select('business_id, total, published').returns<{ business_id: string; total: number; published: number }[]>(),
    ])
    if (b.error) return mapDbError(b.error)
    if (c.error) return mapDbError(c.error)
    const counts = new Map(c.data.map((x) => [x.business_id, x]))
    return ok(
      b.data.map((row) => {
        const business = toBusiness(row)
        const own = counts.get(row.id)
        return {
          business,
          catalogUrl: catalogPublicUrl(business),
          localPath: catalogLocalPath(business),
          publishedProductCount: Number(own?.published ?? 0),
          totalProductCount: Number(own?.total ?? 0),
        }
      }),
    )
  }

  /**
   * Best-effort removal of product-media files no product or variant references any more (after delete or
   * replace). Runs with the caller's storage policies (own folder / admin). Cross-business references are
   * impossible (RLS checks the path folder, and products cannot change business since 20261020143507_variant_media),
   * so the caller sees every row that could still point at the file, including a duplicate's variant media.
   */
  async function removeUnreferencedMedia(paths: string[]): Promise<{ removed: number; failed: number }> {
    const unique = [...new Set(paths)]
    if (!unique.length) return { removed: 0, failed: 0 }
    const refs = await Promise.all(
      MEDIA_TABLES.map((table) => sb.from(table).select('storage_path').in('storage_path', unique).returns<{ storage_path: string }[]>()),
    )
    if (refs.some((r) => r.error)) return { removed: 0, failed: unique.length } // keep files when unsure, and say so
    const stillUsed = new Set(refs.flatMap((r) => r.data ?? []).map((r) => r.storage_path))
    const orphans = unique.filter((p) => !stillUsed.has(p))
    if (!orphans.length) return { removed: 0, failed: 0 }
    const { error } = await sb.storage.from(MEDIA_BUCKET).remove(orphans)
    return error ? { removed: 0, failed: orphans.length } : { removed: orphans.length, failed: 0 }
  }

  /**
   * Empties `folder`. Lists every page of 1000 first (removing while listing would shift the offsets), then removes
   * each page. A page that cannot be listed counts as one failed file: the real number is unknown, never zero.
   */
  async function removeFolder(bucket: string, folder: string): Promise<{ removed: number; failed: number; handled: Set<string>; subfolders: string[] }> {
    const PAGE = 1000
    const pages: string[][] = []
    const handled = new Set<string>()
    const subfolders: string[] = []
    let failed = 0
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await sb.storage.from(bucket).list(folder, { limit: PAGE, offset })
      if (error || !data) {
        failed += 1
        break
      }
      const files = data.filter((f) => f.id).map((f) => `${folder}/${f.name}`)
      subfolders.push(...data.filter((f) => !f.id).map((f) => `${folder}/${f.name}`))
      if (files.length) pages.push(files)
      for (const f of files) handled.add(f)
      if (data.length < PAGE) break
    }
    let removed = 0
    for (const files of pages) {
      const { error } = await sb.storage.from(bucket).remove(files)
      if (error) failed += files.length
      else removed += files.length
    }
    return { removed, failed, handled, subfolders }
  }

  /** Empties `folder` and each request subfolder one level below it (request photos: {business}/{request}/{file}). */
  async function removeFolderWithSubfolders(bucket: string, folder: string): Promise<{ removed: number; failed: number }> {
    const top = await removeFolder(bucket, folder)
    let removed = top.removed
    let failed = top.failed
    for (const sub of top.subfolders) {
      const inner = await removeFolder(bucket, sub)
      removed += inner.removed
      failed += inner.failed
    }
    return { removed, failed }
  }

  /**
   * R-S4-18: the request photos and staged model files of a product, from model_request_storage_paths. Read before the
   * rows go (the cascade removes the request rows that name them). null when they could not be read.
   */
  async function requestFilePaths(productId: ID): Promise<{ bucket: string; path: string; variantId: string | null }[] | null> {
    const { data, error } = await sb.rpc('model_request_storage_paths', { p_product: productId })
    if (error) return null
    if (!Array.isArray(data)) return []
    return data.flatMap((row) => {
      const r = row as { bucket?: unknown; path?: unknown; variant_id?: unknown }
      return typeof r.bucket === 'string' && typeof r.path === 'string' ? [{ bucket: r.bucket, path: r.path, variantId: typeof r.variant_id === 'string' ? r.variant_id : null }] : []
    })
  }

  /**
   * Removes exactly the paths given (never a folder): photos from model-request-photos, staged files from product-media
   * unless another row still references them. Best effort; the counts are exact.
   */
  async function removeRequestFiles(files: { bucket: string; path: string }[]): Promise<{ removed: number; failed: number }> {
    const photos = [...new Set(files.filter((f) => f.bucket === REQUEST_PHOTO_BUCKET).map((f) => f.path))]
    const staged = files.filter((f) => f.bucket === MEDIA_BUCKET).map((f) => f.path)
    let removed = 0
    let failed = 0
    if (photos.length) {
      const { data, error } = await sb.storage.from(REQUEST_PHOTO_BUCKET).remove(photos)
      // Storage answers with the objects it removed. A path RLS hides is not removed yet the call still succeeds,
      // so only the paths it returned count as removed.
      const gone = new Set((error ? [] : (data ?? [])).map((o) => o.name))
      const done = photos.filter((p) => gone.has(p)).length
      removed += done
      failed += photos.length - done
    }
    const media = await removeUnreferencedMedia(staged)
    return { removed: removed + media.removed, failed: failed + media.failed }
  }

  async function saveProduct(id: ID | null, input: ProductInput): Promise<Result<Product>> {
    const errors = validateProductDraft(input, [])
    const local = [...input.images.map((i) => i.url), input.models.glb?.url ?? '', input.models.usdz?.url ?? '']
    if (local.some(isBlobOrDataUrl)) errors.images = msg('common.validation.product.filesNotUploaded')
    const variantFiles = input.variants.flatMap((v) => [...(v.images ?? []), ...modelList(v.models)])
    if (variantFiles.some((f) => !f.storagePath)) errors.variants = msg('common.validation.product.variantFilesNotUploaded')
    if (Object.keys(errors).length) return fail('VALIDATION', 'Please fix the highlighted fields.', errors)
    const { data, error } = await sb.rpc('save_product', toSaveProductArgs(id, input))
    if (error) return mapDbError(error, { conflictField: 'product', notFound: 'Product not found.' })
    return productById(String(data))
  }

  async function analytics(businessId: ID | undefined, timeZone: string): Promise<Result<ReturnType<typeof summarize>>> {
    // Every read can pass the API's row cap (max_rows 1000), so each one is paged with range until a short page.
    const all = async <T,>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: DbError | null }>): Promise<{ data: T[] | null; error: DbError | null }> => {
      const rows: T[] = []
      for (let from = 0; ; from += DAILY_PAGE) {
        const { data, error } = await page(from, from + DAILY_PAGE - 1)
        if (error) return { data: null, error }
        rows.push(...(data ?? []))
        if ((data ?? []).length < DAILY_PAGE) return { data: rows, error: null }
      }
    }
    const [b, p, c, d] = await Promise.all([
      all((from, to) => {
        const q = sb.from('businesses').select('id')
        return (businessId ? q.eq('id', businessId) : q).order('id').range(from, to).returns<{ id: string }[]>()
      }),
      all((from, to) => {
        const q = sb.from('products').select('id, business_id, status')
        return (businessId ? q.eq('business_id', businessId) : q).order('id').range(from, to).returns<{ id: string; business_id: string; status: ProductStatus }[]>()
      }),
      // Exact product counts (R-W5-6), one row per business.
      all((from, to) => {
        const q = sb.from('business_product_counts').select('business_id, total, published, drafts')
        return (businessId ? q.eq('business_id', businessId) : q)
          .order('business_id')
          .range(from, to)
          .returns<{ business_id: string; total: number; published: number; drafts: number }[]>()
      }),
      // Local days in the person's time zone (R-W5-2), under the caller's RLS.
      all(async (from, to) => {
        const { data, error } = await sb
          .rpc('analytics_daily', { p_tz: timeZone, p_days: 30, p_business: businessId ?? null })
          .order('day')
          .order('business_id')
          .order('product_id')
          .range(from, to)
        return { data: data as DailyRow[] | null, error }
      }),
    ])
    const err = b.error ?? p.error ?? c.error ?? d.error
    if (err) return mapDbError(err)
    const businesses = b.data ?? []
    if (businessId && !businesses.length) return fail('NOT_FOUND', 'Business not found.')
    return ok(
      summarize(
        {
          businesses,
          products: (p.data ?? []).map((x) => ({ id: x.id, businessId: x.business_id, status: x.status })),
          productCounts: (c.data ?? []).map((x) => ({ businessId: x.business_id, total: Number(x.total), published: Number(x.published), drafts: Number(x.drafts) })),
          dailyStats: (d.data ?? []).map((x) => ({
            productId: x.product_id,
            businessId: x.business_id,
            date: x.day,
            views: Number(x.views),
            embedViews: Number(x.embed_views),
            arActivations: Number(x.ar_activations),
            modelInteractions: Number(x.model_interactions ?? 0),
          })),
          events: [],
        },
        businessId,
        new Date(),
        false,
        timeZone,
      ),
    )
  }

  /**
   * A write that changed no rows: RLS refused it if the caller can still read the row (ADR-0029: a member without the
   * permission), otherwise the row is gone. Reported as "no permission" or "not found" accordingly.
   */
  const refusedOrMissing = async <T,>(table: 'businesses' | 'products' | 'business_members', match: Record<string, string>, notFound: string): Promise<Result<T>> => {
    let q = sb.from(table).select('id')
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
    const { data } = await q.maybeSingle()
    return data ? teamFail<T>('forbidden') : fail<T>('NOT_FOUND', notFound)
  }

  const updateProductRow = async (id: ID, patch: Partial<ProductRow>): Promise<Result<Product>> => {
    const { data, error } = await sb.from('products').update(patch).eq('id', id).select('id').maybeSingle()
    if (error) return mapDbError(error)
    if (!data) return refusedOrMissing('products', { id }, 'Product not found.')
    return productById(id)
  }

  return {
    ...createSupabaseTeam(sb, () => listeners.forEach((l) => l())),
    ...createSupabaseModelRequestsRead(sb, () => listeners.forEach((l) => l())),
    ...createSupabaseModelRequestsBusiness(sb, () => listeners.forEach((l) => l())),
    ...createSupabaseModelRequestsStaff(sb, () => listeners.forEach((l) => l())),

    // ---------------- businesses ----------------
    getBusinesses: () =>
      guard(async () => {
        const { data, error } = await sb.from('businesses').select('*').order('updated_at', { ascending: false }).returns<BusinessRow[]>()
        return error ? mapDbError(error) : ok(data.map(toBusiness))
      }),
    getBusinessById: (id) => guard(() => businessById(id)),
    getBusinessBySlug: (slug) =>
      guard(async () => {
        const { data, error } = await sb.from('businesses').select('*').eq('slug', slug).maybeSingle<BusinessRow>()
        if (error) return mapDbError(error)
        return data ? ok(toBusiness(data)) : fail('NOT_FOUND', 'Business not found.')
      }),
    createBusiness: (input) =>
      guard(async () => {
        const errors = validateBusiness(input, [])
        if (Object.keys(errors).length) return fail('VALIDATION', 'Please fix the highlighted fields.', errors)
        const { data, error } = await sb.from('businesses').insert(fromBusinessInput(input)).select('*').single<BusinessRow>()
        if (error) return changed(mapDbError(error, { conflictField: 'business' }))
        let created: CreatedBusiness = toBusiness(data)
        // A logo uploaded before the business existed sits in new/; move it into the business folder (R-W3-4).
        // The business is kept either way; a failed move is reported to the caller.
        const staged = stagedLogoPath(input.logoUrl)
        if (staged) {
          const target = `${created.id}/${staged.slice('new/'.length)}`
          const moved = await sb.storage.from(LOGO_BUCKET).move(staged, target)
          const updated = moved.error
            ? null
            : await sb.from('businesses').update({ logo_url: sb.storage.from(LOGO_BUCKET).getPublicUrl(target).data.publicUrl }).eq('id', created.id).select('*').single<BusinessRow>()
          if (updated && !updated.error) created = toBusiness(updated.data)
          else {
            // The file moved but logo_url still names new/; never hand the caller that dead URL.
            const { logoUrl: _dead, ...rest } = created
            created = { ...rest, logoMoveFailed: true }
          }
        }
        return changed(ok(created))
      }),
    updateBusiness: (id, patch) =>
      guard(async () => {
        const current = await businessById(id)
        if (!current.ok) return current
        const next = { ...current.data, ...patch, contact: { ...current.data.contact, ...patch.contact } }
        const errors = validateBusiness(next, [])
        if (Object.keys(errors).length) return fail('VALIDATION', 'Please fix the highlighted fields.', errors)
        const { data, error } = await sb.from('businesses').update(fromBusinessInput(patch)).eq('id', id).select('*').maybeSingle<BusinessRow>()
        if (error) return mapDbError(error, { conflictField: 'business' })
        if (!data) return refusedOrMissing('businesses', { id }, 'Business not found.')
        // A replaced or removed logo is deleted only if it sits in this business's own folder: logo_url is
        // writable by members, so it could point at another business's file (security audit P1-07).
        const oldLogo = ownedLogoPath(current.data.logoUrl, id)
        if (oldLogo && 'logoUrl' in patch && patch.logoUrl !== current.data.logoUrl) await sb.storage.from(LOGO_BUCKET).remove([oldLogo])
        return changed(ok(toBusiness(data)))
      }),
    setBusinessStatus: (id, status) =>
      guard(async () => {
        const { data, error } = await sb.from('businesses').update({ status }).eq('id', id).select('*').maybeSingle<BusinessRow>()
        if (error) return mapDbError(error)
        if (data && (status === 'active' || status === 'inactive')) notifyOwner(id)
        // Only an active business's products are public, so its AR copies follow the business status.
        if (data) void publishedIds(id).then((ids) => ids.forEach((pid) => syncArModels(pid, id)))
        return changed(data ? ok(toBusiness(data)) : await refusedOrMissing<Business>('businesses', { id }, 'Business not found.'))
      }),
    deleteBusiness: (id) =>
      guard(async () => {
        const current = await businessById(id)
        const arProducts = await publishedIds(id) // read before the rows cascade away
        const { data, error } = await sb.from('businesses').delete().eq('id', id).select('id')
        if (error) return mapDbError(error)
        if (!data.length) return refusedOrMissing('businesses', { id }, 'Business not found.')
        // Rows cascade in the database; files live in Storage and are removed here (folder = business id). The public
        // AR copies are removed by sync-ar-models (clients cannot write ar-models).
        arProducts.forEach((pid) => syncArModels(pid, id))
        const [media, logos, photos] = await Promise.all([removeFolder(MEDIA_BUCKET, id), removeFolder(LOGO_BUCKET, id), removeFolderWithSubfolders(REQUEST_PHOTO_BUCKET, id)])
        const sweep: StorageSweep = { removedFiles: media.removed + logos.removed + photos.removed, failedFiles: media.failed + logos.failed + photos.failed }
        const logo = current.ok ? ownedLogoPath(current.data.logoUrl, id) : null
        // The folder sweep already counted a logo it listed; only a logo it could not list is removed (and counted) here.
        if (logo && !logos.handled.has(logo)) {
          const { error: logoError } = await sb.storage.from(LOGO_BUCKET).remove([logo])
          if (logoError) sweep.failedFiles += 1
          else sweep.removedFiles += 1
        }
        return changed(ok(sweep))
      }),
    getCatalog: (slug) =>
      guard(async () => {
        const res = await catalogs(slug)
        if (!res.ok) return res
        return res.data[0] ? ok(res.data[0]) : fail('NOT_FOUND', 'Catalog not found.')
      }),
    getCatalogs: () => guard(() => catalogs()),

    // ---------------- products ----------------
    getProducts: (q = {}) =>
      guard(async () => {
        let query = sb.from('products').select(PRODUCT_SELECT).order('updated_at', { ascending: false })
        if (q.businessId) query = query.eq('business_id', q.businessId)
        if (q.status) query = query.eq('status', q.status)
        if (q.category) query = query.eq('category', q.category)
        const { data, error } = await query.returns<ProductRow[]>()
        if (error) return mapDbError(error)
        // ponytail: name search runs in the browser; move it into the query (ilike on name->>en/pt) when catalogs grow past a few hundred rows.
        const term = q.search?.trim().toLowerCase()
        const rows = term ? data.filter((r) => r.name.en.toLowerCase().includes(term) || (r.name.pt ?? '').toLowerCase().includes(term)) : data
        return ok(await hydrate(rows))
      }),
    getProductsByBusiness: (businessId) =>
      guard(async () => {
        const { data, error } = await sb.from('products').select(PRODUCT_SELECT).eq('business_id', businessId).order('updated_at', { ascending: false }).returns<ProductRow[]>()
        return error ? mapDbError(error) : ok(await hydrate(data))
      }),
    getProductById: (id) => guard(() => productById(id)),
    getPublicProduct: (businessSlug, productSlug, opts) =>
      guard(async () => {
        const b = await sb.from('businesses').select('*').eq('slug', businessSlug).maybeSingle<BusinessRow>()
        if (b.error) return mapDbError(b.error)
        if (!b.data) return fail('NOT_FOUND', 'Catalog not found.')
        const p = await sb.from('products').select(PRODUCT_SELECT).eq('business_id', b.data.id).eq('slug', productSlug).maybeSingle<ProductRow>()
        if (p.error) return mapDbError(p.error)
        if (!p.data) return fail('NOT_FOUND', 'Product not found.')
        // RLS already hides drafts from the public; this keeps signed-in admins on the same rule unless previewing.
        if (!opts?.allowDraft && (b.data.status !== 'active' || p.data.status !== 'published')) return fail('NOT_FOUND', 'This product is not available.')
        const [product] = await hydrate([p.data])
        return product ? ok({ business: toBusiness(b.data), product }) : fail('NOT_FOUND', 'Product not found.')
      }),
    createProduct: (input) => guard(async () => changed(await saveProduct(null, input))),
    updateProduct: (id, patch) =>
      guard(async () => {
        const current = await productById(id)
        if (!current.ok) return current
        const next: Product = { ...current.data, ...patch, id, businessId: current.data.businessId, status: current.data.status }
        if (next.status === 'published') {
          const pubErrors = validateForPublish(next)
          if (Object.keys(pubErrors).length) return fail('VALIDATION', 'This product is published. Unpublish it first or keep the required fields complete.', pubErrors)
        }
        // R-S4-18: an option this save drops takes its requests with it (cascade), so read their files first.
        const droppingOptions = current.data.variants.some((v) => !next.variants.some((n) => n.id === v.id))
        const requestFiles = droppingOptions ? await requestFilePaths(id) : null
        // The Result<Product> cannot carry a sweep, so photos that cannot be located are named in the console, never dropped silently.
        if (droppingOptions && !requestFiles) console.warn('updateProduct: the request files of a removed option could not be read, so they were not removed.')
        const saved = await saveProduct(id, next)
        if (saved.ok) {
          // A changed model row has no public copy yet (its public_url is null): the sync copies and links it.
          if (saved.data.status === 'published') syncArModels(id)
          await removeUnreferencedMedia(mediaPaths(current.data))
          const kept = new Set(saved.data.variants.map((v) => v.id))
          const dropped = requestFiles?.filter((f) => f.variantId && !kept.has(f.variantId)) ?? []
          if (dropped.length) {
            const swept = await removeRequestFiles(dropped)
            if (swept.failed) console.warn(`updateProduct: ${swept.failed} request file(s) of a removed option could not be removed.`)
          }
        }
        return changed(saved)
      }),
    duplicateProduct: (id) =>
      guard(async () => {
        const src = await productById(id)
        if (!src.ok) return src
        const siblings = await sb.from('products').select('slug').eq('business_id', src.data.businessId).returns<{ slug: string }[]>()
        if (siblings.error) return mapDbError(siblings.error)
        const slug = uniqueSlug(`${src.data.slug}-copy`, siblings.data.map((s) => s.slug), PRODUCT_SLUG_MAX)
        const name = { en: `${src.data.name.en} (copy)`, ...(src.data.name.pt ? { pt: `${src.data.name.pt} (cópia)` } : {}) }
        // S4 R-S4-3 (Review Focus 1): a business that may not write its own 3D files gets a photo-only copy; the
        // original keeps its files.
        const own = await sb.rpc('can_write_own_models', { p_business: src.data.businessId })
        if (own.error) return mapDbError(own.error)
        const from = own.data === true ? src.data : withoutModels(src.data)
        // Copies reference the same stored files; nothing is re-uploaded.
        const copy = await saveProduct(null, { ...from, slug, name })
        if (copy.ok && copy.data.status === 'published') syncArModels(copy.data.id)
        return changed(copy)
      }),
    deleteProduct: (id) =>
      guard(async () => {
        const current = await productById(id)
        const requestFiles = await requestFilePaths(id) // R-S4-18: read before the rows cascade away
        const { data, error } = await sb.from('products').delete().eq('id', id).select('id')
        if (error) return mapDbError(error)
        if (!data.length) return refusedOrMissing('products', { id }, 'Product not found.')
        let sweep: StorageSweep = { removedFiles: 0, failedFiles: 0 }
        if (current.ok) {
          notifyOwner(current.data.businessId)
          syncArModels(id, current.data.businessId)
          const media = await removeUnreferencedMedia(mediaPaths(current.data))
          sweep = { removedFiles: media.removed, failedFiles: media.failed }
        }
        // Unreadable paths are reported as one failed file (the real number is unknown, never zero).
        if (!requestFiles) sweep.failedFiles += 1
        else if (requestFiles.length) {
          const files = await removeRequestFiles(requestFiles)
          sweep = { removedFiles: sweep.removedFiles + files.removed, failedFiles: sweep.failedFiles + files.failed }
        }
        return changed(ok(sweep))
      }),
    publishProduct: (id) =>
      guard(async () => {
        const current = await productById(id)
        if (!current.ok) return current
        const errors = validateForPublish(current.data)
        if (Object.keys(errors).length) return fail('VALIDATION', 'This product is missing information required for publishing.', errors)
        const r = await updateProductRow(id, { status: 'published', published_at: new Date().toISOString() })
        if (r.ok) syncArModels(id)
        return changed(r)
      }),
    unpublishProduct: (id) =>
      guard(async () => {
        const r = await updateProductRow(id, { status: 'draft' })
        if (r.ok) {
          notifyOwner(r.data.businessId)
          syncArModels(id)
        }
        return changed(r)
      }),

    // ---------------- analytics ----------------
    getAnalytics: (opts) => guard(() => analytics(undefined, opts?.timeZone ?? deviceTimeZone())),
    getBusinessAnalytics: (businessId, opts) => guard(() => analytics(businessId, opts?.timeZone ?? deviceTimeZone())),
    recordEvent: ({ productId, businessId, type }) =>
      guard(async () => {
        // Through the rate-limited track-event Edge Function; browsers cannot insert events directly.
        const { error } = await sb.functions.invoke(TRACK_EVENT_FUNCTION, { body: { productId, businessId, type } })
        if (!error) return ok(undefined)
        const status = (error as { context?: { status?: number } }).context?.status
        if (status === 429) return fail('RATE_LIMITED', 'Too many events from this visitor. Try again in a minute.')
        if (status === 400 || status === 422) return fail('VALIDATION', 'This event cannot be recorded for this product.')
        return fail('UNKNOWN', `Could not record the event: ${error.message}`)
      }),
    getRecentActivity: (opts = {}) =>
      guard(async () => {
        // Audit events written by the database (R-W5-5); RLS decides which ones this person reads.
        let q = sb.from('audit_events').select('*').in('event_type', [...ACTIVITY_KINDS]).order('created_at', { ascending: false })
        if (opts.businessId) q = q.eq('business_id', opts.businessId)
        const { data, error } = await q.limit(opts.limit ?? 10).returns<AuditRow[]>()
        if (error) return mapDbError(error)
        const events = (data ?? []).map(toAuditEvent)
        // Catalog status and business_created rows carry the business id only: name the businesses from their rows.
        const unnamed = [...new Set(events.filter((e) => (e.eventType === 'business_status_changed' || e.eventType === 'business_created') && e.businessId && !e.metadata.business_name).map((e) => e.businessId!))]
        const names = new Map<ID, string>()
        if (unnamed.length) {
          const b = await sb.from('businesses').select('id, name').in('id', unnamed).returns<{ id: string; name: string }[]>()
          if (b.error) return mapDbError(b.error)
          for (const x of b.data ?? []) names.set(x.id, x.name)
        }
        return ok(deriveActivity(events, names))
      }),

    // ---------------- business owners ----------------
    getBusinessMembers: (businessId) =>
      guard(async () => {
        const { data, error } = await sb.rpc('admin_list_business_members', { p_business_id: businessId })
        if (error) return mapDbError(error)
        const rows = (data ?? []) as { user_id: string; email: string; created_at: string; invited_at: string | null; accepted_at: string | null; last_sign_in_at: string | null }[]
        return ok(
          rows.map((r) => ({
            userId: r.user_id,
            email: r.email,
            addedAt: r.created_at,
            invitedAt: r.invited_at ?? undefined,
            acceptedAt: r.accepted_at ?? undefined,
            lastSignInAt: r.last_sign_in_at ?? undefined,
          })),
        )
      }),
    removeBusinessMember: (businessId, userId) =>
      guard(async () => {
        const { data, error } = await sb.from('business_members').delete().eq('business_id', businessId).eq('user_id', userId).select('id')
        if (error) return mapDbError(error)
        return changed(data.length ? ok(undefined) : await refusedOrMissing<void>('business_members', { business_id: businessId, user_id: userId }, 'This owner was not found.'))
      }),
    provisionOwner: ({ businessId, email, language, applicationId }) =>
      guard(async () => changed(await invokeFunction<ProvisionOutcome>(PROVISION_OWNER_FUNCTION, { action: 'provision', businessId, email, language, applicationId }))),
    resendOwnerInvitation: (businessId, language) =>
      guard(async () => changed(await invokeFunction<ProvisionOutcome>(PROVISION_OWNER_FUNCTION, { action: 'resend', businessId, language }))),
    getOwnerStates: () =>
      guard(async () => {
        const { data, error } = await sb.rpc('admin_list_owner_states')
        if (error) return mapDbError(error)
        if (!Array.isArray(data)) return fail('PERMISSION', "You don't have permission to do this.")
        const rows = data as { business_id: string; state: OwnerState['state']; last_invited_at: string | null; email_failed: boolean }[]
        return ok(rows.map((r) => ({ businessId: r.business_id, state: r.state, lastInvitedAt: r.last_invited_at, emailFailed: r.email_failed })))
      }),

    // ---------------- business applications ----------------
    submitApplication: (input) => guard(() => invokeFunction<{ id: string; reference: string }>(SUBMIT_APPLICATION_FUNCTION, input)),

    getApplications: (q = {}) =>
      guard(async () => {
        const size = q.pageSize ?? 20
        const from = ((q.page ?? 1) - 1) * size
        let query = sb.from('business_applications').select('*', { count: 'exact' }).order('created_at', { ascending: false })
        if (q.status) query = query.eq('status', q.status)
        if (q.from) query = query.gte('created_at', localDayBounds(q.from).start)
        if (q.to) query = query.lt('created_at', localDayBounds(q.to).end)
        const term = q.search?.replace(/[",()\\%*]/g, ' ').trim()
        if (term) {
          const like = `"%${term}%"`
          const ors = [`business_name.ilike.${like}`, `applicant_name.ilike.${like}`, `applicant_email.ilike.${like}`, `reference.ilike.${like}`]
          if (UUID_PATTERN.test(term)) ors.push(`id.eq.${term}`)
          query = query.or(ors.join(','))
        }
        const { data, error, count } = await query.range(from, from + size - 1).returns<ApplicationRow[]>()
        if (error) return mapDbError(error)
        return ok({ items: (data ?? []).map(toApplication), total: count ?? 0 })
      }),

    getApplication: (id) =>
      guard(async () => {
        if (!UUID_PATTERN.test(id)) return fail('NOT_FOUND', 'Application not found.')
        const { data, error } = await sb.from('business_applications').select('*').eq('id', id).maybeSingle<ApplicationRow>()
        if (error) return mapDbError(error)
        return data ? ok(toApplication(data)) : fail('NOT_FOUND', 'Application not found.')
      }),

    // Every review action goes through review-application (R-W2-1): it runs admin_review_application as the caller
    // and, on a rejection, emails the applicant. The function answers with the new status; the row is then re-read.
    reviewApplication: (id, action, reason, opts) =>
      guard(async () => {
        if (!UUID_PATTERN.test(id)) return fail('NOT_FOUND', 'Application not found.')
        const r = await invokeFunction<{ ok: true; status: string; businessId?: string; email?: { status: EmailAttemptStatus; error?: string } }>(REVIEW_APPLICATION_FUNCTION, {
          applicationId: id,
          action,
          reason: reason ?? null,
          includeReason: opts?.includeReason === true,
        })
        if (!r.ok) return r
        listeners.forEach((l) => l())
        const { data, error } = await sb.from('business_applications').select('*').eq('id', id).maybeSingle<ApplicationRow>()
        const decision = r.data.email ? { decisionEmail: r.data.email } : {}
        // The decision is applied either way: a failed re-read still reports it (the page refetches), never "not updated".
        if (error || !data) {
          const status = r.data.status as ApplicationStatus
          return ok({ reloaded: false as const, id, status, ...(r.data.businessId ? { businessId: r.data.businessId } : {}), ...decision })
        }
        return ok({ ...toApplication(data), ...decision })
      }),

    getApplicationDuplicates: (id) =>
      guard(async () => {
        if (!UUID_PATTERN.test(id)) return fail('NOT_FOUND', 'Application not found.')
        const { data, error } = await sb.rpc('admin_application_duplicates', { p_application_id: id })
        if (error) return mapDbError(error)
        const r = data as unknown as DuplicatesAnswer
        if ('error' in r) return r.error === 'not_found' ? fail('NOT_FOUND', 'Application not found.') : teamFail('forbidden')
        return ok({
          applications: r.applications.map((a) => ({
            id: a.id, reference: a.reference, businessName: a.business_name, status: a.status, createdAt: a.created_at, match: a.match,
          })),
          businesses: r.businesses.map((b) => ({ id: b.id, name: b.name, status: b.status, match: b.match })),
        })
      }),

    getAuditEvents: (q = {}) =>
      guard(async () => {
        const size = q.pageSize ?? 20
        const from = ((q.page ?? 1) - 1) * size
        let query = sb.from('audit_events').select('*', { count: 'exact' }).order('created_at', { ascending: false })
        query = scoped(query, q)
        const term = q.search?.trim().toLowerCase().replace(/[^a-z_ ]/g, '').replace(/\s+/g, '_')
        if (term) query = query.ilike('event_type', `%${term}%`)
        if (q.includeSignIns !== true) query = query.neq('event_type', 'account_signed_in')
        const { data, error, count } = await query.range(from, from + size - 1).returns<AuditRow[]>()
        if (error) return mapDbError(error)
        const rows = data ?? []
        const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x))]
        const emails = new Map<string, string>()
        if (actorIds.length) {
          const r = await sb.rpc('admin_user_emails', { p_ids: actorIds })
          for (const u of (r.data ?? []) as { id: string; email: string }[]) emails.set(u.id, u.email)
        }
        // R-W7-1: a business that was deleted has a business_deleted row with its id (history keeps the id).
        const businessIds = [...new Set(rows.map((r) => r.business_id).filter((x): x is string => !!x))]
        const deleted = new Set<string>()
        if (businessIds.length) {
          const d = await sb.from('audit_events').select('business_id').eq('event_type', 'business_deleted').in('business_id', businessIds).returns<{ business_id: string }[]>()
          if (d.error) return mapDbError(d.error)
          for (const x of d.data ?? []) deleted.add(x.business_id)
        }
        return ok({
          items: rows.map((r) => ({
            ...rowToAuditEntry(r),
            actorEmail: r.actor_id ? emails.get(r.actor_id) : undefined,
            ...(r.business_id ? { businessDeleted: deleted.has(r.business_id) } : {}),
          })),
          total: count ?? 0,
        })
      }),

    getPlatformChanges: (businessId) =>
      guard(async () => {
        if (!UUID_PATTERN.test(businessId)) return fail('NOT_FOUND', 'Business not found.')
        const { data, error } = await sb
          .from('audit_events')
          .select('*')
          .eq('business_id', businessId)
          .in('metadata->>actor_label', [...PLATFORM_ACTOR_LABELS])
          .in('event_type', [...PLATFORM_CHANGE_EVENTS])
          .order('created_at', { ascending: false })
          .limit(20)
          .returns<AuditRow[]>()
        if (error) return mapDbError(error)
        return ok((data ?? []).map(rowToAuditEntry))
      }),

    getEmailAttempts: (q) =>
      guard(async () => {
        let query = sb.from('email_log').select('*').order('created_at', { ascending: false }).limit(100)
        query = scoped(query, q)
        const { data, error } = await query.returns<EmailRow[]>()
        if (error) return mapDbError(error)
        return ok((data ?? []).map(toEmailAttempt))
      }),

    // ---------------- files ----------------
    uploadAsset: ({ kind, file, businessId }) =>
      guard(async () => {
        const bucket = kind === 'logo' ? LOGO_BUCKET : MEDIA_BUCKET
        if (!businessId && kind !== 'logo') return fail('VALIDATION', 'Choose the business before uploading files.')
        const named = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() : 'bin'
        // Images keep a known extension: the variant-media path rule accepts png, jpg/jpeg and webp only.
        const ext = kind === 'image' && !IMAGE_EXTENSIONS.includes(named) ? (IMAGE_EXT_BY_TYPE[file.type] ?? named) : named
        // Path convention (design/19): {business_id}/{uuid}.{ext}; logos for a business not yet created go under new/.
        const path = `${businessId ?? 'new'}/${crypto.randomUUID()}.${ext}`
        // supabase-js sends a File with its own type (browsers report '' for .glb/.usdz, stored as
        // application/octet-stream and refused by the bucket), so re-wrap it with the right type.
        const contentType = UPLOAD_CONTENT_TYPE[kind] ?? file.type
        const body = file.type === contentType ? file : new File([file], file.name, { type: contentType })
        const { error } = await sb.storage.from(bucket).upload(path, body, { contentType, upsert: false })
        if (error) return isStorageForbidden(error) ? teamFail('forbidden') : fail('STORAGE', `Upload failed: ${error.message}`)
        if (bucket === LOGO_BUCKET) return ok({ url: sb.storage.from(bucket).getPublicUrl(path).data.publicUrl, status: 'valid' as const })
        const signed = await sb.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
        if (signed.error) return fail('STORAGE', `Uploaded, but a preview link could not be created: ${signed.error.message}`)
        return ok({ url: signed.data.signedUrl, storagePath: path, status: 'valid' as const })
      }),

    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    resetDemoData: async () => fail('UNSUPPORTED', 'Resetting demo data is only available in demo mode.'),
  }
}
