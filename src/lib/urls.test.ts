import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AR_FALLBACK_HASH, AR_PROXY_PATH, AR_PROXY_SOURCE, arProxyUrl, catalogLocalPath, needsPreview, quickLookHref, sceneViewerIntentUrl, settingsPath } from './urls'

describe('needsPreview', () => {
  it('needsPreview is false only for a published product in an active business', () => {
    expect(needsPreview({ status: 'published' }, { status: 'active' })).toBe(false)
    expect(needsPreview({ status: 'draft' }, { status: 'active' })).toBe(true)
    expect(needsPreview({ status: 'published' }, { status: 'draft' })).toBe(true)
    expect(needsPreview({ status: 'published' }, { status: 'inactive' })).toBe(true)
    expect(needsPreview({ status: 'draft' }, { status: 'draft' })).toBe(true)
  })
})

describe('settingsPath', () => {
  it("settingsPath('business') is /dashboard/settings/account; settingsPath('admin','security') is /admin/settings/security", () => {
    expect(settingsPath('business')).toBe('/dashboard/settings/account')
    expect(settingsPath('admin', 'security')).toBe('/admin/settings/security')
    expect(settingsPath('admin')).toBe('/admin/settings/account')
    expect(settingsPath('business', 'security-policy')).toBe('/dashboard/settings/security-policy')
  })
})

describe('catalogLocalPath', () => {
  it("catalogLocalPath({slug:'casa'}, {category:'sofas'}) is '/catalog/casa?category=sofas'", () => {
    expect(catalogLocalPath({ slug: 'casa' }, { category: 'sofas' })).toBe('/catalog/casa?category=sofas')
  })
  it("with preview too: '/catalog/casa?category=sofas&preview=1'", () => {
    expect(catalogLocalPath({ slug: 'casa' }, { category: 'sofas', preview: true })).toBe('/catalog/casa?category=sofas&preview=1')
  })
  it("with no options: '/catalog/casa'", () => {
    expect(catalogLocalPath({ slug: 'casa' })).toBe('/catalog/casa')
    expect(catalogLocalPath({ slug: 'casa' }, { preview: true })).toBe('/catalog/casa?preview=1')
  })
})

describe('S4 Task 2: model request URLs', () => {
  it("modelRequestsAdminPath({status:'open', businessId:'b1'}) = '/admin/model-requests?status=open&business=b1'", async () => {
    const { modelRequestsAdminPath } = await import('./urls')
    expect(modelRequestsAdminPath({ status: 'open', businessId: 'b1' })).toBe('/admin/model-requests?status=open&business=b1')
    expect(modelRequestsAdminPath()).toBe('/admin/model-requests')
  })
  it("modelRequestAdminPath('r1') = '/admin/model-requests/r1'", async () => {
    const { modelRequestAdminPath } = await import('./urls')
    expect(modelRequestAdminPath('r1')).toBe('/admin/model-requests/r1')
  })
  it("myProductsPath({model:'open'}) = '/dashboard/products?model=open'", async () => {
    const { myProductsPath } = await import('./urls')
    expect(myProductsPath({ model: 'open' })).toBe('/dashboard/products?model=open')
  })
})

