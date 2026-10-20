// Mock implementation of CatalogService. Simulates latency, never throws, returns copies.
// Demo persistence only (localStorage). NOT a backend.
import type { ActivityItem, ActivityKind, AuditEvent, Business, BusinessApplication, BusinessCatalog, EmailAttempt, ID, Product } from '@/domain/types'
import { createSessionModelAsset, imageToPersistableDataUrl } from '@/lib/files'
import { localDayBounds } from '@/lib/format'
import { newId } from '@/lib/id'
import { PRODUCT_SLUG_MAX, slugify, uniqueSlug } from '@/lib/slug'
import { catalogLocalPath, catalogPublicUrl } from '@/lib/urls'
import { validateApplication } from '../../../supabase/functions/_shared/application.ts'
import { MAX_INVITATION_ATTEMPTS, RESEND_COOLDOWN_SECONDS, applyReview } from '../applicationRules'
import { type CatalogService, type ProvisionOutcome, type Result, fail, ok } from '../catalogService'
import { summarize } from '../analytics'
import type { Db } from './db'
import { createSeed } from './seed'
import { store } from './store'
import { normalizeImages, normalizeVariants, validateBusiness, validateForPublish, validateProductDraft } from '../validation'

export const FAIL_RATE_KEY = 'arfurn:debug:failRate'
/** Demo actor for audit entries (the demo account picker is not authentication). */
const DEMO_ADMIN = { id: 'demo-super-admin', email: 'Demo Super Admin' }
const PAGE_SIZE = 20

function audit(db: Db, e: Omit<AuditEvent, 'id' | 'createdAt' | 'metadata'> & { metadata?: Record<string, unknown> }): void {
  ;(db.audit ??= []).unshift({ id: newId('aud'), createdAt: nowIso(), metadata: {}, ...e })
}

/** Demo mode never sends email: each attempt is logged as blocked ("demo_mode"), so the history stays honest. */
function demoEmail(db: Db, e: Pick<EmailAttempt, 'kind' | 'recipient' | 'subject'> & { applicationId?: ID; businessId?: ID; workflow?: string }): EmailAttempt {
  const prior = (db.emails ?? []).filter((x) => e.workflow && x.workflow === e.workflow).length
  const ts = nowIso()
  const attempt: EmailAttempt = { id: newId('eml'), createdAt: ts, updatedAt: ts, status: 'blocked', error: 'demo_mode', attempt: prior + 1, ...e }
  ;(db.emails ??= []).unshift(attempt)
  return attempt
}

/** Application and/or business scope: with both, entries of either match (an application and the business it created). */
const matchesScope = (e: { applicationId?: ID; businessId?: ID }, q: { applicationId?: ID; businessId?: ID }) =>
  (!q.applicationId && !q.businessId) || (!!q.applicationId && e.applicationId === q.applicationId) || (!!q.businessId && e.businessId === q.businessId)

const page = <T>(items: T[], p = 1, size = PAGE_SIZE) => ({ items: items.slice((p - 1) * size, p * size), total: items.length })
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function failRate(): number {
  try {
    const v = parseFloat(localStorage.getItem(FAIL_RATE_KEY) ?? '0')
    return Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : 0
  } catch {
    return 0
  }
}

async function simulateLatency(): Promise<void> {
  if (import.meta.env.MODE === 'test') return
  await new Promise((r) => setTimeout(r, 150 + Math.random() * 300))
}

const clone = <T>(v: T): T => structuredClone(v)
const nowIso = () => new Date().toISOString()

/** Wraps every call: latency, optional failure injection, catch-all. */
async function run<T>(fn: () => Result<T>, opts: { inject?: boolean } = {}): Promise<Result<T>> {
  try {
    await simulateLatency()
    if (opts.inject !== false && Math.random() < failRate()) {
      return fail('UNKNOWN', 'Simulated network error (failure injection is enabled in Settings → Developer).')
    }
    const result = fn()
    return result.ok ? ok(clone(result.data)) : result
  } catch (err) {
    return fail('UNKNOWN', err instanceof Error ? err.message : 'Unexpected error')
  }
}

