// Supabase implementation of CatalogService: same contract as the mock, different storage.
// Access control is enforced by RLS and storage policies in supabase/migrations; checks here are for UX only.
// Every failure is returned as an error Result. Nothing falls back to demo data.
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Business,
  BusinessCatalog,
  BusinessStatus,
  Category,
  Currency,
  ID,
  LengthUnit,
  LocalizedText,
  ModelAsset,
  ModelFormat,
  Product,
  ProductImage,
  ProductStatus,
  WeightUnit,
} from '@/domain/types'
import { uniqueSlug } from '@/lib/slug'
import { catalogLocalPath, catalogPublicUrl } from '@/lib/urls'
import { deriveActivity, isoDay, summarize } from '../analytics'
import { type BusinessInput, type CatalogService, MEDIA_URL_TTL_SECONDS, type ProductInput, type Result, type ServiceError, type UploadKind, fail, ok } from '../catalogService'
import { normalizeImages, validateBusiness, validateForPublish, validateProductDraft } from '../validation'

export const MEDIA_BUCKET = 'product-media'
export const LOGO_BUCKET = 'business-logos'
export const TRACK_EVENT_FUNCTION = 'track-event'
// 12 h: anonymous visitors can already sign any published product's media (storage policy), so a longer
// lifetime only widens the window in which a just-unpublished file stays reachable by an old link.
const SIGNED_URL_TTL_SECONDS = MEDIA_URL_TTL_SECONDS
const PRODUCT_SELECT = '*, product_images(*), product_models(*), product_variants(*)'

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
}
export interface VariantRow {
  id: string
  name: LocalizedText
  color_hex: string | null
  sku: string | null
  price_delta: number | null
  sort_order: number
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
  created_at: string
  updated_at: string
  product_images?: ImageRow[]
  product_models?: ModelRow[]
  product_variants?: VariantRow[]
}
export interface DailyRow {
  business_id: string
  product_id: string
  day: string
  views: number
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
}

/** Stable message keys raised by the account functions (20261013144121_owner_registration_and_claims). */
const ACCOUNT_RULES: Record<string, ServiceError> = {
  sign_in_required: { code: 'PERMISSION', message: 'Sign in first.' },
  email_not_confirmed: { code: 'PERMISSION', message: 'Confirm your email address first: open the link we sent you, then sign in again.' },
  registration_pending: { code: 'CONFLICT', message: 'Your account already has a business waiting for approval. We will review it shortly.' },
  slug_taken: { code: 'CONFLICT', message: 'Please fix the highlighted fields.', fieldErrors: { slug: 'This address is already taken. Choose another one.' } },
  claim_invalid: { code: 'NOT_FOUND', message: 'This claim link is invalid, already used or expired. Ask us for a new one.' },
  business_not_found: { code: 'NOT_FOUND', message: 'This business no longer exists.' },
}

/**
 * Maps Postgres/PostgREST/Storage errors to service errors with a message the user can act on.
 * Raw database text (policy, constraint and column names) is never shown; in development it is logged.
 */
