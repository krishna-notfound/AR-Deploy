import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BusinessApplication, Product } from '@/domain/types'
import type { ProductInput, Result } from '../catalogService'
import { isValidDb } from './db'
import { mockCatalogService as svc } from './mockCatalogService'
import { createSeed } from './seed'
import { DB_KEY, store } from './store'
import { mockAccountService, resetMockAccount } from './mockAccount'

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

  it('demo variants carry their own photos and models; duplicates and saves keep them', async () => {
    const src = unwrap(await svc.getProductById('prd_sheen_chair'))
    const damask = src.variants[1]!
    expect(damask.models?.glb?.url).toMatch(/ChairDamaskPurplegold\.glb$/)
    expect(damask.images?.[0]?.isPrimary).toBe(true)
    const copy = unwrap(await svc.duplicateProduct(src.id))
    expect(copy.variants[1]!.id).not.toBe(damask.id)
    expect(copy.variants[1]!.models?.glb?.url).toBe(damask.models?.glb?.url)
    expect(copy.variants[1]!.images?.[0]?.url).toBe(damask.images?.[0]?.url)
    // A save keeps variant ids and media, and leaves one primary photo per variant.
    const extra = { id: 'img_x', url: 'data:image/png;base64,AAA', isPrimary: true, kind: 'gallery' as const }
    const saved = unwrap(await svc.updateProduct(src.id, { variants: src.variants.map((v, i) => (i === 1 ? { ...v, images: [...(v.images ?? []), extra] } : v)) }))
    expect(saved.variants.map((v) => v.id)).toEqual(src.variants.map((v) => v.id))
    expect(saved.variants[1]!.images?.filter((i) => i.isPrimary)).toHaveLength(1)
  })

  it('caps options and photos per option like the database', async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ id: `v${i}`, name: { en: `V${i}` } }))
    const res = await svc.createProduct(draftInput({ slug: 'too-many', variants: many }))
    expect(res.ok === false && res.error.fieldErrors?.variants).toMatch(/50/)
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

  it('deleting a business clears businessId and sets businessDeletedAt on its application; reopen then works (R-W2-2)', async () => {
    const { id } = unwrap(await svc.submitApplication(application()))
    const approved = unwrap(await svc.reviewApplication(id, 'approve'))
    const early = await svc.reviewApplication(id, 'reopen')
    expect(early.ok === false && early.error).toMatchObject({ code: 'CONFLICT', reason: 'reopen_not_allowed', message: 'Only an approved application whose business was deleted can be reopened.' })
    unwrap(await svc.deleteBusiness(approved.businessId!))
    const after = unwrap(await svc.getApplication(id))
    expect(after.businessId).toBeUndefined()
    expect(after.businessDeletedAt).toEqual(expect.any(String))
    expect(unwrap(await svc.reviewApplication(id, 'reopen')).status).toBe('under_review')
    const reopened = unwrap(await svc.getAuditEvents({ applicationId: id })).items.find((e) => e.metadata.action === 'reopen')
    expect(reopened).toMatchObject({ eventType: 'application_status_changed', fromStatus: 'approved', toStatus: 'under_review' })
    const again = unwrap(await svc.reviewApplication(id, 'approve'))
    expect(again.businessId).toBeTruthy()
    expect(again.businessId).not.toBe(approved.businessId)
  })

  it('getApplicationDuplicates follows the SQL rule (R-W2-9)', async () => {
    const at = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
    const row = (id: string, businessName: string, applicantEmail: string, status: BusinessApplication['status'], min: number, businessId?: string): BusinessApplication => ({
      id, reference: id.toUpperCase(), status, businessName, applicantName: 'Ana', applicantEmail, country: 'Portugal', city: 'Lisboa',
      category: 'furniture', language: 'en', answers: {}, businessId, createdAt: at(min), updatedAt: at(min),
    })
    store.update((d) => {
      const ts = at(1)
      const biz = (id: string, name: string, min: number) => ({ ...d.businesses[0]!, id, name, slug: id, status: 'draft' as const, createdAt: at(min), updatedAt: ts })
      d.businesses.push(biz('b-created', 'Casa, Lda.', 1), biz('b-casa', 'Casa', 6), biz('b-owned', 'Other Shop', 7), biz('b-lda', 'Lda', 8))
      d.owners = { ...d.owners, 'b-owned': { email: 'DUP@shop.test', invitedAt: ts } }
      d.applications = [
        row('a-subject', 'Casa, Lda.', 'dup@shop.test', 'approved', 1, 'b-created'),
        row('a-email', 'Something Else', 'Dup@Shop.Test', 'approved', 5),
        row('a-name', 'casa lda', 'other@x.test', 'submitted', 4),
        row('a-both', 'Cása', 'dup@shop.test', 'under_review', 3),
        row('a-rejected', 'Casa', 'dup@shop.test', 'rejected', 2),
        row('a-lda', 'Lda', 'lda@x.test', 'submitted', 9),
        row('a-lda2', 'LDA.', 'lda2@x.test', 'submitted', 10),
      ]
    })
    const r = unwrap(await svc.getApplicationDuplicates('a-subject'))
    expect(r.applications.map((a) => [a.id, a.match])).toEqual([['a-both', 'both'], ['a-name', 'name'], ['a-email', 'email']])
    expect(r.businesses.map((b) => [b.id, b.match])).toEqual([['b-casa', 'name'], ['b-owned', 'owner_email']])
    expect(JSON.stringify(r).toLowerCase()).not.toContain('dup@shop.test')
    // An empty normalized name matches nothing.
    expect(unwrap(await svc.getApplicationDuplicates('a-lda'))).toEqual({ applications: [], businesses: [] })
    expect((await svc.getApplicationDuplicates('nope')).ok).toBe(false)
  })

  it('leaves sign-in events out of the audit log unless includeSignIns is true (R-W1-4)', async () => {
    store.update((d) => {
      d.audit = [{ id: 'evt_signin', createdAt: new Date().toISOString(), eventType: 'account_signed_in', metadata: {} }, ...(d.audit ?? [])]
    })
    const types = async (includeSignIns?: boolean) => unwrap(await svc.getAuditEvents({ includeSignIns, pageSize: 500 })).items.map((e) => e.eventType)
    expect(await types()).not.toContain('account_signed_in')
    expect(await types(false)).not.toContain('account_signed_in')
    expect(await types(true)).toContain('account_signed_in')
  })

  it('keeps one owner per business with resend cooldown', async () => {
    unwrap(await svc.provisionOwner({ businessId: 'biz_casa', email: 'Owner@Casa.test', language: 'en' }))
    const other = await svc.provisionOwner({ businessId: 'biz_casa', email: 'someone@else.test', language: 'en' })
    expect(other.ok === false && other.error.code).toBe('CONFLICT')
    expect(unwrap(await svc.getBusinessMembers('biz_casa')).map((m) => m.email)).toEqual(['owner@casa.test'])
    const tooSoon = await svc.resendOwnerInvitation('biz_casa', 'en')
    expect(tooSoon.ok === false && tooSoon.error.code).toBe('RATE_LIMITED')
    const attempts = unwrap(await svc.getEmailAttempts({ businessId: 'biz_casa' }))
    expect(attempts.every((e) => e.status === 'blocked')).toBe(true)
  })

  it('refuses to make one email the owner of a second business', async () => {
    unwrap(await svc.provisionOwner({ businessId: 'biz_casa', email: 'owner@casa.test', language: 'en' }))
    const second = await svc.provisionOwner({ businessId: 'biz_nord', email: 'Owner@Casa.test', language: 'en' })
    expect(second.ok === false && second.error.code).toBe('CONFLICT')
    expect(unwrap(await svc.getBusinessMembers('biz_nord'))).toEqual([])
  })
})

