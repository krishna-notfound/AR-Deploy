import { describe, expect, it } from 'vitest'
import { emptySiteContent, normalizeSiteContent, siteAssetKind, summarizeChanges, validateContentShape, validateSiteContent, type LandingShowcase, type SiteContent } from './siteContent'

const showcase = (over: Partial<LandingShowcase> = {}): LandingShowcase => ({ title: { en: 'The Linden sofa' }, ...over })
const withShowcase = (sc: unknown): SiteContent => {
  const c = emptySiteContent()
  ;(c.landing as Record<string, unknown>).showcase = sc
  return c
}

describe('site assets', () => {
  it('names the kind of a valid path by extension, and null for anything else', () => {
    expect(siteAssetKind('landing/a1-b2.jpg')).toBe('image')
    expect(siteAssetKind('landing/a1.webp')).toBe('image')
    expect(siteAssetKind('landing/a1.glb')).toBe('glb')
    expect(siteAssetKind('landing/a1.usdz')).toBe('usdz')
    for (const bad of ['a.png', 'landing/A.png', 'landing/a/b.png', '../landing/a.png', 'landing/a.gif', 'landing/.png']) expect(siteAssetKind(bad)).toBeNull()
  })
})

describe('landing.showcase', () => {
  it('normalizes: keeps known fields, EUR only, drops junk and empty texts', () => {
    const n = normalizeSiteContent({
      landing: {
        showcase: {
          eyebrow: { en: '' },
          title: { en: 'T', pt: 'P', junk: 1 },
          text: { en: 'x' },
          dimensions: '220 x 95 cm',
          price: { amount: 10, currency: 'USD' },
          image: { path: 'landing/a.png', junk: 1 },
          model: { glb: { path: 'landing/a.glb' }, usdz: { path: 'landing/a.usdz' } },
          product: { businessSlug: 'acme', productSlug: 'chair', junk: 1 },
          junk: 1,
        },
      },
    }).landing.showcase
    expect(n).toEqual({
      title: { en: 'T', pt: 'P' },
      text: { en: 'x' },
      dimensions: '220 x 95 cm',
      price: { amount: 10, currency: 'EUR' },
      image: { path: 'landing/a.png' },
      model: { glb: { path: 'landing/a.glb' }, usdz: { path: 'landing/a.usdz' } },
      product: { businessSlug: 'acme', productSlug: 'chair' },
    })
  })

  it('validates the caps, files and the product link', () => {
    expect(validateSiteContent(withShowcase(showcase({ image: { path: 'landing/a.png' }, model: { glb: { path: 'landing/a.glb' } }, price: { amount: 5, currency: 'EUR' } })))).toEqual({})
    const errs = (sc: unknown) => validateSiteContent(withShowcase(sc))
    expect(errs(showcase({ title: { en: ' ' } }))).toEqual({ 'landing.showcase.title.en': 'required' })
    expect(errs(showcase({ title: { en: 'x'.repeat(81) } }))).toEqual({ 'landing.showcase.title.en': 'too_long' })
    expect(errs(showcase({ eyebrow: { en: 'x'.repeat(41) } }))).toEqual({ 'landing.showcase.eyebrow.en': 'too_long' })
    expect(errs(showcase({ text: { en: 'a', pt: 'x'.repeat(401) } }))).toEqual({ 'landing.showcase.text.pt': 'too_long' })
    expect(errs(showcase({ materials: { en: 'x'.repeat(121) } }))).toEqual({ 'landing.showcase.materials.en': 'too_long' })
    expect(errs(showcase({ dimensions: 'x'.repeat(81) }))).toEqual({ 'landing.showcase.dimensions': 'too_long' })
    expect(errs(showcase({ price: { amount: 0, currency: 'EUR' } }))).toEqual({ 'landing.showcase.price.amount': 'invalid_value' })
    expect(errs(showcase({ image: { path: 'landing/a.glb' } }))).toEqual({ 'landing.showcase.image': 'invalid_value' })
    expect(errs(showcase({ model: { glb: { path: 'landing/a.png' } } }))).toEqual({ 'landing.showcase.model.glb': 'invalid_value' })
    expect(errs(showcase({ model: { glb: { path: 'landing/a.glb' }, usdz: { path: 'landing/a.glb' } } }))).toEqual({ 'landing.showcase.model.usdz': 'invalid_value' })
    expect(errs(showcase({ product: { businessSlug: 'Bad', productSlug: 'ok' } }))).toEqual({ 'landing.showcase.product.businessSlug': 'invalid_slug' })
    expect(validateContentShape(withShowcase([]))).toEqual({ 'landing.showcase': 'invalid_value' })
  })

  it('accepts an uploaded collection picture and refuses a bad one', () => {
    const card = (image: unknown) => {
      const c = emptySiteContent()
      c.landing.collections = [{ id: 'a', slug: 'a', title: { en: 'A' }, image, link: { kind: 'none' }, products: [] }] as never
      return c
    }
    expect(validateSiteContent(card({ path: 'landing/a.png' }))).toEqual({})
    expect(validateSiteContent(card({ path: 'landing/a.glb' }))).toEqual({ 'landing.collections.0.image': 'invalid_value' })
    expect(normalizeSiteContent(card({ path: 'landing/a.png', junk: 1 })).landing.collections[0]!.image).toEqual({ path: 'landing/a.png' })
  })

  it('counts a showcase change once in the publish summary', () => {
    const a = emptySiteContent()
    const b = withShowcase(showcase())
    expect(summarizeChanges(a, b)).toMatchObject({ landingShowcase: 1, total: 1 })
    expect(summarizeChanges(b, b).landingShowcase).toBe(0)
    expect(summarizeChanges(b, a).landingShowcase).toBe(1)
  })
})
