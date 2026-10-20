import { beforeEach, describe, expect, it } from 'vitest'
import type { Product } from '@/domain/types'
import type { ProductInput, Result } from '../catalogService'
import { isValidDb } from './db'
import { mockCatalogService as svc } from './mockCatalogService'
import { createSeed } from './seed'
import { DB_KEY, store } from './store'

function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message} ${JSON.stringify(r.error.fieldErrors ?? {})}`)
  return r.data
}

function draftInput(over: Partial<ProductInput> = {}): ProductInput {
  return {
    businessId: 'biz_casa',
    slug: 'test-chair',
    name: { en: 'Test Chair' },
    shortDescription: { en: '' },
    description: { en: '' },
    category: 'chair',
    price: 10000,
    currency: 'EUR',
    images: [],
    models: {},
    dimensions: { width: 50, height: 80, depth: 50, unit: 'cm' },
    material: { en: 'Oak' },
    variants: [],
    cta: { label: { en: 'Contact seller' } },
    ...over,
  }
}

beforeEach(async () => {
  localStorage.clear()
  await svc.resetDemoData()
})

describe('seed', () => {
  it('is a valid db with the expected shape', () => {
    const seed = createSeed()
    expect(isValidDb(seed)).toBe(true)
    expect(seed.businesses).toHaveLength(4)
    expect(seed.businesses.filter((b) => b.status === 'inactive')).toHaveLength(1)
    expect(seed.products.length).toBeGreaterThanOrEqual(20)
    expect(seed.products.some((p) => !p.models.glb)).toBe(true)
    expect(seed.products.some((p) => p.models.glb?.url.includes('DoesNotExist'))).toBe(true)
    expect(seed.products.some((p) => p.name.pt === undefined)).toBe(true)
  })
})

describe('businesses', () => {
  it('creates, rejects duplicate slugs and cascades deletes', async () => {
    const created = unwrap(
      await svc.createBusiness({
        name: 'Test Studio',
        slug: 'test-studio',
        description: '',
        contact: { email: 'a@b.co' },
        status: 'draft',
        branding: { accentColor: '#334455' },
        defaultCurrency: 'EUR',
      }),
    )
    const dup = await svc.createBusiness({ ...created, name: 'Other' })
    expect(dup.ok).toBe(false)
    if (!dup.ok) expect(dup.error.code).toBe('CONFLICT')

    const before = unwrap(await svc.getProductsByBusiness('biz_casa')).length
    expect(before).toBeGreaterThan(0)
    unwrap(await svc.deleteBusiness('biz_casa'))
    expect(unwrap(await svc.getProductsByBusiness('biz_casa'))).toHaveLength(0)
    expect((await svc.getBusinessById('biz_casa')).ok).toBe(false)
  })

  it('validates email and website', async () => {
    const r = await svc.updateBusiness('biz_casa', { contact: { email: 'nope', website: 'ftp://x' } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.error.fieldErrors ?? {})).toEqual(expect.arrayContaining(['contact.email', 'contact.website']))
  })

  it('toggles catalog status and hides inactive catalogs publicly', async () => {
    unwrap(await svc.setBusinessStatus('biz_casa', 'inactive'))
    const r = await svc.getPublicProduct('casa-lisboa', 'glam-velvet-sofa')
    expect(r.ok).toBe(false)
    expect((await svc.getPublicProduct('casa-lisboa', 'glam-velvet-sofa', { allowDraft: true })).ok).toBe(true)
  })
})

describe('products', () => {
  it('creates drafts and enforces unique slugs per business', async () => {
    const p = unwrap(await svc.createProduct(draftInput()))
    expect(p.status).toBe('draft')
    const again = await svc.createProduct(draftInput())
    expect(again.ok).toBe(false)
    // same slug in another business is fine
    expect((await svc.createProduct(draftInput({ businessId: 'biz_nord' }))).ok).toBe(true)
  })

  it('blocks publishing without an image, then publishes', async () => {
    const p = unwrap(await svc.createProduct(draftInput()))
    const blocked = await svc.publishProduct(p.id)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.error.fieldErrors?.images).toBeDefined()
    unwrap(await svc.updateProduct(p.id, { images: [{ id: 'i1', url: 'https://x/y.jpg', isPrimary: false, kind: 'gallery' }] }))
    const published = unwrap(await svc.publishProduct(p.id))
    expect(published.status).toBe('published')
    expect(published.publishedAt).toBeDefined()
    expect(published.images[0]?.isPrimary).toBe(true)
    const unpublished = unwrap(await svc.unpublishProduct(p.id))
    expect(unpublished.status).toBe('draft')
  })

  it('duplicates with a unique slug as a draft', async () => {
    const a = unwrap(await svc.duplicateProduct('prd_glam_sofa'))
    const b = unwrap(await svc.duplicateProduct('prd_glam_sofa'))
    expect(a.slug).toBe('glam-velvet-sofa-copy')
    expect(b.slug).toBe('glam-velvet-sofa-copy-2')
    expect(a.status).toBe('draft')
    expect(a.name.en).toContain('(copy)')
    expect(a.images[0]?.id).not.toBe(b.images[0]?.id)
  })

  it('filters by business, status and search', async () => {
    const all = unwrap(await svc.getProducts())
    const nord = unwrap(await svc.getProducts({ businessId: 'biz_nord' }))
    const drafts = unwrap(await svc.getProducts({ status: 'draft' }))
    const search = unwrap(await svc.getProducts({ search: 'sofa' }))
    expect(nord.every((p: Product) => p.businessId === 'biz_nord')).toBe(true)
    expect(drafts.every((p: Product) => p.status === 'draft')).toBe(true)
    expect(search.length).toBeGreaterThan(0)
    expect(nord.length).toBeLessThan(all.length)
  })

  it('deletes products', async () => {
    unwrap(await svc.deleteProduct('prd_bed'))
    expect((await svc.getProductById('prd_bed')).ok).toBe(false)
  })
})

describe('analytics', () => {
  it('aggregates totals and records live events', async () => {
    const before = unwrap(await svc.getAnalytics())
    expect(before.isSample).toBe(true)
    expect(before.series).toHaveLength(30)
    expect(before.totals.views).toBeGreaterThan(0)
    unwrap(await svc.recordEvent({ productId: 'prd_glam_sofa', businessId: 'biz_casa', type: 'view' }))
    unwrap(await svc.recordEvent({ productId: 'prd_glam_sofa', businessId: 'biz_casa', type: 'ar_activation' }))
    const after = unwrap(await svc.getAnalytics())
    expect(after.totals.views).toBe(before.totals.views + 1)
    expect(after.totals.arActivations).toBe(before.totals.arActivations + 1)
  })

  it('scopes business analytics', async () => {
    const nord = unwrap(await svc.getBusinessAnalytics('biz_nord'))
    expect(nord.totals.businesses).toBe(1)
    expect(nord.byProduct.every((p) => p.businessId === 'biz_nord')).toBe(true)
  })
})

describe('persistence', () => {
  it('round-trips through localStorage', async () => {
    unwrap(await svc.updateBusiness('biz_casa', { name: 'Casa Renamed' }))
    store.flush()
    const raw = localStorage.getItem(DB_KEY)
    expect(raw).toBeTruthy()
    const parsed: unknown = JSON.parse(raw!)
    expect(isValidDb(parsed)).toBe(true)
    expect(raw).toContain('Casa Renamed')
  })

  it('rejects corrupt payloads', () => {
    expect(isValidDb({ schemaVersion: 1, businesses: [{ id: 1 }], products: [], events: [], dailyStats: [], activity: [] })).toBe(false)
    expect(isValidDb(null)).toBe(false)
    expect(isValidDb({ ...createSeed(), schemaVersion: 99 })).toBe(false)
  })
})

describe('business applications and owner access (demo, ADR-0024)', () => {
  const application = (over: Record<string, unknown> = {}) => ({
    businessName: 'Atelier Norte',
    website: 'atelier-norte.example',
    description: 'Solid oak furniture made in Porto.',
    category: 'furniture',
    country: 'Portugal',
    city: 'Porto',
    applicantName: 'Rita Sousa',
    applicantRole: '',
    applicantEmail: 'rita@atelier.test',
    applicantPhone: '',
    language: 'pt' as const,
    productCount: '11-50',
    photoReadiness: 'all',
    modelReadiness: 'none',
    notes: '',
    consent: true,
    submissionKey: crypto.randomUUID(),
    ...over,
  })

  it('validates with the shared rules and stores nothing on error', async () => {
    const r = await svc.submitApplication(application({ applicantEmail: 'x', consent: false }))
    expect(r.ok === false && r.error.fieldErrors).toEqual({ applicantEmail: 'invalid_email', consent: 'consent_required' })
    expect(unwrap(await svc.getApplications()).total).toBe(0)
  })

  it('is idempotent per submission key and refuses a second open application', async () => {
    const input = application()
    const a = unwrap(await svc.submitApplication(input))
    expect(unwrap(await svc.submitApplication(input))).toEqual(a)
    const dup = await svc.submitApplication(application({ businessName: 'ATELIER NORTE' }))
    expect(dup.ok === false && dup.error.code).toBe('CONFLICT')
    expect(unwrap(await svc.getApplications()).total).toBe(1)
    const emails = unwrap(await svc.getEmailAttempts({ applicationId: a.id }))
    expect(emails.map((e) => [e.kind, e.status])).toEqual(
      expect.arrayContaining([
        ['application_confirmation', 'blocked'],
        ['admin_notification', 'blocked'],
      ]),
    )
  })

  it('reviews through the lifecycle, approving into a private draft business', async () => {
    const { id } = unwrap(await svc.submitApplication(application()))
    const rejectNoReason = await svc.reviewApplication(id, 'reject')
    expect(rejectNoReason.ok === false && rejectNoReason.error.fieldErrors?.reason).toBeTruthy()
    unwrap(await svc.reviewApplication(id, 'start_review'))
    const approved = unwrap(await svc.reviewApplication(id, 'approve'))
    expect(approved.status).toBe('approved')
    const biz = unwrap(await svc.getBusinessById(approved.businessId!))
    expect(biz).toMatchObject({ name: 'Atelier Norte', status: 'draft', slug: 'atelier-norte' })
    const bad = await svc.reviewApplication(id, 'reject', 'too late')
    expect(bad.ok).toBe(false)
    const events = unwrap(await svc.getAuditEvents({ applicationId: id })).items.map((e) => e.eventType)
    expect(events).toEqual(expect.arrayContaining(['application_submitted', 'application_status_changed', 'business_created']))
  })

  it('keeps one owner per business with resend cooldown', async () => {
    unwrap(await svc.provisionOwner({ businessId: 'biz_casa', email: 'Owner@Casa.test', language: 'en' }))
    const other = await svc.provisionOwner({ businessId: 'biz_casa', email: 'someone@else.test', language: 'en' })
    expect(other.ok === false && other.error.code).toBe('CONFLICT')
    expect(unwrap(await svc.getBusinessMembers('biz_casa')).map((m) => m.email)).toEqual(['owner@casa.test'])
    const tooSoon = await svc.resendOwnerInvitation('biz_casa')
    expect(tooSoon.ok === false && tooSoon.error.code).toBe('RATE_LIMITED')
    const attempts = unwrap(await svc.getEmailAttempts({ businessId: 'biz_casa' }))
    expect(attempts.every((e) => e.status === 'blocked')).toBe(true)
  })
})