describe('closure rules (S1.5 Task 3, as the database: R-W1-2, R-W1-3)', () => {
  // The demo's one closure request names 'demo-business'; give it a business and an owner here.
  beforeEach(() => {
    resetMockAccount()
    store.update((d) => {
      const oak = d.businesses.find((b) => b.id === 'biz_oak')!
      d.businesses.push({ ...oak, id: 'demo-business', slug: 'demo-closing', name: 'Demo closing business', status: 'inactive' })
      ;(d.owners ??= {})['demo-business'] = { email: 'closing@demo.example', invitedAt: '2026-10-01T10:00:00.000Z', acceptedAt: '2026-10-02T10:00:00.000Z' }
    })
  })

  it("setBusinessStatus(…, 'active') refuses with closure_pending while a request is open; draft is allowed", async () => {
    const r = await svc.setBusinessStatus('demo-business', 'active')
    expect(r.ok === false && r.error).toEqual({
      code: 'CONFLICT',
      message: 'This business has an open closure request. Only the platform Owner can restore it or complete it.',
      reason: 'closure_pending',
    })
    expect(unwrap(await svc.setBusinessStatus('demo-business', 'draft')).status).toBe('draft')
    // The edit form's status field too.
    const viaForm = await svc.updateBusiness('demo-business', { status: 'active' })
    expect(viaForm.ok === false && viaForm.error.reason).toBe('closure_pending')
  })

  it('removeBusinessMember voids the request (account_closure_voided), keeps the status, and activation works again', async () => {
    unwrap(await svc.removeBusinessMember('demo-business', 'demo-owner-demo-business'))
    expect(unwrap(await mockAccountService.listClosureRequests())).toEqual([])
    const audit = store.get().audit ?? []
    expect(audit.find((e) => e.eventType === 'account_closure_voided')).toMatchObject({
      businessId: 'demo-business',
      metadata: { subject_id: 'demo-closing-owner', business_id: 'demo-business', reason: 'owner_removed' },
    })
    expect(unwrap(await svc.getBusinessById('demo-business')).status).toBe('inactive')
    expect(unwrap(await svc.setBusinessStatus('demo-business', 'active')).status).toBe('active')
  })
})