// Native AR launch (ADR-0021, owner 2026-10-26): Android opens Scene Viewer directly, iPhone opens Quick Look directly.
describe('native AR launch URLs', () => {
  // A Supabase signed URL: its own query string carries the token (AR-12).
  const SIGNED = 'https://x.supabase.co/storage/v1/object/sign/product-media/b/p.glb?token=eyJ.abc-_.def'
  const PAGE = 'https://sanctus.example/products/casa/sofa?variant=v2#top'
  const params = (intent: string) => new URLSearchParams(intent.slice(intent.indexOf('?') + 1, intent.indexOf('#Intent')))

  it('builds the Scene Viewer intent with the exact model URL, the title and a fallback to the page', () => {
    const intent = sceneViewerIntentUrl({ file: SIGNED, title: 'Glam Sofa & Co', pageUrl: PAGE, trueToSize: true })
    expect(intent.startsWith('intent://arvr.google.com/scene-viewer/1.2?file=')).toBe(true)
    expect(intent).toContain('#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=')
    expect(intent.endsWith(';end;')).toBe(true)
    const q = params(intent)
    // Regression (blank Scene Viewer with signed URLs): the decoded file is the exact model URL, its token once,
    // and the token never leaks out as a parameter of its own (model-viewer copied it to the top level).
    expect(q.get('file')).toBe(SIGNED)
    expect([...q.keys()]).toEqual(['file', 'mode', 'title', 'resizable'])
    expect(intent.match(/token/g)).toHaveLength(1)
    expect(intent).toContain(`file=${encodeURIComponent(SIGNED)}&`)
    expect(q.get('mode')).toBe('ar_preferred')
    expect(q.get('title')).toBe('Glam Sofa & Co')
    expect(q.get('resizable')).toBe('false')
    const fallback = decodeURIComponent(intent.split('S.browser_fallback_url=')[1]!.replace(/;end;$/, ''))
    expect(fallback).toBe(`https://sanctus.example/products/casa/sofa?variant=v2${AR_FALLBACK_HASH}`)
  })

  it('leaves the size adjustable when the model is not verified true to size', () => {
    const q = params(sceneViewerIntentUrl({ file: SIGNED, title: 'Sofa', pageUrl: PAGE, trueToSize: false }))
    expect(q.has('resizable')).toBe(false)
  })

  it('resolves a relative model URL against the page', () => {
    const q = params(sceneViewerIntentUrl({ file: '/models/a.glb', title: 'A', pageUrl: PAGE, trueToSize: false }))
    expect(q.get('file')).toBe('https://sanctus.example/models/a.glb')
  })

  it('builds the Quick Look href from the USDZ URL, locking the size only when true to size', () => {
    const usdz = 'https://x.supabase.co/storage/v1/object/sign/product-media/b/p.usdz?token=t1'
    expect(quickLookHref(usdz, { trueToSize: true, pageUrl: PAGE })).toBe(`${usdz}#allowsContentScaling=0`)
    expect(quickLookHref(usdz, { trueToSize: false, pageUrl: PAGE })).toBe(usdz)
    expect(quickLookHref('/m/a.usdz', { trueToSize: false, pageUrl: PAGE })).toBe('https://sanctus.example/m/a.usdz')
  })
})

describe('arProxyUrl (phone AR files from the site domain)', () => {
  const pub = `${AR_PROXY_SOURCE}b1/p1/base/glb-m.glb`
  it('maps a public ar-models copy to /ar/… when the rewrite is on, and leaves it alone otherwise', () => {
    expect(arProxyUrl(pub, true)).toBe('/ar/b1/p1/base/glb-m.glb')
    expect(arProxyUrl(pub, false)).toBe(pub)
  })
  it('never maps another URL (another project, a signed URL, a sample)', () => {
    for (const u of ['https://other.supabase.co/storage/v1/object/public/ar-models/b1/x.glb', 'https://x.supabase.co/storage/v1/object/sign/product-media/a.glb?token=t', 'https://raw.githubusercontent.com/a.glb'])
      expect(arProxyUrl(u, true)).toBe(u)
  })
  it('vercel.json rewrites /ar/ to the same folder, before the app fallback, which skips /ar/', () => {
    const cfg = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as { rewrites: { source: string; destination: string }[] }
    expect(cfg.rewrites[0]).toEqual({ source: `${AR_PROXY_PATH}:path*`, destination: `${AR_PROXY_SOURCE}:path*` })
    const spa = cfg.rewrites.find((r) => r.destination === '/index.html')!
    expect(new RegExp(`^${spa.source}$`).test('/ar/b1/p1/base/glb-m.glb')).toBe(false)
    expect(new RegExp(`^${spa.source}$`).test('/products/b/p')).toBe(true)
  })
})
