// Changeable catalogue banner (ADR-0065), Supabase service: the three columns map to Business.banner and back, the public reads ask
// for banner_url only, banner files go to the business-logos bucket under the company's own folder, and a replaced banner's files are
// cleaned up but only from that folder. The client is a fake that records what it was asked.
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { PUBLIC_BUSINESS_COLUMNS, createSupabaseCatalogService, replacedBannerPaths, toBusiness, type BusinessRow } from './supabaseCatalogService'

const BASE = 'https://x.supabase.co/storage/v1/object/public/business-logos/'
const CROP = { x: 4, y: 5, width: 600, height: 300 }
const row = (over: Partial<BusinessRow> = {}): BusinessRow => ({
  id: 'b1', name: 'Casa', slug: 'casa', logo_url: null, description: '', contact_email: null, contact_phone: null, contact_website: null,
  contact_address: null, status: 'active', accent_color: '#B4441A', default_currency: 'EUR', allow_own_models: false, share_enabled: true,
  is_house: false, created_at: 'x', updated_at: 'x', ...over,
})

describe('Business row <-> Business', () => {
  it('maps the three columns to banner, leaving out the parts that are not there', () => {
    expect(toBusiness(row()).banner).toBeUndefined()
    expect(toBusiness(row({ banner_url: `${BASE}b1/c.webp` })).banner).toEqual({ url: `${BASE}b1/c.webp` })
    expect(toBusiness(row({ banner_url: `${BASE}b1/c.webp`, banner_original_url: `${BASE}b1/o.jpg`, banner_crop: CROP })).banner).toEqual({
      url: `${BASE}b1/c.webp`,
      originalUrl: `${BASE}b1/o.jpg`,
      crop: CROP,
    })
    // An original or crop without a banner cannot exist (the database refuses it); if one came back it would not show.
    expect(toBusiness(row({ banner_url: null, banner_original_url: `${BASE}b1/o.jpg`, banner_crop: CROP })).banner).toBeUndefined()
  })

  it('a visitor read lists banner_url and neither the original nor the crop', () => {
    expect(PUBLIC_BUSINESS_COLUMNS.split(', ')).toContain('banner_url')
    expect(PUBLIC_BUSINESS_COLUMNS).not.toMatch(/banner_original_url|banner_crop|description|\*/)
  })
})

describe('replacedBannerPaths: which files a banner change leaves unused', () => {
  const copy = `${BASE}b1/0a.webp`
  const original = `${BASE}b1/0b.jpg`
  const copy2 = `${BASE}b1/0c.webp`
  const old = { url: copy, originalUrl: original, crop: CROP }

  it('Edit picture: only the replaced copy goes; the original is kept', () => {
    expect(replacedBannerPaths(old, { url: copy2, originalUrl: original, crop: CROP }, 'b1')).toEqual(['b1/0a.webp'])
  })
  it('a new upload or Remove: both the copy and the original go', () => {
    expect(replacedBannerPaths(old, { url: copy2, originalUrl: `${BASE}b1/0d.png` }, 'b1').sort()).toEqual(['b1/0a.webp', 'b1/0b.jpg'])
    expect(replacedBannerPaths(old, undefined, 'b1').sort()).toEqual(['b1/0a.webp', 'b1/0b.jpg'])
  })
  it('a banner from before the crop dialog that becomes the original of its edited copy is kept', () => {
    expect(replacedBannerPaths({ url: copy }, { url: copy2, originalUrl: copy, crop: CROP }, 'b1')).toEqual([])
  })
  it('nothing changed or nothing before: nothing to remove', () => {
    expect(replacedBannerPaths(old, old, 'b1')).toEqual([])
    expect(replacedBannerPaths(undefined, old, 'b1')).toEqual([])
  })
  it("never names a file outside this company's own folder, a staging file, or an address that is not ours", () => {
    expect(replacedBannerPaths({ url: `${BASE}b2/x.webp`, originalUrl: `${BASE}new/y.webp` }, undefined, 'b1')).toEqual([])
    expect(replacedBannerPaths({ url: `${BASE}b1/../b2/x.webp` }, undefined, 'b1')).toEqual([])
    expect(replacedBannerPaths({ url: 'https://example.com/b1/x.webp', originalUrl: 'data:image/png;base64,AAAA' }, undefined, 'b1')).toEqual([])
  })
})

