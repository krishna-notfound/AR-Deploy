// Mock implementation of CatalogService. Simulates latency, never throws, returns copies.
// Demo persistence only (localStorage). NOT a backend.
import type { ApplicationDuplicates, AuditEvent, Business, BusinessApplication, BusinessCatalog, EmailAttempt, ID, Product, ReviewedApplication } from '@/domain/types'
import { createSessionModelAsset, imageToPersistableDataUrl } from '@/lib/files'
import { localDayBounds } from '@/lib/format'
import { newId } from '@/lib/id'
import { PRODUCT_SLUG_MAX, slugify, uniqueSlug } from '@/lib/slug'
import { catalogLocalPath, catalogPublicUrl } from '@/lib/urls'
import { validateApplication } from '../../../supabase/functions/_shared/application.ts'
import { MAX_INVITATION_ATTEMPTS, REASON_MAX_LENGTH, RESEND_COOLDOWN_SECONDS, applyReview, normalizeBusinessName } from '../applicationRules'
import { CLOSURE_PENDING_ERROR, type CatalogService, REOPEN_NOT_ALLOWED_ERROR, type ProvisionOutcome, type Result, fail, ok } from '../catalogService'
import { deriveActivity, deviceTimeZone, summarize } from '../analytics'
import type { Db } from './db'
import { mockClosureOpen, voidMockClosure } from './mockAccount'
import { createMockTeam, demoPlatformRole } from './mockTeam'
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
function demoEmail(db: Db, e: Pick<EmailAttempt, 'kind' | 'recipient' | 'subject'> & { applicationId?: ID; businessId?: ID; workflow?: string; attempt?: number }): EmailAttempt {
  const prior = (db.emails ?? []).filter((x) => e.workflow && x.workflow === e.workflow).length
  const ts = nowIso()
  const attempt: EmailAttempt = { id: newId('eml'), createdAt: ts, updatedAt: ts, status: 'blocked', error: 'demo_mode', attempt: prior + 1, ...e }
  ;(db.emails ??= []).unshift(attempt)
  return attempt
}

/**
 * The owner-invitation reservation, as service_reserve_owner_invite (S1.5 R-W2-4): `cooldown` while a non-blocked
 * attempt for the business is under 60 s old; `too_many_invitations` at 10 non-blocked attempts for the business and
 * recipient in 24 h; otherwise the next attempt number (continuing the logged invitation emails).
 */
function reserveDemoInvite(db: Db, businessId: ID, recipient: string): { attempt: number } | { refusal: Result<never> } {
  const now = Date.now()
  const counted = (db.ownerInviteAttempts ?? []).filter((a) => a.businessId === businessId && a.outcome !== 'blocked')
  const last = counted.reduce((max, a) => Math.max(max, Date.parse(a.createdAt)), 0)
  if (last && now - last < RESEND_COOLDOWN_SECONDS * 1000)
    return { refusal: { ok: false, error: { code: 'RATE_LIMITED', message: 'Wait a minute between invitations.', reason: 'cooldown', retryAt: new Date(last + RESEND_COOLDOWN_SECONDS * 1000).toISOString() } } }
  const window = counted
    .filter((a) => a.recipient === recipient && now - Date.parse(a.createdAt) < 24 * 3600 * 1000)
    .map((a) => Date.parse(a.createdAt))
    .sort((a, b) => a - b)
  if (window.length >= MAX_INVITATION_ATTEMPTS) {
    const retryAt = new Date(window[window.length - MAX_INVITATION_ATTEMPTS]! + 24 * 3600 * 1000).toISOString()
    return { refusal: { ok: false, error: { code: 'RATE_LIMITED', message: 'Ten invitations were sent to this owner in the last 24 hours.', reason: 'too_many_invitations', retryAt } } }
  }
  const numbers = [
    ...(db.ownerInviteAttempts ?? []).filter((a) => a.businessId === businessId).map((a) => a.attempt),
    ...(db.emails ?? []).filter((e) => e.workflow === `invite:${businessId}`).map((e) => e.attempt),
  ]
  return { attempt: 1 + Math.max(0, ...numbers) }
}

