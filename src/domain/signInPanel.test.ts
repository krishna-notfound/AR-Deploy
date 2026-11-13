// The sign-in panel and the catalogue heading in the site content (ADR-0067): normalize, validate, the publish summary and the
// Website Editor's picture size limit.
import { describe, expect, it } from 'vitest'
import {
  MAX_CATALOG_HEADING,
  SIGN_IN_PAGES,
  SIGN_IN_TEXT_LIMITS,
  SITE_ASSET_MAX_BYTES,
  emptySiteContent,
  normalizeSiteContent,
  summarizeChanges,
  validateSiteContent,
  type SiteContent,
} from './siteContent'

const PIC = { path: 'landing/11111111-1111-4111-8111-111111111111.webp', originalPath: 'landing/22222222-2222-4222-8222-222222222222.jpg', crop: { x: 0, y: 0, width: 400, height: 500 } }
const withChrome = (chrome: unknown): SiteContent => ({ ...emptySiteContent(), chrome } as SiteContent)

describe('the lists', () => {
  it('names every page that uses the sign-in layout, and the five panel texts with their limits', () => {
    expect(SIGN_IN_PAGES).toEqual(['login', 'apply', 'join', 'resetPassword', 'acceptInvite', 'demo'])
    expect(SIGN_IN_TEXT_LIMITS).toEqual({ eyebrow: 60, title: 120, body: 400, tag1: 40, tag2: 40 })
    expect(MAX_CATALOG_HEADING).toBe(80)
  })

  it('a Website Editor picture may be up to 25 MB; the other kinds keep their limits', () => {
    expect(SITE_ASSET_MAX_BYTES).toEqual({ image: 25 * 1024 * 1024, glb: 30 * 1024 * 1024, usdz: 40 * 1024 * 1024, favicon: 1024 * 1024 })
  })
})

describe('normalizeSiteContent: chrome.signIn and chrome.catalogHeading', () => {
  it('keeps texts with text and pictures of known pages, with their original and crop', () => {
    const n = normalizeSiteContent({
      chrome: {
        signIn: { texts: { title: { en: 'Made to last', pt: 'Feito para durar' }, tag1: { pt: 'Autoral' } }, pictures: { login: PIC, apply: { path: PIC.path } } },
        catalogHeading: { en: 'Our pieces', pt: 'As nossas peças' },
      },
    })
    expect(n.chrome).toEqual({
      signIn: { texts: { title: { en: 'Made to last', pt: 'Feito para durar' }, tag1: { pt: 'Autoral' } }, pictures: { login: PIC, apply: { path: PIC.path } } },
      catalogHeading: { en: 'Our pieces', pt: 'As nossas peças' },
    })
  })

  it('an empty text is the built-in one: it is dropped, and so is an emptied panel or heading', () => {
    const n = normalizeSiteContent({ chrome: { signIn: { texts: { title: { en: '', pt: '' }, body: { en: 'x' } }, pictures: {} }, catalogHeading: { en: '' } } })
    expect(n.chrome).toEqual({ signIn: { texts: { body: { en: 'x' } } } })
    expect(normalizeSiteContent({ chrome: { signIn: { texts: { title: { en: '' } } }, catalogHeading: {} } }).chrome).toBeUndefined()
  })

  it('drops unknown keys, unknown pages and malformed pictures', () => {
    const n = normalizeSiteContent({ chrome: { signIn: { texts: { slogan: { en: 'x' }, eyebrow: 'x' }, pictures: { home: PIC, join: 'landing/a.png', demo: PIC }, other: 1 }, catalogHeading: 'x' } })
    expect(n.chrome).toEqual({ signIn: { pictures: { demo: PIC } } })
  })

  it('keeps the banner and the favicon next to them', () => {
    const icon = { path: 'landing/33333333-3333-4333-8333-333333333333.png' }
    const n = normalizeSiteContent({ chrome: { favicon: icon, catalogBanner: PIC, catalogHeading: { pt: 'Peças' } } })
    expect(n.chrome).toEqual({ favicon: icon, catalogBanner: PIC, catalogHeading: { pt: 'Peças' } })
  })
})