describe('owner invitations (S1.5 Task 17: the demo applies the reservation rules, R-W8-1 and R-W2-4)', () => {
  const HOUR = 3600 * 1000
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
  /** Adds earlier invitation attempts for a business (newest first, like the store). */
  const seedAttempts = (businessId: string, rows: { recipient: string; at: string; outcome: 'accepted' | 'sent' | 'failed' | 'blocked' }[]) =>
    store.update((d) => {
      const list = (d.ownerInviteAttempts ??= [])
      rows.forEach((r, i) => list.push({ businessId, recipient: r.recipient, attempt: 100 + i, outcome: r.outcome, createdAt: r.at }))
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    })
  const refusal = <T>(r: Result<T>) => {
    if (r.ok) throw new Error('expected a refusal')
    return r.error
  }

  it('provisionOwner for a business whose owner has the same email goes through resendOwnerInvitation: cooldown, already_accepted, and the 11th attempt in 24 h for the recipient is refused with retryAt', async () => {
    const first = unwrap(await svc.provisionOwner({ businessId: 'biz_casa', email: 'Owner@Casa.test', language: 'en' }))
    expect(first).toMatchObject({ owner: 'linked', email: { attempt: 1 } })
    const resend = vi.spyOn(svc, 'resendOwnerInvitation')

    // Inside 60 s: the cooldown, with the time it ends.
    const cooled = refusal(await svc.provisionOwner({ businessId: 'biz_casa', email: 'owner@casa.test', language: 'pt' }))
    expect(resend).toHaveBeenCalledWith('biz_casa', 'pt')
    resend.mockRestore()
    expect(cooled).toMatchObject({ code: 'RATE_LIMITED', reason: 'cooldown' })
    const reserved = store.get().ownerInviteAttempts![0]!
    expect(Date.parse(cooled.retryAt!) - Date.parse(reserved.createdAt)).toBe(60_000)

    // Nine earlier invitations to this recipient in the last 24 h, plus the first one: the next one is refused.
    store.update((d) => void (d.ownerInviteAttempts![0]!.createdAt = ago(2 * 60_000)))
    seedAttempts('biz_casa', Array.from({ length: 9 }, (_, i) => ({ recipient: 'owner@casa.test', at: ago((20 - i) * HOUR), outcome: 'accepted' as const })))
    const limited = refusal(await svc.provisionOwner({ businessId: 'biz_casa', email: 'owner@casa.test', language: 'en' }))
    expect(limited).toMatchObject({ code: 'RATE_LIMITED', reason: 'too_many_invitations' })
    expect(Date.parse(limited.retryAt!)).toBe(Date.parse(store.get().ownerInviteAttempts!.at(-1)!.createdAt) + 24 * HOUR) // the oldest of the ten, 20 h ago
    expect(store.get().ownerInviteAttempts).toHaveLength(10)

    // Once the owner accepted, there is nothing to resend.
    store.update((d) => void (d.owners!.biz_casa!.acceptedAt = ago(HOUR)))
    expect(refusal(await svc.provisionOwner({ businessId: 'biz_casa', email: 'owner@casa.test', language: 'en' }))).toMatchObject({ code: 'CONFLICT', reason: 'already_accepted' })
  })

  it("blocked demo attempts don't count", async () => {
    store.update((d) => void ((d.owners ??= {}).biz_nord = { email: 'owner@nord.test', invitedAt: ago(HOUR) }))
    seedAttempts('biz_nord', Array.from({ length: 10 }, (_, i) => ({ recipient: 'owner@nord.test', at: ago(i * 1000), outcome: 'blocked' as const })))
    const sent = unwrap(await svc.resendOwnerInvitation('biz_nord', 'en'))
    expect(sent.email.attempt).toBe(110) // continues after the highest attempt number
    expect(store.get().ownerInviteAttempts![0]).toMatchObject({ businessId: 'biz_nord', recipient: 'owner@nord.test', attempt: 110, outcome: 'accepted' })
    // The demo email itself stays honestly logged as not sent.
    expect(unwrap(await svc.getEmailAttempts({ businessId: 'biz_nord' }))[0]).toMatchObject({ status: 'blocked', error: 'demo_mode', attempt: 110, workflow: 'invite:biz_nord' })
  })

  it('getOwnerStates mirrors the SQL states', async () => {
    unwrap(await svc.provisionOwner({ businessId: 'biz_casa', email: 'owner@casa.test', language: 'en' }))
    const invitedAt = store.get().ownerInviteAttempts![0]!.createdAt
    const verdeAt = ago(30 * HOUR)
    store.update((d) => {
      d.owners!.biz_oak = { email: 'owner@oak.test', invitedAt: ago(48 * HOUR), acceptedAt: ago(47 * HOUR) }
      // Invited before attempts were kept: only email rows.
      d.owners!.biz_verde = { email: 'owner@verde.test', invitedAt: verdeAt }
      d.emails!.push({ id: 'eml_v1', createdAt: verdeAt, updatedAt: verdeAt, kind: 'owner_invitation', recipient: 'owner@verde.test', subject: 'Invite', status: 'delivered', businessId: 'biz_verde', workflow: 'invite:biz_verde', attempt: 1 })
    })
    const states = async () => new Map(unwrap(await svc.getOwnerStates()).map((s) => [s.businessId, s]))
    let byId = await states()
    expect(byId.get('biz_nord')).toEqual({ businessId: 'biz_nord', state: 'needs_owner', lastInvitedAt: null, emailFailed: false })
    expect(byId.get('biz_casa')).toEqual({ businessId: 'biz_casa', state: 'invite_pending', lastInvitedAt: invitedAt, emailFailed: false })
    expect(byId.get('biz_verde')).toEqual({ businessId: 'biz_verde', state: 'invite_pending', lastInvitedAt: verdeAt, emailFailed: false })
    expect(byId.get('biz_oak')).toMatchObject({ state: 'owner_active' })

    // The newest attempt blocked, or its email bounced; with no attempt, the newest email decides.
    store.update((d) => {
      d.ownerInviteAttempts![0]!.outcome = 'blocked'
      d.emails!.find((e) => e.id === 'eml_v1')!.status = 'bounced'
    })
    byId = await states()
    expect(byId.get('biz_casa')!.emailFailed).toBe(true)
    expect(byId.get('biz_verde')!.emailFailed).toBe(true)
    store.update((d) => {
      d.ownerInviteAttempts![0]!.outcome = 'accepted'
      d.emails!.find((e) => e.workflow === 'invite:biz_casa' && e.attempt === 1)!.status = 'complained'
    })
    expect((await states()).get('biz_casa')!.emailFailed).toBe(true)
  })
})

