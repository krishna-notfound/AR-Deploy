// @vitest-environment node
// Real-API checks against a Supabase project with the migrations applied (design/19 "Tests after migration").
// Skipped unless SUPABASE_IT_URL, SUPABASE_IT_KEY (publishable) and SUPABASE_IT_PASSWORD are set, and the
// QA users qa-admin@ / qa-owner-a@ / qa-owner-b@furnish.example exist (qa-admin listed in platform_admins).
// Creates two QA businesses and deletes them (and their files) at the end.
import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Product } from '@/domain/types'
import type { CatalogService, ProductInput } from '../catalogService'
import { createSupabaseAuthService } from './auth'
import { LOGO_BUCKET, MEDIA_BUCKET, createSupabaseCatalogService } from './supabaseCatalogService'

const URL_ = process.env.SUPABASE_IT_URL ?? ''
const KEY = process.env.SUPABASE_IT_KEY ?? ''
const PASSWORD = process.env.SUPABASE_IT_PASSWORD ?? ''
const enabled = !!(URL_ && KEY && PASSWORD)

const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]) // "glTF" v2 header only
const USDZ = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]) // zip local-file header only

interface Actor {
  sb: SupabaseClient
  svc: CatalogService
}
async function signIn(email: string): Promise<Actor> {
  const sb = client()
  const { error } = await sb.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`)
  return { sb, svc: createSupabaseCatalogService(sb) }
}
function must<T>(r: { ok: true; data: T } | { ok: false; error: { code: string; message: string } }): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`)
  return r.data
}