interface Log {
  updates: Record<string, unknown>[]
  removed: string[][]
  uploads: { bucket: string; path: string; type: string | undefined }[]
}
function fake(current: BusinessRow, log: Log, updated?: BusinessRow) {
  const builder = () => {
    let op = 'select'
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'returns', 'order']) b[m] = () => b
    b.update = (payload: Record<string, unknown>) => ((op = 'update'), log.updates.push(payload), b)
    const result = () => ({ data: op === 'update' ? (updated ?? current) : current, error: null })
    b.single = () => Promise.resolve(result())
    b.maybeSingle = () => Promise.resolve(result())
    b.then = (f: (v: unknown) => unknown) => Promise.resolve(result()).then(f)
    return b
  }
  return {
    from: builder,
    rpc: () => Promise.resolve({ data: null, error: null }),
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, _body: unknown, opts: { contentType?: string }) => (log.uploads.push({ bucket, path, type: opts.contentType }), Promise.resolve({ data: {}, error: null })),
        remove: (paths: string[]) => (log.removed.push(paths), Promise.resolve({ data: [], error: null })),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `${BASE}${p}` } }),
      }),
    },
  } as unknown as SupabaseClient
}
const log = (): Log => ({ updates: [], removed: [], uploads: [] })
const file = (name: string, type: string) => new File([new Uint8Array(8)], name, { type })

describe('updateBusiness: the banner', () => {
  const stored = row({ banner_url: `${BASE}b1/0a.webp`, banner_original_url: `${BASE}b1/0b.jpg`, banner_crop: CROP })

  it('writes the three columns together; Remove writes all three as null and cleans up the files of the folder', async () => {
    const l = log()
    const svc = createSupabaseCatalogService(fake(stored, l, row()))
    const r = await svc.updateBusiness('b1', { banner: undefined })
    expect(r.ok).toBe(true)
    expect(l.updates).toEqual([{ banner_url: null, banner_original_url: null, banner_crop: null }])
    expect(l.removed.map((p) => [...p].sort())).toEqual([['b1/0a.webp', 'b1/0b.jpg']])
  })

  it('a new banner writes url, original and crop; Edit picture removes only the replaced copy', async () => {
    const l = log()
    const next = { url: `${BASE}b1/0c.webp`, originalUrl: `${BASE}b1/0b.jpg`, crop: { ...CROP, x: 9 } }
    const svc = createSupabaseCatalogService(fake(stored, l, row({ banner_url: next.url, banner_original_url: next.originalUrl, banner_crop: next.crop })))
    const r = await svc.updateBusiness('b1', { banner: next })
    expect(r.ok && r.data.banner).toEqual(next)
    expect(l.updates).toEqual([{ banner_url: next.url, banner_original_url: next.originalUrl, banner_crop: next.crop }])
    expect(l.removed).toEqual([['b1/0a.webp']])
  })

  it('a change that does not mention the banner writes no banner column and removes no banner file', async () => {
    const l = log()
    const svc = createSupabaseCatalogService(fake(stored, l))
    await svc.updateBusiness('b1', { description: 'New text' })
    expect(l.updates).toEqual([{ description: 'New text' }])
    expect(l.removed).toEqual([])
  })
})

describe('uploadAsset: banner kinds', () => {
  it('a banner copy and its original go to the public business-logos bucket under the business folder, and return the public address', async () => {
    const l = log()
    const svc = createSupabaseCatalogService(fake(row(), l))
    const copy = await svc.uploadAsset({ kind: 'banner', file: file('banner.webp', 'image/webp'), businessId: 'b1' })
    const orig = await svc.uploadAsset({ kind: 'bannerOriginal', file: file('shop.JFIF', 'image/jpeg'), businessId: 'b1' })
    expect(l.uploads.map((u) => u.bucket)).toEqual(['business-logos', 'business-logos'])
    expect(l.uploads[0]!.path).toMatch(/^b1\/[0-9a-f-]{36}\.webp$/)
    expect(l.uploads[1]!.path).toMatch(/^b1\/[0-9a-f-]{36}\.jpg$/) // an unusual extension is normalised from the type
    expect(copy.ok && copy.data.url).toBe(`${BASE}${l.uploads[0]!.path}`)
    expect(orig.ok && orig.data.url).toBe(`${BASE}${l.uploads[1]!.path}`)
  })

  it('refuses a banner without a company (no staging folder for banners)', async () => {
    const l = log()
    const svc = createSupabaseCatalogService(fake(row(), l))
    for (const kind of ['banner', 'bannerOriginal'] as const) {
      const r = await svc.uploadAsset({ kind, file: file('b.webp', 'image/webp') })
      expect(r.ok).toBe(false)
    }
    expect(l.uploads).toEqual([])
  })
})