describe('history and owner notices (S1.5 Task 11: R-W7-1, R-W7-2)', () => {
  const asStaff = (platformRole: 'owner' | 'admin' | 'team') => localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole }))
  const notices = () => (store.get().emails ?? []).filter((e) => e.kind === 'business_notice')
  beforeEach(() => {
    store.update((d) => {
      ;(d.owners ??= {}).biz_casa = { email: 'owner@casa.example', invitedAt: '2026-10-01T10:00:00.000Z', acceptedAt: '2026-10-02T10:00:00.000Z' }
    })
  })

  it('an Admin pause records one demo business_notice for the owner, labelled demo mode; the row is labelled Admin with the business name', async () => {
    asStaff('admin')
    unwrap(await svc.setBusinessStatus('biz_casa', 'inactive'))
    const event = (store.get().audit ?? []).find((e) => e.eventType === 'business_status_changed')!
    expect(event.metadata).toMatchObject({ actor_label: 'Admin', business_name: expect.any(String) })
    expect(notices()).toEqual([
      expect.objectContaining({ recipient: 'owner@casa.example', subject: 'Your Sanctus catalog has been paused', status: 'blocked', error: 'demo_mode', workflow: `business_notice:${event.id}` }),
    ])
    expect(unwrap(await svc.getPlatformChanges('biz_casa')).map((e) => [e.eventType, e.actorLabel])).toEqual([['business_status_changed', 'Admin']])
  })

  it("a business owner's own change records no notice and is not a platform change", async () => {
    unwrap(await svc.setBusinessStatus('biz_casa', 'inactive'))
    expect(notices()).toEqual([])
    expect(unwrap(await svc.getPlatformChanges('biz_casa'))).toEqual([])
  })

  it('unpublish and delete by the Team record a notice each', async () => {
    asStaff('team')
    const p = unwrap(await svc.getProductsByBusiness('biz_casa')).find((x) => x.status === 'published')!
    unwrap(await svc.unpublishProduct(p.id))
    unwrap(await svc.deleteProduct(p.id))
    expect(notices().map((e) => e.subject).sort()).toEqual(['A product was removed from your catalog', 'A product was unpublished from your catalog'])
  })

  it('after a business is deleted, its rows still filter by the business and read its name, marked deleted', async () => {
    asStaff('owner')
    unwrap(await svc.setBusinessStatus('biz_casa', 'inactive'))
    const name = unwrap(await svc.getBusinessById('biz_casa')).name
    unwrap(await svc.deleteBusiness('biz_casa'))
    const rows = unwrap(await svc.getAuditEvents({ businessId: 'biz_casa' })).items
    expect(rows.map((e) => e.eventType)).toEqual(expect.arrayContaining(['business_deleted', 'business_status_changed']))
    for (const e of rows) expect(e).toMatchObject({ businessName: name, businessDeleted: true })
    expect(rows.filter((e) => e.eventType.startsWith('business_') && e.eventType !== 'business_created').map((e) => e.actorLabel)).toEqual(['Owner', 'Owner'])
  })
})