describe('validateSiteContent: chrome.signIn and chrome.catalogHeading', () => {
  it('accepts texts within their limits and uploaded pictures', () => {
    const texts = Object.fromEntries(Object.entries(SIGN_IN_TEXT_LIMITS).map(([k, max]) => [k, { en: 'a'.repeat(max), pt: 'b'.repeat(max) }]))
    const pictures = Object.fromEntries(SIGN_IN_PAGES.map((p) => [p, PIC]))
    expect(validateSiteContent(withChrome({ signIn: { texts, pictures }, catalogHeading: { en: 'a'.repeat(MAX_CATALOG_HEADING), pt: '' } }))).toEqual({})
  })

  it('refuses a text over its limit, an unknown text, an unknown page and a picture that is not an uploaded image', () => {
    expect(validateSiteContent(withChrome({ signIn: { texts: { title: { pt: 'a'.repeat(121) } } } }))).toEqual({ 'chrome.signIn.texts.title.pt': 'too_long' })
    expect(validateSiteContent(withChrome({ signIn: { texts: { tag2: { en: 5 } } } }))).toEqual({ 'chrome.signIn.texts.tag2.en': 'invalid_value' })
    expect(validateSiteContent(withChrome({ signIn: { texts: { slogan: { en: 'x' } } } }))).toEqual({ 'chrome.signIn.texts.slogan': 'unknown_key' })
    expect(validateSiteContent(withChrome({ signIn: { texts: { body: 'x' } } }))).toEqual({ 'chrome.signIn.texts.body': 'invalid_value' })
    expect(validateSiteContent(withChrome({ signIn: { pictures: { home: PIC } } }))).toEqual({ 'chrome.signIn.pictures.home': 'unknown_key' })
    expect(validateSiteContent(withChrome({ signIn: { pictures: { login: { path: 'landing/a.glb' } } } }))).toEqual({ 'chrome.signIn.pictures.login': 'invalid_value' })
    expect(validateSiteContent(withChrome({ signIn: { pictures: { join: { ...PIC, crop: { x: 0 } } } } }))).toEqual({ 'chrome.signIn.pictures.join.crop': 'invalid_value' })
    expect(validateSiteContent(withChrome({ signIn: 'x' }))).toEqual({ 'chrome.signIn': 'invalid_value' })
    expect(validateSiteContent(withChrome({ signIn: { slogan: {} } }))).toEqual({ 'chrome.signIn.slogan': 'unknown_key' })
  })

  it('refuses a heading over its limit, a heading that is not text and an unknown language', () => {
    expect(validateSiteContent(withChrome({ catalogHeading: { en: 'a'.repeat(81) } }))).toEqual({ 'chrome.catalogHeading.en': 'too_long' })
    expect(validateSiteContent(withChrome({ catalogHeading: { pt: 1 } }))).toEqual({ 'chrome.catalogHeading.pt': 'invalid_value' })
    expect(validateSiteContent(withChrome({ catalogHeading: { fr: 'x' } }))).toEqual({ 'chrome.catalogHeading.fr': 'unknown_key' })
    expect(validateSiteContent(withChrome({ catalogHeading: 'x' }))).toEqual({ 'chrome.catalogHeading': 'invalid_value' })
  })
})

describe('summarizeChanges', () => {
  it('counts each panel text per language and each page picture, and the heading per language', () => {
    const a = emptySiteContent()
    const b = withChrome({ signIn: { texts: { title: { en: 'A', pt: 'B' } }, pictures: { login: PIC } }, catalogHeading: { pt: 'Peças' } })
    expect(summarizeChanges(a, b)).toMatchObject({ signInPanel: 3, catalogHeading: 1, total: 4 })
    expect(summarizeChanges(b, b)).toMatchObject({ signInPanel: 0, catalogHeading: 0, total: 0 })
    const c = withChrome({ signIn: { texts: { title: { en: 'A', pt: 'B' } }, pictures: { login: { ...PIC, crop: { ...PIC.crop, x: 9 } }, join: PIC } }, catalogHeading: { pt: 'Peças' } })
    expect(summarizeChanges(b, c)).toMatchObject({ signInPanel: 2, catalogHeading: 0, total: 2 })
  })
})