describe.skipIf(!enabled)('Supabase live API', () => {
  const tag = Math.random().toString(36).slice(2, 8)
  let admin: Actor, ownerA: Actor, ownerB: Actor
  const anon: Actor = enabled ? { sb: client(), svc: createSupabaseCatalogService(client()) } : (null as never)
  let bizA = '', bizB = ''
  let draftA: Product
  const uploaded: { bucket: string; path: string }[] = []

  const productInput = (businessId: string, over: Partial<ProductInput> = {}): ProductInput => ({
    businessId,
    slug: `qa-chair-${tag}`,
    name: { en: 'QA Chair', pt: 'Cadeira QA' },
    shortDescription: { en: 'Test product' },
    description: { en: '' },
    category: 'chair',
    price: 12900,
    currency: 'EUR',
    images: [],
    models: {},
    dimensions: { width: 50, height: 80, depth: 55, unit: 'cm' },
    material: { en: 'Oak' },
    variants: [{ id: 'v1', name: { en: 'Natural' }, colorHex: '#C8A27A' }],
    cta: { label: { en: 'Contact' } },
    ...over,
  })

  beforeAll(async () => {
    ;[admin, ownerA, ownerB] = await Promise.all([signIn('qa-admin@furnish.example'), signIn('qa-owner-a@furnish.example'), signIn('qa-owner-b@furnish.example')])
    const base = { description: 'QA', contact: {}, status: 'active' as const, branding: { accentColor: '#B4441A' }, defaultCurrency: 'EUR' as const }
    bizA = must(await admin.svc.createBusiness({ ...base, name: `QA A ${tag}`, slug: `qa-a-${tag}` })).id
    bizB = must(await admin.svc.createBusiness({ ...base, name: `QA B ${tag}`, slug: `qa-b-${tag}` })).id
    const uid = async (a: Actor) => (await a.sb.auth.getUser()).data.user!.id
    const { error } = await admin.sb.from('business_members').insert([
      { business_id: bizA, user_id: await uid(ownerA) },
      { business_id: bizB, user_id: await uid(ownerB) },
    ])
    if (error) throw new Error(error.message)
  }, 60_000)

  afterAll(async () => {
    if (!admin) return
    for (const f of uploaded) await admin.sb.storage.from(f.bucket).remove([f.path])
    for (const id of [bizA, bizB].filter(Boolean)) await admin.svc.deleteBusiness(id)
  }, 60_000)

  it('resolves roles from platform_admins / business_members, not from the client', async () => {
    expect(must(await createSupabaseAuthService(admin.sb).getCurrentUser())?.user?.role).toBe('super_admin')
    const a = must(await createSupabaseAuthService(ownerA.sb).getCurrentUser())
    expect(a?.user).toMatchObject({ role: 'business_admin', businessId: bizA })
    const bad = await createSupabaseAuthService(client()).signInWithPassword('qa-owner-a@furnish.example', 'wrong-password')
    expect(bad.ok).toBe(false)
  })

  it('owner uploads image, GLB and USDZ into their own folder and saves a draft', async () => {
    const up = async (kind: 'image' | 'glb' | 'usdz', bytes: Uint8Array<ArrayBuffer>, name: string, type: string) => {
      const r = must(await ownerA.svc.uploadAsset({ kind, businessId: bizA, file: new File([bytes], name, { type }) }))
      expect(r.storagePath?.startsWith(`${bizA}/`)).toBe(true)
      uploaded.push({ bucket: MEDIA_BUCKET, path: r.storagePath! })
      return r
    }
    const img = await up('image', PNG, 'qa.png', 'image/png')
    const glb = await up('glb', GLB, 'qa.glb', '')
    const usdz = await up('usdz', USDZ, 'qa.usdz', '')
    draftA = must(
      await ownerA.svc.createProduct(
        productInput(bizA, {
          images: [{ id: 'i1', url: img.url, storagePath: img.storagePath, isPrimary: true, kind: 'gallery' }],
          models: {
            glb: { format: 'glb', url: glb.url, storagePath: glb.storagePath, fileName: 'qa.glb', status: 'valid' },
            usdz: { format: 'usdz', url: usdz.url, storagePath: usdz.storagePath, fileName: 'qa.usdz', status: 'valid' },
          },
        }),
      ),
    )
    expect(draftA.status).toBe('draft')
    expect(draftA.images[0]?.storagePath).toBe(img.storagePath)
    expect(draftA.models.glb?.url).toMatch(/token=/) // signed URL, not a public one
    expect(draftA.variants).toHaveLength(1)
  })

  it('isolates businesses: no reading, writing or publishing into another business', async () => {
    expect((await ownerB.svc.getProductById(draftA.id)).ok).toBe(false)
    expect((await ownerB.svc.updateProduct(draftA.id, { price: 1 })).ok).toBe(false)
    expect((await ownerB.svc.publishProduct(draftA.id)).ok).toBe(false)
    expect((await ownerB.svc.deleteProduct(draftA.id)).ok).toBe(false)
    const intoA = await ownerB.svc.createProduct(productInput(bizA, { slug: `qa-intruder-${tag}` }))
    expect(intoA.ok === false && intoA.error.code).toBe('PERMISSION')
    // Uploading into someone else's folder is refused by storage policies.
    const foreign = await ownerB.svc.uploadAsset({ kind: 'image', businessId: bizA, file: new File([PNG], 'x.png', { type: 'image/png' }) })
    expect(foreign.ok).toBe(false)
  })

  it('refuses to reference another business’s private file', async () => {
    const pathA = draftA.images[0]!.storagePath!
    const res = await ownerB.svc.createProduct(
      productInput(bizB, { slug: `qa-steal-${tag}`, images: [{ id: 'x', url: 'https://x.example/x', storagePath: pathA, isPrimary: true, kind: 'gallery' }] }),
    )
    expect(res.ok).toBe(false)
  })

  it('keeps draft files private until the product is published', async () => {
    const pathA = draftA.images[0]!.storagePath!
    expect((await anon.sb.storage.from(MEDIA_BUCKET).createSignedUrl(pathA, 60)).error).not.toBeNull()
    expect((await ownerB.sb.storage.from(MEDIA_BUCKET).createSignedUrl(pathA, 60)).error).not.toBeNull()
    expect((await anon.sb.storage.from(MEDIA_BUCKET).download(pathA)).error).not.toBeNull()
    const pub = await anon.svc.getPublicProduct(`qa-a-${tag}`, `qa-chair-${tag}`)
    expect(pub.ok === false && pub.error.code).toBe('NOT_FOUND')
  })

  it('owner cannot change their catalog address or status', async () => {
    const r = await ownerA.svc.setBusinessStatus(bizA, 'inactive')
    expect(r.ok === false && r.error.code).toBe('PERMISSION')
    const s = await ownerA.svc.updateBusiness(bizA, { slug: `qa-renamed-${tag}` })
    expect(s.ok).toBe(false)
  })

  it('publishes, then the public can see the product and fetch its files via signed URLs', async () => {
    must(await ownerA.svc.publishProduct(draftA.id))
    const { product } = must(await anon.svc.getPublicProduct(`qa-a-${tag}`, `qa-chair-${tag}`))
    expect(product.status).toBe('published')
    const res = await fetch(product.images[0]!.url)
    expect(res.status).toBe(200)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG)
    expect((await fetch(product.models.glb!.url)).status).toBe(200)
  })

  it('records anonymous analytics (insert only) and shows them to the owner only', async () => {
    must(await anon.svc.recordEvent({ productId: draftA.id, businessId: bizA, type: 'view' }))
    must(await anon.svc.recordEvent({ productId: draftA.id, businessId: bizA, type: 'ar_activation' }))
    expect((await anon.sb.from('product_analytics').select('id')).error).not.toBeNull()
    const forged = await anon.sb.from('product_analytics').insert({ product_id: draftA.id, business_id: bizA, event_type: 'view', created_at: '2020-01-01T00:00:00Z' })
    expect(forged.error?.code).toBe('42501')
    const wrongBiz = await anon.svc.recordEvent({ productId: draftA.id, businessId: bizB, type: 'view' })
    expect(wrongBiz.ok).toBe(false)
    const s = must(await ownerA.svc.getBusinessAnalytics(bizA))
    expect(s.isSample).toBe(false)
    expect(s.totals.views).toBe(1)
    expect(s.totals.arActivations).toBe(1)
    // Another owner can see that the (active) business exists, but RLS hides its events.
    const asB = must(await ownerB.svc.getBusinessAnalytics(bizA))
    expect(asB.totals.views + asB.totals.arActivations).toBe(0)
  })

  it('unpublishing hides the product and its files again', async () => {
    must(await ownerA.svc.unpublishProduct(draftA.id))
    expect((await anon.svc.getPublicProduct(`qa-a-${tag}`, `qa-chair-${tag}`)).ok).toBe(false)
    expect((await anon.sb.storage.from(MEDIA_BUCKET).createSignedUrl(draftA.images[0]!.storagePath!, 60)).error).not.toBeNull()
  })

  it('public logo bucket accepts the owner’s logo and refuses SVG', async () => {
    const logo = must(await ownerA.svc.uploadAsset({ kind: 'logo', businessId: bizA, file: new File([PNG], 'logo.png', { type: 'image/png' }) }))
    uploaded.push({ bucket: LOGO_BUCKET, path: logo.url.split(`/${LOGO_BUCKET}/`)[1]! })
    expect((await fetch(logo.url)).status).toBe(200)
    const svg = await ownerA.svc.uploadAsset({ kind: 'logo', businessId: bizA, file: new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }) })
    expect(svg.ok).toBe(false)
  })
})