/**
 * Records a reserved attempt. Demo mode never sends email (the log says blocked, "demo_mode"), but the attempt counts
 * as accepted, so the cooldown and the limit behave as they do on the server.
 */
function recordDemoInvite(db: Db, businessId: ID, recipient: string, attempt: number): void {
  ;(db.ownerInviteAttempts ??= []).unshift({ businessId, recipient, attempt, outcome: 'accepted', createdAt: nowIso() })
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

/** The demo actor of a change: the platform user, or no one for a business owner (there are no owner accounts in demo). */
const demoActor = () => (demoPlatformRole() ? DEMO_ADMIN.id : undefined)

/** The rows the Supabase audit triggers write for a product and a catalog status change (R-W5-5), mirrored here. */
function auditProduct(db: Db, eventType: string, p: Product, extra: { fromStatus?: string; toStatus?: string; metadata?: Record<string, unknown> } = {}): void {
  audit(db, { eventType, actorId: demoActor(), businessId: p.businessId, ...(extra.fromStatus ? { fromStatus: extra.fromStatus, toStatus: extra.toStatus } : {}), metadata: { product_id: p.id, name: p.name.en, ...extra.metadata } })
}
function auditCatalogStatus(db: Db, from: Business, to: Business): void {
  if (from.status !== to.status) audit(db, { eventType: 'business_status_changed', actorId: demoActor(), businessId: to.id, fromStatus: from.status, toStatus: to.status })
}

/** What business owners read of their business's history (the R-W7-2 policy). */
const OWNER_READS = new Set(['business_status_changed', 'business_slug_changed', 'product_created', 'product_published', 'product_unpublished', 'product_slug_changed', 'product_deleted', 'account_closure_voided'])

/** Whether the demo viewer reads an activity row, as the audit_events policies decide in Supabase mode (R-W5-5). */
function demoReadsActivity(db: Db, e: AuditEvent): boolean {
  const role = demoPlatformRole()
  if (!role) return OWNER_READS.has(e.eventType)
  if (role === 'owner') return true
  const perms: readonly string[] = db.team?.rolePermissions[role] ?? []
  if (perms.includes('records.view')) return true
  return e.eventType.startsWith('product_') ? perms.includes('products.view') : perms.includes('businesses.view')
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
  ...createMockTeam(run),

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
      // The form's status field meets the same database guard as setBusinessStatus (R-W1-3).
      if (next.status === 'active' && current.status !== 'active' && mockClosureOpen(id)) return { ok: false, error: CLOSURE_PENDING_ERROR }
      store.update((d) => {
        d.businesses = d.businesses.map((b) => (b.id === id ? next : b))
        auditCatalogStatus(d, current, next)
      })
      return ok(next)
    }),

  setBusinessStatus: (id, status) =>
    run(() => {
      const current = store.get().businesses.find((b) => b.id === id)
      if (!current) return fail('NOT_FOUND', 'Business not found.')
      // As the database guard (R-W1-3): no activation while the owner's closure request is open, the Owner included.
      if (status === 'active' && current.status !== 'active' && mockClosureOpen(id)) return { ok: false, error: CLOSURE_PENDING_ERROR }
      const next: Business = { ...current, status, updatedAt: nowIso() }
      store.update((d) => {
        d.businesses = d.businesses.map((b) => (b.id === id ? next : b))
        auditCatalogStatus(d, current, next)
      })
      return ok(next)
    }),

  deleteBusiness: (id) =>
    run(() => {
      const current = store.get().businesses.find((b) => b.id === id)
      if (!current) return fail('NOT_FOUND', 'Business not found.')
      store.update((d) => {
        d.businesses = d.businesses.filter((b) => b.id !== id)
        d.products = d.products.filter((p) => p.businessId !== id)
        d.dailyStats = d.dailyStats.filter((s) => s.businessId !== id)
        d.events = d.events.filter((e) => e.businessId !== id)
        // R-W2-2 / R-W8-2: the application that created it remembers the deletion, so it can be reopened.
        const deletedAt = nowIso()
        d.applications = d.applications?.map((a) => (a.businessId === id ? { ...a, businessId: undefined, businessDeletedAt: deletedAt } : a))
        // As the business trigger: one business_deleted row; the products deleted with it write none.
        audit(d, { eventType: 'business_deleted', actorId: demoActor(), metadata: { business_id: id, name: current.name } })
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
        auditProduct(d, 'product_created', product)
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
        if (next.slug !== current.slug) auditProduct(d, 'product_slug_changed', next, { metadata: { from: current.slug, to: next.slug } })
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
        auditProduct(d, 'product_created', copy)
      })
      return ok(copy)
    }),

  deleteProduct: (id) =>
    run(() => {
      const current = store.get().products.find((p) => p.id === id)
      if (!current) return fail('NOT_FOUND', 'Product not found.')
      store.update((d) => {
        d.products = d.products.filter((p) => p.id !== id)
        // Its history stays in the business totals as "Deleted product" (R-W5-4).
        d.dailyStats = d.dailyStats.map((s) => (s.productId === id ? { ...s, productId: null } : s))
        d.events = d.events.map((e) => (e.productId === id ? { ...e, productId: null } : e))
        auditProduct(d, 'product_deleted', current)
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
        if (current.status !== 'published') auditProduct(d, 'product_published', next, { fromStatus: current.status, toStatus: 'published' })
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
        if (current.status !== 'draft') auditProduct(d, 'product_unpublished', next, { fromStatus: current.status, toStatus: 'draft' })
      })
      return ok(next)
    }),

  // ---------------- analytics ----------------
  getAnalytics: (opts) => run(() => ok(summarize(store.get(), undefined, new Date(), true, opts?.timeZone ?? deviceTimeZone()))),

  getBusinessAnalytics: (businessId, opts) =>
    run(() => {
      if (!store.get().businesses.some((b) => b.id === businessId)) return fail('NOT_FOUND', 'Business not found.')
      return ok(summarize(store.get(), businessId, new Date(), true, opts?.timeZone ?? deviceTimeZone()))
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
      const db = store.get()
      const rows = (db.audit ?? []).filter((e) => (!opts.businessId || e.businessId === opts.businessId) && demoReadsActivity(db, e))
      return ok(deriveActivity(rows, new Map(db.businesses.map((b) => [b.id, b.name]))).slice(0, opts.limit ?? 10))
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
        // As the database trigger (R-W1-2): the owner's closure request ends with their membership; the status stays.
        for (const subject of voidMockClosure(businessId))
          audit(d, { eventType: 'account_closure_voided', actorId: DEMO_ADMIN.id, businessId, metadata: { subject_id: subject, business_id: businessId, reason: 'owner_removed' } })
      })
      return ok(undefined)
    }),

  provisionOwner: ({ businessId, email, language, applicationId }) => {
    // R-W8-1: inviting the current owner again is a resend, with its cooldown, limit and already_accepted.
    if (store.get().owners?.[businessId]?.email === email.trim().toLowerCase()) return mockCatalogService.resendOwnerInvitation(businessId, language)
    return run(() => {
      const db = store.get()
      const business = db.businesses.find((b) => b.id === businessId)
      if (!business) return fail('NOT_FOUND', 'Business not found.')
      const addr = email.trim().toLowerCase()
      if (!EMAIL.test(addr)) return fail('VALIDATION', 'Enter a valid email address.', { email: 'Enter a valid email address.' })
      if (db.owners?.[businessId]) return fail('CONFLICT', 'This business already has an owner. Remove them first to invite someone else.')
      if (Object.entries(db.owners ?? {}).some(([id, o]) => id !== businessId && o.email === addr))
        return fail('CONFLICT', 'This email already owns another business. Each owner account manages one business; use a different address.')
      const reserved = reserveDemoInvite(db, businessId, addr)
      if ('refusal' in reserved) return reserved.refusal
      let outcome!: ProvisionOutcome
      store.update((d) => {
        ;(d.owners ??= {})[businessId] = { email: addr, invitedAt: nowIso() }
        audit(d, { eventType: 'owner_provisioned', actorId: DEMO_ADMIN.id, businessId, applicationId })
        recordDemoInvite(d, businessId, addr, reserved.attempt)
        const sent = demoEmail(d, {
          kind: 'owner_invitation',
          recipient: addr,
          subject: `You're invited to manage ${business.name} on Sanctus`,
          businessId,
          applicationId,
          workflow: `invite:${businessId}`,
          attempt: reserved.attempt,
        })
        audit(d, { eventType: 'invitation_requested', actorId: DEMO_ADMIN.id, businessId, applicationId, metadata: { attempt: sent.attempt, email_status: sent.status } })
        outcome = { owner: 'linked', email: { status: sent.status, error: sent.error, attempt: sent.attempt } }
      })
      return ok(outcome)
    })
  },

  resendOwnerInvitation: (businessId) =>
    run(() => {
      const db = store.get()
      const business = db.businesses.find((b) => b.id === businessId)
      const owner = db.owners?.[businessId]
      if (!business || !owner) return fail('NOT_FOUND', 'This business has no invited owner yet.')
      if (owner.acceptedAt) return { ok: false, error: { code: 'CONFLICT', message: 'The owner has already accepted the invitation and can sign in.', reason: 'already_accepted' } }
      const reserved = reserveDemoInvite(db, businessId, owner.email)
      if ('refusal' in reserved) return reserved.refusal
      let outcome!: ProvisionOutcome
      store.update((d) => {
        recordDemoInvite(d, businessId, owner.email, reserved.attempt)
        const sent = demoEmail(d, { kind: 'invitation_resend', recipient: owner.email, subject: `New invitation link for ${business.name}`, businessId, workflow: `invite:${businessId}`, attempt: reserved.attempt })
        audit(d, { eventType: 'invitation_resent', actorId: DEMO_ADMIN.id, businessId, metadata: { attempt: sent.attempt, email_status: sent.status } })
        outcome = { owner: 'already_linked', email: { status: sent.status, error: sent.error, attempt: sent.attempt } }
      })
      return ok(outcome)
    }),

  getOwnerStates: () =>
    run(() => {
      const db = store.get()
      // As admin_list_owner_states: the newest attempt decides (its outcome, or its email bounced or was a complaint);
      // with no attempt, the newest invitation email.
      return ok(
        db.businesses.map((b) => {
          const owner = db.owners?.[b.id]
          const attempt = (db.ownerInviteAttempts ?? []).filter((a) => a.businessId === b.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0]
          const emails = (db.emails ?? []).filter((e) => e.workflow === `invite:${b.id}`).sort((x, y) => y.createdAt.localeCompare(x.createdAt))
          const attemptEmail = attempt && emails.find((e) => e.attempt === attempt.attempt)
          const emailFailed = attempt
            ? attempt.outcome === 'failed' || attempt.outcome === 'blocked' || attemptEmail?.status === 'bounced' || attemptEmail?.status === 'complained'
            : !!emails[0] && ['failed', 'blocked', 'bounced', 'complained'].includes(emails[0].status)
          return {
            businessId: b.id,
            state: !owner ? ('needs_owner' as const) : owner.acceptedAt ? ('owner_active' as const) : ('invite_pending' as const),
            lastInvitedAt: attempt?.createdAt ?? emails[0]?.createdAt ?? null,
            emailFailed,
          }
        }),
      )
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
      if ([...(reason?.trim() ?? '')].length > REASON_MAX_LENGTH)
        return fail('VALIDATION', 'Check the details and try again.', { reason: `Keep the reason to ${REASON_MAX_LENGTH.toLocaleString('en')} characters or fewer.` })
      const t = applyReview(current.status, action, reason, { businessId: current.businessId })
      if (!t.ok)
        return t.reason === 'reason_required'
          ? fail('VALIDATION', 'Give a reason for the rejection.', { reason: 'Give a reason for the rejection.' })
          : t.reason === 'reopen_not_allowed'
            ? { ok: false, error: REOPEN_NOT_ALLOWED_ERROR }
            : fail('CONFLICT', 'This application can no longer change to that status.')
      if (t.noop) return ok(current)
      let next!: ReviewedApplication
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
          metadata: action === 'reopen' ? { action: 'reopen' } : reason?.trim() ? { reason: reason.trim() } : {},
        })
        // R-W2-1: a rejection emails the applicant in their language (the reason only when ticked). Demo mode records
        // the attempt as not sent; nothing leaves the browser.
        if (t.status === 'rejected') {
          const subject = current.language === 'pt' ? `A sua candidatura à Sanctus para ${current.businessName}` : `Your Sanctus application for ${current.businessName}`
          const sent = demoEmail(d, { kind: 'application_decision', recipient: current.applicantEmail, subject, applicationId: id, workflow: `application:${id}:decision` })
          next = { ...next, decisionEmail: { status: sent.status, error: sent.error } }
        }
      })
      return ok(next)
    }),

  // R-W2-9: the same rule as admin_application_duplicates. Demo owners have no login, so the invited owner email
  // stands in for the owner's sign-in email.
  getApplicationDuplicates: (id) =>
    run(() => {
      const db = store.get()
      const current = db.applications?.find((x) => x.id === id)
      if (!current) return fail('NOT_FOUND', 'Application not found.')
      const email = current.applicantEmail.toLowerCase()
      const name = normalizeBusinessName(current.businessName)
      const sameName = (n: string) => name !== '' && normalizeBusinessName(n) === name
      const newest = <T extends { createdAt: string; id: string }>(a: T, b: T) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
      const applications: ApplicationDuplicates['applications'] = (db.applications ?? [])
        .filter((a) => a.id !== id && a.status !== 'rejected')
        .map((a) => ({ a, byEmail: a.applicantEmail.toLowerCase() === email, byName: sameName(a.businessName) }))
        .filter((m) => m.byEmail || m.byName)
        .sort((x, y) => newest(x.a, y.a))
        .slice(0, 10)
        .map(({ a, byEmail, byName }) => ({
          id: a.id, reference: a.reference, businessName: a.businessName, status: a.status, createdAt: a.createdAt,
          match: byEmail && byName ? 'both' : byEmail ? 'email' : 'name',
        }))
      const businesses: ApplicationDuplicates['businesses'] = db.businesses
        .filter((b) => b.id !== current.businessId)
        .map((b) => ({ b, byOwner: db.owners?.[b.id]?.email.toLowerCase() === email, byName: sameName(b.name) }))
        .filter((m) => m.byOwner || m.byName)
        .sort((x, y) => newest(x.b, y.b))
        .slice(0, 10)
        .map(({ b, byOwner, byName }) => ({ id: b.id, name: b.name, status: b.status, match: byOwner && byName ? 'both' : byOwner ? 'owner_email' : 'name' }))
      return ok({ applications, businesses })
    }),

  getAuditEvents: (q = {}) =>
    run(() => {
      const term = q.search?.trim().toLowerCase().replace(/\s+/g, '_')
      const list = (store.get().audit ?? [])
        .filter((e) => matchesScope(e, q))
        .filter((e) => !term || e.eventType.includes(term))
        .filter((e) => q.includeSignIns === true || e.eventType !== 'account_signed_in')
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
