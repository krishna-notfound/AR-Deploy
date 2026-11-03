import { describe, expect, it } from 'vitest'
import { MAX_HERO_ALT, emptySiteContent, normalizeSiteContent, validateSiteContent } from './siteContent'

// The landing hero's own picture and in-place 3D model (owner 2026-11-04).
describe('landing.hero', () => {
  it('keeps the picture, the model and the description, and drops anything else', () => {
    const doc = normalizeSiteContent({
      landing: { collections: [], hero: { image: { path: 'landing/hero.jpg' }, model: { glb: { path: 'landing/sofa.glb' }, usdz: 'x' }, alt: { en: 'Oak sofa', pt: 'Sofá de carvalho' }, extra: 1 } },
    })
    expect(doc.landing.hero).toEqual({ image: { path: 'landing/hero.jpg' }, model: { glb: { path: 'landing/sofa.glb' } }, alt: { en: 'Oak sofa', pt: 'Sofá de carvalho' } })
  })

  it('accepts a valid hero and refuses a model that is not a .glb, a picture that is not an image, and a long description', () => {
    const ok = { ...emptySiteContent(), landing: { collections: [], hero: { image: { path: 'landing/hero.webp' }, model: { glb: { path: 'landing/sofa.glb' } } } } }
    expect(validateSiteContent(ok)).toEqual({})
    const bad = {
      ...emptySiteContent(),
      landing: { collections: [], hero: { image: { path: 'landing/hero.glb' }, model: { glb: { path: 'landing/sofa.png' } }, alt: { en: 'x'.repeat(MAX_HERO_ALT + 1) } } },
    }
    const errors = validateSiteContent(bad)
    expect(Object.keys(errors).sort()).toEqual(['landing.hero.alt.en', 'landing.hero.image', 'landing.hero.model.glb'])
  })
})