function logActivity(db: Db, kind: ActivityKind, message: string, ids: { businessId?: ID; productId?: ID }): void {
  const item: ActivityItem = { id: newId('act'), at: nowIso(), kind, message, ...ids }
  db.activity.unshift(item)
  if (db.activity.length > 200) db.activity.length = 200
}

function toCatalog(db: Db, b: Business): BusinessCatalog {
  const own = db.products.filter((p) => p.businessId === b.id)
  return {
    business: b,
    catalogUrl: catalogPublicUrl(b),
    localPath: catalogLocalPath(b),
    publishedProductCount: own.filter((p) => p.status === 'published').length,
    totalProductCount: own.length,
  }
}

const byUpdatedDesc = (a: { updatedAt: string }, b: { updatedAt: string }) => b.updatedAt.localeCompare(a.updatedAt)

export const mockCatalogService: CatalogService = {
  // ---------------- businesses ----------------
  getBusinesses: () => run(() => ok([...store.get().businesses].sort(byUpdatedDesc))),

  getBusinessById: (id) =>
    run(() => {
      const b = store.get().businesses.find((x) => x.id === id)
      return b ? ok(b) : fail('NOT_FOUND', 'Business not found.')
    }),

  getBusinessBySlug: (slug) =>
    run(() => {
      const b = store.get().businesses.find((x) => x.slug === slug)
      return b ? ok(b) : fail('NOT_FOUND', 'Business not found.')
    }),

  createBusiness: (data) =>
    run(() => {
      const db = store.get()
      const errors = validateBusiness(data, db.businesses)
      if (Object.keys(errors).length) {
        const code = errors.slug?.includes('already') ? 'CONFLICT' : 'VALIDATION'
        return fail(code, 'Please fix the highlighted fields.', errors)
      }
      const ts = nowIso()
      const business: Business = { ...data, name: data.name.trim(), id: newId('biz'), createdAt: ts, updatedAt: ts }
      store.update((d) => {
        d.businesses.push(business)
        logActivity(d, 'business_created', `Business “${business.name}” was created`, { businessId: business.id })
      })
      return ok(business)
    }),

  updateBusiness: (id, data) =>
    run(() => {
      const db = store.get()
      const current = db.businesses.find((b) => b.id === id)
      if (!current) return fail('NOT_FOUND', 'Business not found.')
      const next: Business = { ...current, ...data, contact: { ...current.contact, ...data.contact }, id, updatedAt: nowIso() }
      const errors = validateBusiness(next, db.businesses.filter((b) => b.id !== id))
      if (Object.keys(errors).length) return fail('VALIDATION', 'Please fix the highlighted fields.', errors)
      store.update((d) => {
        d.businesses = d.businesses.map((b) => (b.id === id ? next : b))
        logActivity(d, 'business_updated', `Business “${next.name}” was updated`, { businessId: id })
      })
      return ok(next)
    }),

  setBusinessStatus: (id, status) =>
    run(() => {
      const current = store.get().businesses.find((b) => b.id === id)
      if (!current) return fail('NOT_FOUND', 'Business not found.')
      const next: Business = { ...current, status, updatedAt: nowIso() }
      store.update((d) => {
        d.businesses = d.businesses.map((b) => (b.id === id ? next : b))
        const label = status === 'active' ? 'activated' : status === 'inactive' ? 'deactivated' : 'set to draft'
        logActivity(d, 'business_updated', `Catalog for “${next.name}” was ${label}`, { businessId: id })
      })
      return ok(next)
    }),

  deleteBusiness: (id) =>
    run(() => {
      const current = store.get().businesses.find((b) => b.id === id)
      if (!current) return fail('NOT_FOUND', 'Business not found.')
      store.update((d) => {
        const productIds = new Set(d.products.filter((p) => p.businessId === id).map((p) => p.id))
        d.businesses = d.businesses.filter((b) => b.id !== id)
        d.products = d.products.filter((p) => p.businessId !== id)
        d.dailyStats = d.dailyStats.filter((s) => !productIds.has(s.productId))
        d.events = d.events.filter((e) => !productIds.has(e.productId))
        logActivity(d, 'business_deleted', `Business “${current.name}” and its ${productIds.size} products were deleted`, {})
      })
      return ok(undefined)
    }),

  getCatalog: (slug) =>
    run(() => {
      const db = store.get()
      const b = db.businesses.find((x) => x.slug === slug)
      return b ? ok(toCatalog(db, b)) : fail('NOT_FOUND', 'Catalog not found.')
    }),

  getCatalogs: () =>
    run(() => {
      const db = store.get()
      return ok([...db.businesses].sort((a, b) => a.name.localeCompare(b.name)).map((b) => toCatalog(db, b)))
    }),

  // ---------------- products ----------------
  getProducts: (q = {}) =>
    run(() => {
      const term = q.search?.trim().toLowerCase()
      const list = store
        .get()
        .products.filter((p) => !q.businessId || p.businessId === q.businessId)
        .filter((p) => !q.status || p.status === q.status)
        .filter((p) => !q.category || p.category === q.category)
        .filter((p) => !term || p.name.en.toLowerCase().includes(term) || (p.name.pt ?? '').toLowerCase().includes(term))
        .sort(byUpdatedDesc)
      return ok(list)
    }),

  getProductsByBusiness: (businessId) =>
    run(() => ok(store.get().products.filter((p) => p.businessId === businessId).sort(byUpdatedDesc))),

  getProductById: (id) =>
    run(() => {
      const p = store.get().products.find((x) => x.id === id)
      return p ? ok(p) : fail('NOT_FOUND', 'Product not found.')
    }),

  getPublicProduct: (businessSlug, productSlug, opts) =>
    run(() => {
      const db = store.get()
      const business = db.businesses.find((b) => b.slug === businessSlug)
      if (!business) return fail('NOT_FOUND', 'Catalog not found.')
      const product = db.products.find((p) => p.businessId === business.id && p.slug === productSlug)
      if (!product) return fail('NOT_FOUND', 'Product not found.')
      if (!opts?.allowDraft && (business.status !== 'active' || product.status !== 'published'))
        return fail('NOT_FOUND', 'This product is not available.')
      return ok({ business, product })
    }),

  createProduct: (data) =>
    run(() => {
      const db = store.get()
      const business = db.businesses.find((b) => b.id === data.businessId)
      const siblings = db.products.filter((p) => p.businessId === data.businessId)
      const errors = validateProductDraft(data, siblings)
      if (!business && !errors.businessId) errors.businessId = 'The selected business no longer exists.'
      if (Object.keys(errors).length) {
        const code = errors.slug?.includes('already') ? 'CONFLICT' : 'VALIDATION'
        return fail(code, 'Please fix the highlighted fields.', errors)
      }
      const ts = nowIso()
      const product: Product = {
        ...data,
        images: normalizeImages(data.images),
        variants: normalizeVariants(data.variants),
        id: newId('prd'),
        status: 'draft',
        createdAt: ts,
        updatedAt: ts,
      }
      store.update((d) => {
        d.products.push(product)
        logActivity(d, 'product_created', `Product “${product.name.en}” was added`, { businessId: product.businessId, productId: product.id })
      })
      return ok(product)
    }),

  updateProduct: (id, data) =>
    run(() => {
      const db = store.get()
      const current = db.products.find((p) => p.id === id)
      if (!current) return fail('NOT_FOUND', 'Product not found.')
      const next: Product = { ...current, ...data, id, businessId: current.businessId, status: current.status, updatedAt: nowIso() }
      next.images = normalizeImages(next.images)
      next.variants = normalizeVariants(next.variants)
      const siblings = db.products.filter((p) => p.businessId === current.businessId && p.id !== id)
      const errors = validateProductDraft(next, siblings)
      if (Object.keys(errors).length) return fail('VALIDATION', 'Please fix the highlighted fields.', errors)
      if (next.status === 'published') {
        const pubErrors = validateForPublish(next)
        if (Object.keys(pubErrors).length)
          return fail('VALIDATION', 'This product is published. Unpublish it first or keep the required fields complete.', pubErrors)
      }
      store.update((d) => {
        d.products = d.products.map((p) => (p.id === id ? next : p))
        logActivity(d, 'product_updated', `Product “${next.name.en}” was updated`, { businessId: next.businessId, productId: id })
      })
      return ok(next)
    }),

  duplicateProduct: (id) =>
    run(() => {
      const db = store.get()
      const src = db.products.find((p) => p.id === id)
      if (!src) return fail('NOT_FOUND', 'Product not found.')
      const taken = db.products.filter((p) => p.businessId === src.businessId).map((p) => p.slug)
      const slug = uniqueSlug(`${src.slug}-copy`, taken, PRODUCT_SLUG_MAX)
      const ts = nowIso()
      const copy: Product = {
        ...clone(src),
        id: newId('prd'),
        slug,
        name: { en: `${src.name.en} (copy)`, ...(src.name.pt ? { pt: `${src.name.pt} (cópia)` } : {}) },
        images: src.images.map((img) => ({ ...img, id: newId('img') })),
        // Variant photos and models are copied with the option (same files, new ids).
        variants: clone(src.variants).map((v) => ({ ...v, id: newId('var'), ...(v.images ? { images: v.images.map((img) => ({ ...img, id: newId('img') })) } : {}) })),
        status: 'draft',
        publishedAt: undefined,
        createdAt: ts,
        updatedAt: ts,
      }
      store.update((d) => {
        d.products.push(copy)
        logActivity(d, 'product_created', `Product “${src.name.en}” was duplicated`, { businessId: copy.businessId, productId: copy.id })
      })
      return ok(copy)
    }),

  deleteProduct: (id) =>
    run(() => {
      const current = store.get().products.find((p) => p.id === id)
      if (!current) return fail('NOT_FOUND', 'Product not found.')
      store.update((d) => {
        d.products = d.products.filter((p) => p.id !== id)
        d.dailyStats = d.dailyStats.filter((s) => s.productId !== id)
        d.events = d.events.filter((e) => e.productId !== id)
        logActivity(d, 'product_deleted', `Product “${current.name.en}” was deleted`, { businessId: current.businessId })
      })
      return ok(undefined)
    }),

  publishProduct: (id) =>
    run(() => {
      const current = store.get().products.find((p) => p.id === id)
      if (!current) return fail('NOT_FOUND', 'Product not found.')
      const errors = validateForPublish(current)
      if (Object.keys(errors).length) return fail('VALIDATION', 'This product is missing information required for publishing.', errors)
      const ts = nowIso()
      const next: Product = { ...current, status: 'published', publishedAt: ts, updatedAt: ts }
      store.update((d) => {
        d.products = d.products.map((p) => (p.id === id ? next : p))
        logActivity(d, 'product_published', `Product “${next.name.en}” was published`, { businessId: next.businessId, productId: id })
      })
      return ok(next)
    }),

  unpublishProduct: (id) =>
    run(() => {
      const current = store.get().products.find((p) => p.id === id)
      if (!current) return fail('NOT_FOUND', 'Product not found.')
      const next: Product = { ...current, status: 'draft', updatedAt: nowIso() }
      store.update((d) => {
        d.products = d.products.map((p) => (p.id === id ? next : p))
        logActivity(d, 'product_unpublished', `Product “${next.name.en}” was unpublished`, { businessId: next.businessId, productId: id })
      })
      return ok(next)
    }),

  // ---------------- analytics ----------------
  getAnalytics: () => run(() => ok(summarize(store.get()))),

  getBusinessAnalytics: (businessId) =>
    run(() => {
      if (!store.get().businesses.some((b) => b.id === businessId)) return fail('NOT_FOUND', 'Business not found.')
      return ok(summarize(store.get(), businessId))
    }),

  recordEvent: ({ productId, type }) =>
    run(
      () => {
        const p = store.get().products.find((x) => x.id === productId)
        if (!p) return fail('NOT_FOUND', 'Product not found.')
        store.update((d) => {
          d.events.push({ id: newId('evt'), productId, businessId: p.businessId, type, at: nowIso(), sample: false })
          if (d.events.length > 5000) d.events.splice(0, d.events.length - 5000)
        })
        return ok(undefined)
      },
      { inject: false },
    ),

  getRecentActivity: (opts = {}) =>
    run(() => {
      const items = store.get().activity.filter((a) => !opts.businessId || a.businessId === opts.businessId)
      return ok(items.slice(0, opts.limit ?? 10))
    }),

  // ---------------- owners (demo: invitation state only; there are no real accounts in demo mode) ----------------
  getBusinessMembers: (businessId) =>
    run(() => {
      const o = store.get().owners?.[businessId]
      return ok(o ? [{ userId: `demo-owner-${businessId}`, email: o.email, addedAt: o.invitedAt, invitedAt: o.invitedAt, acceptedAt: o.acceptedAt }] : [])
    }),

  removeBusinessMember: (businessId) =>
    run(() => {
      if (!store.get().owners?.[businessId]) return fail('NOT_FOUND', 'This owner was not found.')
      store.update((d) => {
        delete d.owners![businessId]
        audit(d, { eventType: 'owner_removed', actorId: DEMO_ADMIN.id, businessId })
      })
      return ok(undefined)
    }),

  provisionOwner: ({ businessId, email, applicationId }) =>
    run(() => {
      const db = store.get()
      const business = db.businesses.find((b) => b.id === businessId)
      if (!business) return fail('NOT_FOUND', 'Business not found.')
      const addr = email.trim().toLowerCase()
      if (!EMAIL.test(addr)) return fail('VALIDATION', 'Enter a valid email address.', { email: 'Enter a valid email address.' })
      const existing = db.owners?.[businessId]
      if (existing && existing.email !== addr) return fail('CONFLICT', 'This business already has an owner. Remove them first to invite someone else.')
      if (Object.entries(db.owners ?? {}).some(([id, o]) => id !== businessId && o.email === addr))
        return fail('CONFLICT', 'This email already owns another business. Each owner account manages one business; use a different address.')
      let outcome!: ProvisionOutcome
      store.update((d) => {
        if (!existing) {
          ;(d.owners ??= {})[businessId] = { email: addr, invitedAt: nowIso() }
          audit(d, { eventType: 'owner_provisioned', actorId: DEMO_ADMIN.id, businessId, applicationId })
        }
        const sent = demoEmail(d, {
          kind: existing ? 'invitation_resend' : 'owner_invitation',
          recipient: addr,
          subject: `You're invited to manage ${business.name} on Sanctus`,
          businessId,
          applicationId,
          workflow: `invite:${businessId}`,
        })
        audit(d, { eventType: existing ? 'invitation_resent' : 'invitation_requested', actorId: DEMO_ADMIN.id, businessId, applicationId, metadata: { attempt: sent.attempt, email_status: sent.status } })
        outcome = { owner: existing ? 'already_linked' : 'linked', email: { status: sent.status, error: sent.error, attempt: sent.attempt } }
      })
      return ok(outcome)
    }),

  resendOwnerInvitation: (businessId) =>
    run(() => {
      const db = store.get()
      const business = db.businesses.find((b) => b.id === businessId)
      const owner = db.owners?.[businessId]
      if (!business || !owner) return fail('NOT_FOUND', 'This business has no invited owner yet.')
      if (owner.acceptedAt) return fail('CONFLICT', 'The owner has already accepted the invitation and can sign in.')
      const attempts = (db.emails ?? []).filter((e) => e.workflow === `invite:${businessId}`)
      if (attempts.length >= MAX_INVITATION_ATTEMPTS) return fail('RATE_LIMITED', 'Too many invitations were sent for this business. Contact the owner directly.')
      const last = attempts[0]
      if (last && Date.now() - Date.parse(last.createdAt) < RESEND_COOLDOWN_SECONDS * 1000)
        return fail('RATE_LIMITED', `Wait ${RESEND_COOLDOWN_SECONDS} seconds between invitations.`)
      let outcome!: ProvisionOutcome
      store.update((d) => {
        const sent = demoEmail(d, { kind: 'invitation_resend', recipient: owner.email, subject: `New invitation link for ${business.name}`, businessId, workflow: `invite:${businessId}` })
        audit(d, { eventType: 'invitation_resent', actorId: DEMO_ADMIN.id, businessId, metadata: { attempt: sent.attempt, email_status: sent.status } })
        outcome = { owner: 'already_linked', email: { status: sent.status, error: sent.error, attempt: sent.attempt } }
      })
      return ok(outcome)
    }),

  // ---------------- business applications ----------------
  submitApplication: (input) =>
    run(() => {
      const v = validateApplication(input)
      if (!v.ok) return fail('VALIDATION', 'Please fix the highlighted fields.', v.errors)
      const a = v.value
      const db = store.get()
      const dup = (db.applications ?? []).find((x) => (x as BusinessApplication & { submissionKey?: string }).submissionKey === a.submissionKey)
      if (dup) return ok({ id: dup.id, reference: dup.reference })
      const open = (db.applications ?? []).find(
        (x) => (x.status === 'submitted' || x.status === 'under_review') && x.applicantEmail.toLowerCase() === a.applicantEmail.toLowerCase() && x.businessName.toLowerCase() === a.businessName.toLowerCase(),
      )
      if (open) return fail('CONFLICT', 'An application for this business from this email is already being reviewed.')
      const ts = nowIso()
      const app: BusinessApplication & { submissionKey: string } = {
        id: newId('app'),
        reference: Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(8, '0'),
        status: 'submitted',
        businessName: a.businessName,
        applicantName: a.applicantName,
        applicantEmail: a.applicantEmail,
        applicantPhone: a.applicantPhone ?? undefined,
        website: a.website ?? undefined,
        country: a.country,
        city: a.city,
        category: a.category,
        language: a.language,
        answers: {
          description: a.description,
          applicantRole: a.applicantRole ?? undefined,
          productCount: a.productCount,
          photoReadiness: a.photoReadiness,
          modelReadiness: a.modelReadiness,
          notes: a.notes ?? undefined,
        },
        submissionKey: a.submissionKey,
        createdAt: ts,
        updatedAt: ts,
      }
      store.update((d) => {
        ;(d.applications ??= []).unshift(app)
        audit(d, { eventType: 'application_submitted', applicationId: app.id, toStatus: 'submitted' })
        demoEmail(d, { kind: 'application_confirmation', recipient: app.applicantEmail, subject: 'We received your application', applicationId: app.id, workflow: `application:${app.id}:confirmation` })
        demoEmail(d, { kind: 'admin_notification', recipient: 'platform admins', subject: `New business awaiting review: ${app.businessName}`, applicationId: app.id, workflow: `application:${app.id}:admin_notification` })
      })
      return ok({ id: app.id, reference: app.reference })
    }),

  getApplications: (q = {}) =>
    run(() => {
      const term = q.search?.trim().toLowerCase()
      const list = (store.get().applications ?? [])
        .filter((a) => !q.status || a.status === q.status)
        .filter((a) => !q.from || a.createdAt >= localDayBounds(q.from).start)
        .filter((a) => !q.to || a.createdAt < localDayBounds(q.to).end)
        .filter((a) => !term || [a.businessName, a.applicantName, a.applicantEmail, a.reference, a.id].some((f) => f.toLowerCase().includes(term)))
      return ok(page(list, q.page, q.pageSize))
    }),

  getApplication: (id) =>
    run(() => {
      const a = store.get().applications?.find((x) => x.id === id)
      return a ? ok(a) : fail('NOT_FOUND', 'Application not found.')
    }),

  reviewApplication: (id, action, reason) =>
    run(() => {
      const db = store.get()
      const current = db.applications?.find((x) => x.id === id)
      if (!current) return fail('NOT_FOUND', 'Application not found.')
      const t = applyReview(current.status, action, reason)
      if (!t.ok)
        return t.reason === 'reason_required'
          ? fail('VALIDATION', 'Give a reason for the rejection.', { reason: 'Give a reason for the rejection.' })
          : fail('CONFLICT', 'This application can no longer change to that status.')
      if (t.noop) return ok(current)
      let next!: BusinessApplication
      store.update((d) => {
        let businessId = current.businessId
        if (t.status === 'approved') {
          const ts = nowIso()
          const business: Business = {
            id: newId('biz'),
            name: current.businessName,
            slug: uniqueSlug(slugify(current.businessName), d.businesses.map((b) => b.slug), 55),
            description: current.answers.description ?? '',
            contact: {},
            status: 'draft',
            branding: { accentColor: '#7A5C45' },
            defaultCurrency: 'EUR',
            createdAt: ts,
            updatedAt: ts,
          }
          d.businesses.push(business)
          businessId = business.id
          logActivity(d, 'business_created', `Business “${business.name}” was created from an approved application`, { businessId })
          audit(d, { eventType: 'business_created', actorId: DEMO_ADMIN.id, applicationId: id, businessId, metadata: { source: 'application' } })
        }
        const decided = t.status === 'approved' || t.status === 'rejected'
        next = {
          ...current,
          status: t.status,
          businessId,
          reviewedBy: DEMO_ADMIN.id,
          reviewedAt: nowIso(),
          updatedAt: nowIso(),
          decisionReason: decided ? reason?.trim() || undefined : current.decisionReason,
        }
        d.applications = d.applications!.map((a) => (a.id === id ? next : a))
        audit(d, {
          eventType: 'application_status_changed',
          actorId: DEMO_ADMIN.id,
          applicationId: id,
          businessId,
          fromStatus: current.status,
          toStatus: t.status,
          metadata: reason?.trim() ? { reason: reason.trim() } : {},
        })
      })
      return ok(next)
    }),

  getAuditEvents: (q = {}) =>
    run(() => {
      const term = q.search?.trim().toLowerCase().replace(/\s+/g, '_')
      const list = (store.get().audit ?? [])
        .filter((e) => matchesScope(e, q))
        .filter((e) => !term || e.eventType.includes(term))
        .map((e) => ({ ...e, actorEmail: e.actorId === DEMO_ADMIN.id ? DEMO_ADMIN.email : undefined }))
      return ok(page(list, q.page, q.pageSize))
    }),

  getEmailAttempts: (q) =>
    run(() => ok((store.get().emails ?? []).filter((e) => matchesScope(e, q)))),

  // Images become data URLs stored with the demo data; 3D files are session-only blob URLs (ADR-0007).
  uploadAsset: async ({ kind, file }) => {
    if (kind === 'glb' || kind === 'usdz') {
      const asset = createSessionModelAsset(file, kind)
      return ok({ url: asset.url, status: asset.status })
    }
    const res = await imageToPersistableDataUrl(file, kind === 'logo' ? 512 : 1600)
    return res.ok ? ok({ url: res.url, status: 'valid' }) : fail('STORAGE', res.message)
  },

  subscribe: (listener) => store.subscribe(listener),

  resetDemoData: () =>
    run(
      () => {
        store.replace(createSeed())
        return ok(undefined)
      },
      { inject: false },
    ),
}