export function mapDbError<T>(e: DbError, ctx: { notFound?: string; conflictField?: keyof typeof SLUG_TAKEN } = {}): Result<T> {
  if (import.meta.env.DEV) console.error('[supabase]', e.code, e.message)
  const account = ACCOUNT_RULES[e.message]
  if (account) return { ok: false, error: account }
  const rule = DB_RULES[e.message]
  if (rule) return fail('VALIDATION', 'Please fix the highlighted fields.', { [rule.field]: rule.message })
  switch (e.code) {
    case '23505':
      return ctx.conflictField
        ? fail('CONFLICT', 'Please fix the highlighted fields.', { slug: SLUG_TAKEN[ctx.conflictField] })
        : fail('CONFLICT', 'This record already exists.')
    case '42501':
      return fail('PERMISSION', 'Your account is not allowed to do this.')
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

const toBusiness = (r: BusinessRow): Business => ({
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

function toProduct(r: ProductRow, signed: Map<string, string>): Product {
  const resolve = (x: { url: string | null; storage_path: string | null }) => (x.storage_path ? (signed.get(x.storage_path) ?? '') : (x.url ?? ''))
  const models: Product['models'] = {}
  for (const m of r.product_models ?? []) {
    const url = resolve(m)
    const asset: ModelAsset = {
      format: m.format,
      url,
      fileName: m.file_name,
      sizeBytes: m.size_bytes ?? undefined,
      status: url ? 'valid' : 'invalid',
      validationMessage: url ? undefined : 'A download link for this file could not be created.',
      storagePath: m.storage_path ?? undefined,
    }
    models[m.format] = asset
  }
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
      .map((v) => ({ id: v.id, name: v.name, colorHex: v.color_hex ?? undefined, sku: v.sku ?? undefined, priceDelta: v.price_delta ?? undefined })),
    cta: { label: r.cta_label, url: r.cta_url ?? undefined },
    status: r.status,
    publishedAt: r.published_at ?? undefined,
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
    },
    p_images: normalizeImages(p.images).map((img, i) => ({ ...stored(img), alt: img.alt ?? null, is_primary: img.isPrimary, kind: img.kind, sort_order: i })),
    p_models: Object.values(p.models)
      .filter((m): m is ModelAsset => !!m)
      .map((m) => ({ ...stored(m), format: m.format, file_name: m.fileName, size_bytes: m.sizeBytes ?? null })),
    p_variants: p.variants.map((v, i) => ({ name: v.name, color_hex: v.colorHex ?? null, sku: v.sku ?? null, price_delta: v.priceDelta ?? null, sort_order: i })),
  }
}

/** Storage paths a product points at (images + models). */
export function mediaPaths(p: Pick<Product, 'images' | 'models'>): string[] {
  return [...p.images.map((i) => i.storagePath), p.models.glb?.storagePath, p.models.usdz?.storagePath].filter((x): x is string => !!x)
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

const isBlobOrDataUrl = (u: string) => u.startsWith('blob:') || u.startsWith('data:')

const UPLOAD_CONTENT_TYPE: Partial<Record<UploadKind, string>> = { glb: 'model/gltf-binary', usdz: 'model/vnd.usdz+zip' }

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

  async function hydrate(rows: ProductRow[]): Promise<Product[]> {
    const paths = new Set<string>()
    for (const r of rows) {
      for (const x of [...(r.product_images ?? []), ...(r.product_models ?? [])]) if (x.storage_path) paths.add(x.storage_path)
    }
    const signed = new Map<string, string>()
    if (paths.size) {
      // A signing failure leaves the URL empty; the UI then shows its missing-image / invalid-model state.
      const { data } = await sb.storage.from(MEDIA_BUCKET).createSignedUrls([...paths], SIGNED_URL_TTL_SECONDS)
      for (const d of data ?? []) if (d.path && d.signedUrl) signed.set(d.path, d.signedUrl)
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
    const [b, p] = await Promise.all([bq.returns<BusinessRow[]>(), sb.from('products').select('business_id, status').returns<{ business_id: string; status: ProductStatus }[]>()])
    if (b.error) return mapDbError(b.error)
    if (p.error) return mapDbError(p.error)
    return ok(
      b.data.map((row) => {
        const business = toBusiness(row)
        const own = p.data.filter((x) => x.business_id === row.id)
        return {
          business,
          catalogUrl: catalogPublicUrl(business),
          localPath: catalogLocalPath(business),
          publishedProductCount: own.filter((x) => x.status === 'published').length,
          totalProductCount: own.length,
        }
      }),
    )
  }

  /**
   * Best-effort removal of product-media files no product references any more (after delete or
   * replace). Runs with the caller's storage policies (own folder / admin). Cross-business references
   * are impossible (RLS), so the caller can see every row that could still point at the file.
   */
  async function removeUnreferencedMedia(paths: string[]): Promise<void> {
    const unique = [...new Set(paths)]
    if (!unique.length) return
    const [img, mdl] = await Promise.all([
      sb.from('product_images').select('storage_path').in('storage_path', unique).returns<{ storage_path: string }[]>(),
      sb.from('product_models').select('storage_path').in('storage_path', unique).returns<{ storage_path: string }[]>(),
    ])
    if (img.error || mdl.error) return // keep files when unsure
    const stillUsed = new Set([...img.data, ...mdl.data].map((r) => r.storage_path))
    const orphans = unique.filter((p) => !stillUsed.has(p))
    if (orphans.length) await sb.storage.from(MEDIA_BUCKET).remove(orphans)
  }

  async function removeFolder(bucket: string, folder: string): Promise<void> {
    // ponytail: one page of 1000 objects per bucket; loop with offset if a business ever stores more.
    const { data } = await sb.storage.from(bucket).list(folder, { limit: 1000 })
    const files = (data ?? []).filter((f) => f.id).map((f) => `${folder}/${f.name}`)
    if (files.length) await sb.storage.from(bucket).remove(files)
  }

  async function saveProduct(id: ID | null, input: ProductInput): Promise<Result<Product>> {
    const errors = validateProductDraft(input, [])
    const local = [...input.images.map((i) => i.url), input.models.glb?.url ?? '', input.models.usdz?.url ?? '']
    if (local.some(isBlobOrDataUrl)) errors.images = 'Some files were not uploaded to storage. Remove them and upload again.'
    if (Object.keys(errors).length) return fail('VALIDATION', 'Please fix the highlighted fields.', errors)
    const { data, error } = await sb.rpc('save_product', toSaveProductArgs(id, input))
    if (error) return mapDbError(error, { conflictField: 'product', notFound: 'Product not found.' })
    return productById(String(data))
  }

  async function analytics(businessId?: ID): Promise<Result<ReturnType<typeof summarize>>> {
    const since = isoDay(new Date(Date.now() - 29 * 86_400_000))
    let bq = sb.from('businesses').select('id')
    let pq = sb.from('products').select('id, business_id, status')
    let dq = sb.from('product_analytics_daily').select('*').gte('day', since)
    if (businessId) {
      bq = bq.eq('id', businessId)
      pq = pq.eq('business_id', businessId)
      dq = dq.eq('business_id', businessId)
    }
    const [b, p, d] = await Promise.all([
      bq.returns<{ id: string }[]>(),
      pq.returns<{ id: string; business_id: string; status: ProductStatus }[]>(),
      dq.returns<DailyRow[]>(),
    ])
    const err = b.error ?? p.error ?? d.error
    if (err) return mapDbError(err)
    const businesses = b.data ?? []
    if (businessId && !businesses.length) return fail('NOT_FOUND', 'Business not found.')
    return ok(
      summarize(
        {
          businesses,
          products: (p.data ?? []).map((x) => ({ id: x.id, businessId: x.business_id, status: x.status })),
          dailyStats: (d.data ?? []).map((x) => ({ productId: x.product_id, businessId: x.business_id, date: x.day, views: Number(x.views), arActivations: Number(x.ar_activations), modelInteractions: Number(x.model_interactions ?? 0) })),
          events: [],
        },
        businessId,
        new Date(),
        false,
      ),
    )
  }

  const updateProductRow = async (id: ID, patch: Partial<ProductRow>): Promise<Result<Product>> => {
    const { data, error } = await sb.from('products').update(patch).eq('id', id).select('id').maybeSingle()
    if (error) return mapDbError(error)
    if (!data) return fail('NOT_FOUND', 'Product not found, or your account cannot change it.')
    return productById(id)
  }

  return {
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
        return changed(error ? mapDbError(error, { conflictField: 'business' }) : ok(toBusiness(data)))
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
        if (!data) return fail('NOT_FOUND', 'Business not found, or your account cannot change it.')
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
        return changed(data ? ok(toBusiness(data)) : fail('NOT_FOUND', 'Business not found, or your account cannot change it.'))
      }),
    deleteBusiness: (id) =>
      guard(async () => {
        const current = await businessById(id)
        const { data, error } = await sb.from('businesses').delete().eq('id', id).select('id')
        if (error) return mapDbError(error)
        if (!data.length) return fail('NOT_FOUND', 'Business not found, or your account cannot delete it.')
        // Rows cascade in the database; files live in Storage and are removed here (folder = business id).
        await Promise.all([removeFolder(MEDIA_BUCKET, id), removeFolder(LOGO_BUCKET, id)])
        const logo = current.ok ? ownedLogoPath(current.data.logoUrl, id) : null
        if (logo) await sb.storage.from(LOGO_BUCKET).remove([logo])
        return changed(ok(undefined))
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
        const saved = await saveProduct(id, next)
        if (saved.ok) await removeUnreferencedMedia(mediaPaths(current.data))
        return changed(saved)
      }),
    duplicateProduct: (id) =>
      guard(async () => {
        const src = await productById(id)
        if (!src.ok) return src
        const siblings = await sb.from('products').select('slug').eq('business_id', src.data.businessId).returns<{ slug: string }[]>()
        if (siblings.error) return mapDbError(siblings.error)
        const slug = uniqueSlug(`${src.data.slug}-copy`, siblings.data.map((s) => s.slug)).slice(0, 70)
        const name = { en: `${src.data.name.en} (copy)`, ...(src.data.name.pt ? { pt: `${src.data.name.pt} (cópia)` } : {}) }
        // Copies reference the same stored files; nothing is re-uploaded.
        return changed(await saveProduct(null, { ...src.data, slug, name }))
      }),
    deleteProduct: (id) =>
      guard(async () => {
        const current = await productById(id)
        const { data, error } = await sb.from('products').delete().eq('id', id).select('id')
        if (error) return mapDbError(error)
        if (!data.length) return fail('NOT_FOUND', 'Product not found, or your account cannot delete it.')
        if (current.ok) await removeUnreferencedMedia(mediaPaths(current.data))
        return changed(ok(undefined))
      }),
    publishProduct: (id) =>
      guard(async () => {
        const current = await productById(id)
        if (!current.ok) return current
        const errors = validateForPublish(current.data)
        if (Object.keys(errors).length) return fail('VALIDATION', 'This product is missing information required for publishing.', errors)
        return changed(await updateProductRow(id, { status: 'published', published_at: new Date().toISOString() }))
      }),
    unpublishProduct: (id) => guard(async () => changed(await updateProductRow(id, { status: 'draft' }))),

    // ---------------- analytics ----------------
    getAnalytics: () => guard(() => analytics()),
    getBusinessAnalytics: (businessId) => guard(() => analytics(businessId)),
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
        let bq = sb.from('businesses').select('id, name, created_at')
        let pq = sb.from('products').select('id, business_id, name, created_at, published_at')
        if (opts.businessId) {
          bq = bq.eq('id', opts.businessId)
          pq = pq.eq('business_id', opts.businessId)
        }
        const [b, p] = await Promise.all([
          bq.returns<{ id: string; name: string; created_at: string }[]>(),
          pq.returns<{ id: string; business_id: string; name: LocalizedText; created_at: string; published_at: string | null }[]>(),
        ])
        const err = b.error ?? p.error
        if (err) return mapDbError(err)
        const items = deriveActivity(
          (b.data ?? []).map((x) => ({ id: x.id, name: x.name, createdAt: x.created_at })),
          (p.data ?? []).map((x) => ({ id: x.id, businessId: x.business_id, name: x.name, createdAt: x.created_at, publishedAt: x.published_at ?? undefined })),
        )
        return ok(items.slice(0, opts.limit ?? 10))
      }),

    // ---------------- business owners ----------------
    getBusinessMembers: (businessId) =>
      guard(async () => {
        const { data, error } = await sb.rpc('admin_list_business_members', { p_business_id: businessId })
        if (error) return mapDbError(error)
        const rows = (data ?? []) as { user_id: string; email: string; created_at: string }[]
        return ok(rows.map((r) => ({ userId: r.user_id, email: r.email, addedAt: r.created_at })))
      }),
    addBusinessMember: (businessId, email) =>
      guard(async () => {
        const { error } = await sb.rpc('admin_add_business_member', { p_business_id: businessId, p_email: email })
        return changed(error ? mapDbError(error) : ok(undefined))
      }),
    createBusinessClaim: (businessId) =>
      guard(async () => {
        const { data, error } = await sb.rpc('admin_create_business_claim', { p_business_id: businessId })
        if (error) return mapDbError(error, { notFound: 'This business no longer exists.' })
        const row = (data as { token: string; expires_at: string }[])[0]
        return row ? ok({ token: row.token, expiresAt: row.expires_at }) : fail('UNKNOWN', 'No claim link was returned. Try again.')
      }),
    removeBusinessMember: (businessId, userId) =>
      guard(async () => {
        const { data, error } = await sb.from('business_members').delete().eq('business_id', businessId).eq('user_id', userId).select('id')
        if (error) return mapDbError(error)
        return changed(data.length ? ok(undefined) : fail('NOT_FOUND', 'This owner was not found, or your account cannot remove owners.'))
      }),

    // ---------------- files ----------------
    uploadAsset: ({ kind, file, businessId }) =>
      guard(async () => {
        const bucket = kind === 'logo' ? LOGO_BUCKET : MEDIA_BUCKET
        if (!businessId && kind !== 'logo') return fail('VALIDATION', 'Choose the business before uploading files.')
        const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() : 'bin'
        // Path convention (design/19): {business_id}/{uuid}.{ext}; logos for a business not yet created go under new/.
        const path = `${businessId ?? 'new'}/${crypto.randomUUID()}.${ext}`
        // supabase-js sends a File with its own type (browsers report '' for .glb/.usdz, stored as
        // application/octet-stream and refused by the bucket), so re-wrap it with the right type.
        const contentType = UPLOAD_CONTENT_TYPE[kind] ?? file.type
        const body = file.type === contentType ? file : new File([file], file.name, { type: contentType })
        const { error } = await sb.storage.from(bucket).upload(path, body, { contentType, upsert: false })
        if (error) return fail('STORAGE', `Upload failed: ${error.message}`)
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
