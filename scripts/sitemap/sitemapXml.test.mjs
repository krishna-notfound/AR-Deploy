import { describe, expect, it } from 'vitest'
import { buildSitemapXml, escapeXml, toLastmod } from './sitemapXml.mjs'

const locs = (xml) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1])
const biz = (id, slug, extra = {}) => ({ id, slug, status: 'active', is_house: false, updated_at: '2026-11-01T10:00:00.123+00:00', ...extra })
const prod = (business_id, slug, extra = {}) => ({ business_id, slug, status: 'published', updated_at: '2026-11-10T08:00:00+00:00', ...extra })

describe('buildSitemapXml', () => {
  it('always lists the static routes on the canonical origin', () => {
    expect(locs(buildSitemapXml())).toEqual(['https://sanctus.company/', 'https://sanctus.company/apply', 'https://sanctus.company/privacy', 'https://sanctus.company/terms'])
  })

  it('lists active catalogues and published products only', () => {
    const xml = buildSitemapXml({
      businesses: [biz('1', 'casa'), biz('2', 'paused', { status: 'paused' }), biz('3', 'draft-biz', { status: 'draft' })],
      products: [prod('1', 'sofa'), prod('1', 'chair', { status: 'draft' }), prod('2', 'lamp'), prod('9', 'orphan')],
    })
    const l = locs(xml)
    expect(l).toContain('https://sanctus.company/catalog/casa')
    expect(l).toContain('https://sanctus.company/products/casa/sofa')
    expect(l.filter((u) => /chair|lamp|orphan|paused|draft-biz/.test(u))).toEqual([])
  })

  it('keeps the house business out of /catalog and /products and lists its pieces as /showcase', () => {
    const l = locs(buildSitemapXml({ businesses: [biz('h', 'sanctus-showcase', { is_house: true })], products: [prod('h', 'piece'), prod('h', 'hidden', { status: 'draft' })] }))
    expect(l).toContain('https://sanctus.company/showcase/piece')
    expect(l.filter((u) => /sanctus-showcase|hidden|\/catalog|\/products/.test(u))).toEqual([])
  })

  it('has no duplicates and no private routes', () => {
    const xml = buildSitemapXml({
      businesses: [biz('1', 'casa'), biz('1', 'casa')],
      products: [prod('1', 'sofa'), prod('1', 'sofa')],
      collectionSlugs: ['spring', 'spring'],
      pageSlugs: ['about', 'about'],
    })
    const l = locs(xml)
    expect(new Set(l).size).toBe(l.length)
    expect(l.filter((u) => /\/(admin|dashboard|login|embed|demo|join|reset-password|accept-invite|email)\b|preview/.test(u))).toEqual([])
    expect(l).toContain('https://sanctus.company/collections/spring')
    expect(l).toContain('https://sanctus.company/pages/about')
  })

  it('drops slugs that are not plain lowercase slugs, so nothing needs escaping or redirecting', () => {
    const l = locs(buildSitemapXml({ businesses: [biz('1', 'Casa'), biz('2', 'a&b'), biz('3', 'ok')], products: [prod('3', 'x<y'), prod('3', 'fine')] }))
    expect(l).toContain('https://sanctus.company/catalog/ok')
    expect(l).toContain('https://sanctus.company/products/ok/fine')
    expect(l.filter((u) => /Casa|&|<|x<y/.test(u))).toEqual([])
  })

  it('adds lastmod only from valid timestamps, as UTC W3C date-time', () => {
    const xml = buildSitemapXml({ businesses: [biz('1', 'casa')], products: [prod('1', 'sofa'), prod('1', 'bad', { updated_at: 'yesterday' }), prod('1', 'none', { updated_at: undefined })] })
    expect(xml).toContain('<loc>https://sanctus.company/products/casa/sofa</loc><lastmod>2026-11-10T08:00:00Z</lastmod>')
    expect(xml).toContain('<loc>https://sanctus.company/products/casa/bad</loc></url>')
    expect(xml).toContain('<loc>https://sanctus.company/products/casa/none</loc></url>')
    // the catalogue takes the newest of its own and its products' timestamps
    expect(xml).toContain('<loc>https://sanctus.company/catalog/casa</loc><lastmod>2026-11-10T08:00:00Z</lastmod>')
    expect(xml).toContain('<loc>https://sanctus.company/apply</loc></url>')
  })

  it('escapes XML special characters in the origin and paths', () => {
    expect(escapeXml(`a&b<c>"d"'e'`)).toBe('a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;')
    expect(buildSitemapXml({ origin: 'https://x.test/?a=1&b=2' })).toContain('https://x.test/?a=1&amp;b=2/')
  })
})

describe('toLastmod', () => {
  it('normalises, and rejects non-dates', () => {
    expect(toLastmod('2026-11-01T10:00:00.123+00:00')).toBe('2026-11-01T10:00:00Z')
    expect(toLastmod('2026-11-01T12:00:00+02:00')).toBe('2026-11-01T10:00:00Z')
    expect(toLastmod(undefined)).toBeUndefined()
    expect(toLastmod('2026-13-45T00:00:00Z')).toBeUndefined()
  })
})
