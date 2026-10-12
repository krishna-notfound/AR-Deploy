// Mock implementation of CatalogService. Simulates latency, never throws, returns copies.
// Demo persistence only (localStorage). NOT a backend.
import type { ActivityItem, ActivityKind, Business, BusinessCatalog, ID, Product } from '@/domain/types'
import { createSessionModelAsset, imageToPersistableDataUrl } from '@/lib/files'
import { newId } from '@/lib/id'
import { uniqueSlug } from '@/lib/slug'
import { catalogLocalPath, catalogPublicUrl } from '@/lib/urls'
import { type CatalogService, type Result, fail, ok } from '../catalogService'
import { summarize } from '../analytics'
import type { Db } from './db'
import { createSeed } from './seed'
import { store } from './store'
import { normalizeImages, validateBusiness, validateForPublish, validateProductDraft } from '../validation'

export const FAIL_RATE_KEY = 'arfurn:debug:failRate'

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
      const slug = uniqueSlug(`${src.slug}-copy`, taken).slice(0, 70)
      const ts = nowIso()
      const copy: Product = {
        ...clone(src),
        id: newId('prd'),
        slug,
        name: { en: `${src.name.en} (copy)`, ...(src.name.pt ? { pt: `${src.name.pt} (cópia)` } : {}) },
        images: src.images.map((img) => ({ ...img, id: newId('img') })),
        variants: src.variants.map((v) => ({ ...v, id: newId('var') })),
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
